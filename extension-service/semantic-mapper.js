// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl Semantic Mapper — extension-service/semantic-mapper.js
// Phase 4.3 — Cold-Start Semantic Mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Orchestrates AI-powered mapping for unknown form fields.
// Server-only — AI calls NEVER originate from the extension.
//
// Responsibilities:
//   - Receive PageSnapshot fields with no existing field_mapping knowledge
//   - Classify fields into eligibility categories
//   - Gate: only PROFILE_DATA and DERIVED_DATA enter AI mapping
//   - Call prompt-builder to create structured mapping prompts
//   - Call AI via ai-key-manager
//   - Evaluate confidence via confidence-evaluator
//   - Store results as candidate field_mapping records (status: draft)
//   - Rate-limit AI calls to prevent abuse/cost overrun
//
// Does NOT own: fill planning, action plan construction, session tracking.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { classifyField, FieldClassification, isEligibleForFill } from './mapping-engine.js';
import * as aiKeyManager from './ai-key-manager.js';
import { buildMappingPrompt } from './prompt-builder.js';
import { evaluateBatch, evaluateConfidence, canPromoteToActive, MIN_EXECUTIONS_FOR_PROMOTION } from './confidence-evaluator.js';
import * as knowledgeStore from './knowledge-store.js';

/**
 * @typedef {object} SemanticMapRequest
 * @property {object[]} fields — PageSnapshot nodes to map
 * @property {object} pageContext — { page_title, page_url, form_heading, portal_id, form_key, language }
 * @property {object} scope — { portal_id, form_key, organization_id, country }
 * @property {string} [requesterId] — Actor making the request (for audit)
 */

/**
 * @typedef {object} SemanticMapResult
 * @property {boolean} ok — Whether the mapping operation succeeded
 * @property {string} strategy — 'ai_mapped' | 'no_ai_key' | 'all_excluded' | 'rate_limited' | 'error'
 * @property {object[]} mappings — Produced candidate mappings
 * @property {object[]} excluded — Fields excluded from AI mapping (with classification reason)
 * @property {object} diagnostics — Timing, token usage, etc.
 */

/**
 * @typedef {object} CandidateMapping
 * @property {string} node_id — The field's node_id
 * @property {string|null} profile_key — Mapped profile key
 * @property {string|null} semantic_key — Canonical semantic key
 * @property {string|null} transformation — How value maps (direct/extract/concatenate/format)
 * @property {number} confidence — Confidence score 0–1
 * @property {boolean} needsHumanConfirmation — Whether human must confirm before promotion
 * @property {string} disposition — 'auto_accept' | 'needs_confirmation' | 'reject'
 * @property {string|null} knowledgeRecordId — ID of the created draft record (null if rejected)
 * @property {string} reasoning — AI's explanation
 */

// ── Rate Limiting ───────────────────────────────────────────────────

/**
 * Simple sliding-window rate limiter for AI mapping calls.
 * Prevents excessive AI calls from a single workspace/session.
 */
class RateLimiter {
  /** @param {object} options */
  constructor({ maxRequests = 10, windowMs = 60_000 } = {}) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    /** @type {Map<string, number[]>} */
    this.windows = new Map();
  }

  /**
   * Check if a request is allowed for a given key.
   *
   * @param {string} key — Rate-limit key (e.g. workspaceId or portal_id)
   * @returns {{ allowed: boolean, retryAfterMs?: number }}
   */
  check(key) {
    const now = Date.now();
    const timestamps = this.windows.get(key) || [];
    // Prune expired entries
    const valid = timestamps.filter(t => now - t < this.windowMs);
    this.windows.set(key, valid);

    if (valid.length >= this.maxRequests) {
      const oldest = valid[0];
      const retryAfterMs = this.windowMs - (now - oldest);
      return { allowed: false, retryAfterMs };
    }
    return { allowed: true };
  }

  /**
   * Record a request for the given key.
   *
   * @param {string} key
   */
  record(key) {
    const now = Date.now();
    const timestamps = this.windows.get(key) || [];
    timestamps.push(now);
    this.windows.set(key, timestamps);
  }

  /**
   * Cleanup stale entries (call periodically).
   */
  cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.windows.entries()) {
      const valid = timestamps.filter(t => now - t < this.windowMs);
      if (valid.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, valid);
      }
    }
  }
}

// Per-workspace: max 10 AI mapping calls per minute
const rateLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60_000 });

// Global: max 60 AI mapping calls per minute across all workspaces
const globalRateLimiter = new RateLimiter({ maxRequests: 60, windowMs: 60_000 });

// Periodic cleanup every 5 minutes
setInterval(() => {
  rateLimiter.cleanup();
  globalRateLimiter.cleanup();
}, 5 * 60_000).unref();

// ── Main Orchestrator ───────────────────────────────────────────────

/**
 * Map unknown PageSnapshot fields to profile keys using AI.
 *
 * Flow:
 * 1. Filter out fields that already have knowledge mappings
 * 2. Classify remaining fields — exclude non-eligible
 * 3. Check rate limits and AI availability
 * 4. Build prompt and call AI
 * 5. Evaluate confidence of each mapping
 * 6. Store candidates as draft knowledge records
 *
 * @param {SemanticMapRequest} request
 * @returns {Promise<SemanticMapResult>}
 */
export async function mapUnknownFields(request) {
  const startTime = Date.now();
  const { fields, pageContext, scope, requesterId } = request;

  const diagnostics = {
    totalFields: fields.length,
    eligibleFields: 0,
    excludedFields: 0,
    aiCallMade: false,
    tokensUsed: 0,
    latencyMs: 0,
    rateLimited: false,
  };

  // ── Step 1: Classify fields and filter eligible ones ──────────────
  const eligible = [];
  const excluded = [];

  for (const field of fields) {
    const classification = classifyField(field);

    if (isEligibleForFill(classification)) {
      eligible.push({ ...field, classification });
    } else {
      excluded.push({
        node_id: field.node_id,
        label: field.observed?.accessible_name || field.label || field.semantic_label || '(no label)',
        classification,
        reason: `Field classified as ${classification} — excluded from AI mapping`,
      });
    }
  }

  diagnostics.eligibleFields = eligible.length;
  diagnostics.excludedFields = excluded.length;

  // If no eligible fields, return early
  if (eligible.length === 0) {
    return {
      ok: true,
      strategy: 'all_excluded',
      mappings: [],
      excluded,
      diagnostics: { ...diagnostics, latencyMs: Date.now() - startTime },
    };
  }

  // ── Step 2: Check AI availability ─────────────────────────────────
  if (!aiKeyManager.isAvailable()) {
    return {
      ok: true,
      strategy: 'no_ai_key',
      mappings: [],
      excluded,
      diagnostics: { ...diagnostics, latencyMs: Date.now() - startTime },
    };
  }

  // ── Step 3: Rate limiting ─────────────────────────────────────────
  const rateLimitKey = scope.portal_id || scope.organization_id || 'global';

  const localCheck = rateLimiter.check(rateLimitKey);
  if (!localCheck.allowed) {
    diagnostics.rateLimited = true;
    return {
      ok: false,
      strategy: 'rate_limited',
      mappings: [],
      excluded,
      diagnostics: {
        ...diagnostics,
        latencyMs: Date.now() - startTime,
        retryAfterMs: localCheck.retryAfterMs,
      },
    };
  }

  const globalCheck = globalRateLimiter.check('__global__');
  if (!globalCheck.allowed) {
    diagnostics.rateLimited = true;
    return {
      ok: false,
      strategy: 'rate_limited',
      mappings: [],
      excluded,
      diagnostics: {
        ...diagnostics,
        latencyMs: Date.now() - startTime,
        retryAfterMs: globalCheck.retryAfterMs,
      },
    };
  }

  // ── Step 4: Build prompt ──────────────────────────────────────────
  const fieldDescriptors = eligible.map(f => ({
    node_id: f.node_id,
    label: f.observed?.accessible_name || f.label || f.semantic_label || f.placeholder || '(unlabeled)',
    field_type: resolveFieldType(f),
    options: f.options || f.allowed_values || null,
    hint: f.observed?.description || f.hint || f.aria_description || null,
    group: f.group || f.section || null,
  }));

  const prompt = buildMappingPrompt(fieldDescriptors, pageContext);

  // ── Step 5: Call AI ───────────────────────────────────────────────
  rateLimiter.record(rateLimitKey);
  globalRateLimiter.record('__global__');
  diagnostics.aiCallMade = true;

  const aiResponse = await aiKeyManager.callAI({
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
  });

  // AI call returned null (should not happen since we checked availability, but be safe)
  if (!aiResponse) {
    return {
      ok: false,
      strategy: 'error',
      mappings: [],
      excluded,
      diagnostics: { ...diagnostics, latencyMs: Date.now() - startTime, error: 'AI call returned null' },
    };
  }

  diagnostics.tokensUsed = aiResponse.tokensUsed;

  if (!aiResponse.ok) {
    return {
      ok: false,
      strategy: 'error',
      mappings: [],
      excluded,
      diagnostics: { ...diagnostics, latencyMs: Date.now() - startTime, error: aiResponse.error },
    };
  }

  // ── Step 6: Parse AI response ─────────────────────────────────────
  let aiMappings;
  try {
    aiMappings = parseAIResponse(aiResponse.content);
  } catch (err) {
    return {
      ok: false,
      strategy: 'error',
      mappings: [],
      excluded,
      diagnostics: { ...diagnostics, latencyMs: Date.now() - startTime, error: `Parse error: ${err.message}` },
    };
  }

  // ── Step 7: Evaluate confidence ───────────────────────────────────
  const confidenceResults = evaluateBatch(aiMappings, fieldDescriptors, pageContext);

  // ── Step 8: Store candidates as draft knowledge records ───────────
  const candidateMappings = [];

  for (const aiMapping of aiMappings) {
    const confidence = confidenceResults.get(aiMapping.node_id);
    if (!confidence) continue;

    /** @type {CandidateMapping} */
    const candidate = {
      node_id: aiMapping.node_id,
      profile_key: aiMapping.profile_key || null,
      semantic_key: aiMapping.semantic_key || null,
      transformation: aiMapping.transformation || null,
      confidence: confidence.score,
      needsHumanConfirmation: confidence.needsHumanConfirmation,
      disposition: confidence.disposition,
      knowledgeRecordId: null,
      reasoning: aiMapping.reasoning || '',
    };

    // Only store non-rejected mappings with a profile_key as draft records
    if (confidence.disposition !== 'reject' && aiMapping.profile_key) {
      try {
        const descriptor = fieldDescriptors.find(field => field.node_id === aiMapping.node_id);
        const record = await storeDraftMapping({ ...aiMapping, label: descriptor?.label || null }, confidence, scope, requesterId);
        candidate.knowledgeRecordId = record.id;
      } catch (err) {
        console.error(`[semantic-mapper] Failed to store draft for ${aiMapping.node_id}:`, err.message);
        // Continue — non-fatal
      }
    }

    candidateMappings.push(candidate);
  }

  diagnostics.latencyMs = Date.now() - startTime;

  return {
    ok: true,
    strategy: 'ai_mapped',
    mappings: candidateMappings,
    excluded,
    diagnostics,
  };
}

// ── Response Parsing ────────────────────────────────────────────────

/**
 * Parse the AI response content into structured mappings.
 * Handles both direct JSON and JSON embedded in markdown code blocks.
 *
 * @param {string} content — Raw AI response text
 * @returns {object[]} — Array of mapping objects
 * @throws {Error} if content cannot be parsed
 */
function parseAIResponse(content) {
  if (!content || typeof content !== 'string') {
    throw new Error('Empty or non-string AI response');
  }

  let text = content.trim();

  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    // Try to find JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error(`Cannot parse AI response as JSON: ${e.message}`);
    }
  }

  // Validate structure
  if (!parsed.mappings || !Array.isArray(parsed.mappings)) {
    throw new Error('AI response missing "mappings" array');
  }

  // Validate each mapping has required fields
  const validated = [];
  for (const m of parsed.mappings) {
    if (!m.node_id) continue; // skip entries without node_id

    validated.push({
      node_id: String(m.node_id),
      profile_key: m.profile_key || null,
      semantic_key: m.semantic_key || null,
      transformation: m.transformation || null,
      reasoning: m.reasoning || '',
    });
  }

  if (validated.length === 0) {
    throw new Error('AI response contained no valid mappings');
  }

  return validated;
}

// ── Draft Knowledge Record Storage ──────────────────────────────────

/**
 * Store an AI-generated mapping as a draft knowledge record.
 *
 * @param {object} aiMapping — The parsed AI mapping
 * @param {object} confidence — The confidence evaluation result
 * @param {object} scope — { portal_id, form_key, organization_id, country }
 * @param {string|null} requesterId — Actor requesting the mapping
 * @returns {Promise<object>} — The created knowledge record
 */
async function storeDraftMapping(aiMapping, confidence, scope, requesterId) {
  const record = {
    kind: 'field_mapping',
    status: 'draft', // Always draft — never auto-promote from cold start
    scope: {
      level: determineScopeLevel(scope),
      portal_id: scope.portal_id || null,
      form_key: scope.form_key || null,
      organization_id: scope.organization_id || null,
      country: scope.country || null,
    },
    confidence: confidence.score,
    source: {
      origin: 'ai_generated',
      actor: requesterId || 'semantic-mapper',
      evidence_ref: `cold_start_mapping:${aiMapping.node_id}`,
    },
    tags: ['cold_start', 'ai_generated', 'needs_confirmation'],
    payload: {
      semantic_key: aiMapping.semantic_key,
      profile_key: aiMapping.profile_key,
      transformation: aiMapping.transformation || 'direct',
      field_label: aiMapping.label || null,
      reasoning: aiMapping.reasoning,
      confidence_breakdown: confidence.breakdown,
      disposition: confidence.disposition,
      execution_stats: {
        successful_executions: 0,
        total_executions: 0,
        human_confirmed: false,
        last_executed_at: null,
      },
    },
  };

  return knowledgeStore.create(record);
}

/**
 * Determine the most specific scope level from available scope data.
 *
 * @param {object} scope
 * @returns {string}
 */
function determineScopeLevel(scope) {
  if (scope.portal_id && scope.form_key) return 'portal_form';
  if (scope.portal_id) return 'portal';
  if (scope.organization_id) return 'organization';
  if (scope.country) return 'country';
  return 'global';
}

// ── Field Type Resolution ───────────────────────────────────────────

/**
 * Resolve the field type from a PageSnapshot node.
 * Handles different node representations.
 *
 * @param {object} node
 * @returns {string}
 */
function resolveFieldType(node) {
  // Direct field_type if present
  if (node.field_type) return node.field_type;

  // From widget descriptor
  if (node.widget) {
    if (node.widget.input_type) return node.widget.input_type;
    if (node.widget.widget_class) {
      const cls = node.widget.widget_class.toLowerCase();
      if (cls.includes('select') || cls.includes('dropdown')) return 'select';
      if (cls.includes('radio')) return 'radio';
      if (cls.includes('checkbox')) return 'checkbox';
      if (cls.includes('date')) return 'date';
      if (cls.includes('file') || cls.includes('upload')) return 'file';
      if (cls.includes('textarea')) return 'textarea';
    }
  }

  // From affordances
  const affordances = node.affordances || [];
  if (affordances.includes('select_one')) return 'select';
  if (affordances.includes('select_many')) return 'checkbox';
  if (affordances.includes('toggle')) return 'checkbox';
  if (affordances.includes('upload')) return 'file';
  if (affordances.includes('type_text')) return 'text';

  return 'text'; // default
}

// ── Mapping Promotion ───────────────────────────────────────────────

/**
 * Record a successful execution of a draft mapping and check if it can be promoted.
 * Called after a fill operation uses a draft mapping without correction.
 *
 * @param {string} recordId — Knowledge record ID of the draft mapping
 * @param {boolean} wasSuccessful — Whether the fill was successful (no correction needed)
 * @returns {Promise<{ promoted: boolean, reason: string }>}
 */
export async function recordExecutionAndCheckPromotion(recordId, wasSuccessful) {
  const record = await knowledgeStore.getById(recordId);
  if (!record) return { promoted: false, reason: 'Record not found' };
  if (record.status !== 'draft') return { promoted: false, reason: `Record status is ${record.status}, not draft` };

  const stats = record.payload.execution_stats || {
    successful_executions: 0,
    total_executions: 0,
    human_confirmed: false,
    last_executed_at: null,
  };

  stats.total_executions += 1;
  if (wasSuccessful) stats.successful_executions += 1;
  stats.last_executed_at = new Date().toISOString();

  // Check promotion eligibility
  const promotionCheck = canPromoteToActive({
    confidence: record.confidence,
    successfulExecutions: stats.successful_executions,
    totalExecutions: stats.total_executions,
    humanConfirmed: stats.human_confirmed,
  });

  if (promotionCheck.canPromote) {
    // Promote to active
    await knowledgeStore.update(record.id, {
      status: 'active',
      confidence: Math.min(0.95, record.confidence + 0.05),
      payload: {
        ...record.payload,
        execution_stats: stats,
        promoted_at: new Date().toISOString(),
        promotion_reason: promotionCheck.reason,
      },
      source: {
        ...record.source,
        origin: 'learned',
      },
      tags: (record.tags || []).filter(t => t !== 'needs_confirmation').concat('auto_promoted'),
    });
    return { promoted: true, reason: promotionCheck.reason };
  }

  // Update stats without promoting
  await knowledgeStore.update(record.id, {
    status: 'draft', // remains draft
    payload: { ...record.payload, execution_stats: stats },
  });

  return { promoted: false, reason: promotionCheck.reason };
}

/**
 * Mark a draft mapping as human-confirmed and attempt promotion.
 *
 * @param {string} recordId — Knowledge record ID
 * @param {string} actor — Who confirmed (user ID)
 * @returns {Promise<{ promoted: boolean, reason: string }>}
 */
export async function confirmMapping(recordId, actor) {
  const record = await knowledgeStore.getById(recordId);
  if (!record) return { promoted: false, reason: 'Record not found' };
  if (record.status !== 'draft') return { promoted: false, reason: `Record already ${record.status}` };

  const stats = record.payload.execution_stats || {
    successful_executions: 0,
    total_executions: 0,
    human_confirmed: false,
    last_executed_at: null,
  };
  stats.human_confirmed = true;

  const promotionCheck = canPromoteToActive({
    confidence: record.confidence,
    successfulExecutions: stats.successful_executions,
    totalExecutions: stats.total_executions,
    humanConfirmed: true,
  });

  if (promotionCheck.canPromote) {
    await knowledgeStore.update(record.id, {
      status: 'active',
      confidence: Math.min(0.98, record.confidence + 0.1),
      payload: {
        ...record.payload,
        execution_stats: stats,
        confirmed_by: actor,
        confirmed_at: new Date().toISOString(),
        promoted_at: new Date().toISOString(),
        promotion_reason: promotionCheck.reason,
      },
      source: {
        origin: 'manual',
        actor,
      },
      tags: (record.tags || []).filter(t => t !== 'needs_confirmation').concat('human_confirmed'),
    });
    return { promoted: true, reason: promotionCheck.reason };
  }

  // Update confirmation status but don't promote yet
  await knowledgeStore.update(record.id, {
    status: 'draft',
    payload: { ...record.payload, execution_stats: stats, confirmed_by: actor, confirmed_at: new Date().toISOString() },
  });

  return { promoted: false, reason: promotionCheck.reason };
}

/**
 * Reject a draft AI mapping (mark as deprecated).
 *
 * @param {string} recordId — Knowledge record ID
 * @param {string} actor — Who rejected
 * @param {string} [reason] — Rejection reason
 * @returns {Promise<{ ok: boolean }>}
 */
export async function rejectMapping(recordId, actor, reason) {
  const record = await knowledgeStore.getById(recordId);
  if (!record) return { ok: false };

  await knowledgeStore.update(record.id, {
    status: 'deprecated',
    payload: {
      ...record.payload,
      rejected_by: actor,
      rejected_at: new Date().toISOString(),
      rejection_reason: reason || 'Human rejected',
    },
    tags: [...(record.tags || []), 'rejected'],
  });

  return { ok: true };
}

// ── Exports for testing ─────────────────────────────────────────────

export { FieldClassification, MIN_EXECUTIONS_FOR_PROMOTION };

/**
 * Reset rate limiters (for testing).
 */
export function _resetRateLimiters() {
  rateLimiter.windows.clear();
  globalRateLimiter.windows.clear();
}
