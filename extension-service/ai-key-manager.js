// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl AI Key Manager — extension-service/ai-key-manager.js
// Phase 4.3 — Cold-Start Semantic Mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Centralized AI key access — server-only. Key is NEVER sent to extension.
//
// Responsibilities:
//   - Read API key from environment/config
//   - Validate key presence and format
//   - Track usage/quota per billing window
//   - Provide callAI() abstraction for prompt→completion
//   - Return null gracefully if no key configured (no-AI-key path)
//
// Does NOT own: prompt construction, confidence evaluation, mapping logic.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * @typedef {object} AIKeyConfig
 * @property {string|null} apiKey — The API key (null if not configured)
 * @property {'openai'|'anthropic'|'azure_openai'} provider — AI provider
 * @property {string} model — Model identifier (e.g. 'gpt-4o', 'claude-sonnet-4-20250514')
 * @property {string|null} endpoint — Custom endpoint URL (for Azure/self-hosted)
 * @property {number} maxTokens — Max tokens per request
 * @property {number} temperature — Temperature for generations
 */

/**
 * @typedef {object} UsageRecord
 * @property {number} requestCount — Total requests in current window
 * @property {number} tokenCount — Total tokens consumed in current window
 * @property {number} windowStart — Start of current billing window (epoch ms)
 * @property {number} windowDurationMs — Duration of billing window
 */

/**
 * @typedef {object} AIResponse
 * @property {boolean} ok — Whether the call succeeded
 * @property {string|null} content — The AI response text (null on failure)
 * @property {number} tokensUsed — Tokens consumed by this call
 * @property {string|null} error — Error message if failed
 * @property {string} model — Model used
 * @property {number} latencyMs — Call duration
 */

// ── Configuration ───────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  provider: 'openai',
  model: 'gpt-4o',
  endpoint: null,
  maxTokens: 2048,
  temperature: 0.1,
  // Quota: 500 requests per hour, 200k tokens per hour
  quotaRequests: 500,
  quotaTokens: 200_000,
  windowDurationMs: 60 * 60 * 1000, // 1 hour
};

/** @type {AIKeyConfig} */
let config = null;

/** @type {UsageRecord} */
let usage = {
  requestCount: 0,
  tokenCount: 0,
  windowStart: Date.now(),
  windowDurationMs: DEFAULT_CONFIG.windowDurationMs,
};

// ── Initialization ──────────────────────────────────────────────────

/**
 * Load AI configuration from environment variables.
 * Call once at startup or lazily on first use.
 *
 * Environment variables:
 *   AI_API_KEY          — The API key (required for AI features)
 *   AI_PROVIDER         — 'openai' | 'anthropic' | 'azure_openai' (default: openai)
 *   AI_MODEL            — Model identifier (default: gpt-4o)
 *   AI_ENDPOINT         — Custom endpoint URL (optional)
 *   AI_MAX_TOKENS       — Max tokens per request (default: 2048)
 *   AI_TEMPERATURE      — Temperature (default: 0.1)
 *   AI_QUOTA_REQUESTS   — Max requests per window (default: 500)
 *   AI_QUOTA_TOKENS     — Max tokens per window (default: 200000)
 *
 * @returns {AIKeyConfig}
 */
export function loadConfig() {
  const apiKey = process.env.AI_API_KEY || null;
  const provider = process.env.AI_PROVIDER || DEFAULT_CONFIG.provider;
  const model = process.env.AI_MODEL || DEFAULT_CONFIG.model;
  const endpoint = process.env.AI_ENDPOINT || DEFAULT_CONFIG.endpoint;
  const maxTokens = parseInt(process.env.AI_MAX_TOKENS, 10) || DEFAULT_CONFIG.maxTokens;
  const temperature = parseFloat(process.env.AI_TEMPERATURE) || DEFAULT_CONFIG.temperature;

  if (process.env.AI_QUOTA_REQUESTS) {
    DEFAULT_CONFIG.quotaRequests = parseInt(process.env.AI_QUOTA_REQUESTS, 10);
  }
  if (process.env.AI_QUOTA_TOKENS) {
    DEFAULT_CONFIG.quotaTokens = parseInt(process.env.AI_QUOTA_TOKENS, 10);
  }

  config = { apiKey, provider, model, endpoint, maxTokens, temperature };

  if (!apiKey) {
    console.warn('[ai-key-manager] No AI_API_KEY configured — AI features disabled');
  } else {
    console.log(`[ai-key-manager] Configured: provider=${provider}, model=${model}`);
  }

  return config;
}

// ── Key Validation ──────────────────────────────────────────────────

/**
 * Check if an AI key is configured and valid.
 *
 * @returns {boolean}
 */
export function isAvailable() {
  if (!config) loadConfig();
  return config.apiKey != null && config.apiKey.length > 0;
}

/**
 * Get the current configuration (without exposing the full key).
 * Returns null if no key is configured.
 *
 * @returns {{ provider: string, model: string, configured: boolean }|null}
 */
export function getStatus() {
  if (!config) loadConfig();
  if (!config.apiKey) return null;
  return {
    provider: config.provider,
    model: config.model,
    configured: true,
    usage: { ...usage },
  };
}

// ── Quota Tracking ──────────────────────────────────────────────────

/**
 * Reset usage window if expired.
 */
function maybeResetWindow() {
  const now = Date.now();
  if (now - usage.windowStart >= usage.windowDurationMs) {
    usage = {
      requestCount: 0,
      tokenCount: 0,
      windowStart: now,
      windowDurationMs: DEFAULT_CONFIG.windowDurationMs,
    };
  }
}

/**
 * Check if we have remaining quota for a request.
 *
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkQuota() {
  maybeResetWindow();
  if (usage.requestCount >= DEFAULT_CONFIG.quotaRequests) {
    return { allowed: false, reason: `Request quota exhausted (${DEFAULT_CONFIG.quotaRequests}/window)` };
  }
  if (usage.tokenCount >= DEFAULT_CONFIG.quotaTokens) {
    return { allowed: false, reason: `Token quota exhausted (${DEFAULT_CONFIG.quotaTokens}/window)` };
  }
  return { allowed: true };
}

/**
 * Record usage from a completed AI call.
 *
 * @param {number} tokens — Tokens consumed
 */
function recordUsage(tokens) {
  maybeResetWindow();
  usage.requestCount += 1;
  usage.tokenCount += tokens;
}

/**
 * Get current usage stats.
 *
 * @returns {UsageRecord}
 */
export function getUsage() {
  maybeResetWindow();
  return { ...usage };
}

// ── AI Call Abstraction ─────────────────────────────────────────────

/**
 * Make an AI completion call.
 * Returns null if no key is configured (graceful no-AI-key path).
 * Returns an AIResponse on success or failure.
 *
 * @param {object} params
 * @param {string} params.systemPrompt — System-level instruction
 * @param {string} params.userPrompt — User-level content (the mapping prompt)
 * @param {number} [params.maxTokens] — Override max tokens
 * @param {number} [params.temperature] — Override temperature
 * @returns {Promise<AIResponse|null>}
 */
export async function callAI({ systemPrompt, userPrompt, maxTokens, temperature }) {
  if (!config) loadConfig();

  // No-AI-key path: return null gracefully
  if (!config.apiKey) {
    return null;
  }

  // Check quota
  const quota = checkQuota();
  if (!quota.allowed) {
    return {
      ok: false,
      content: null,
      tokensUsed: 0,
      error: quota.reason,
      model: config.model,
      latencyMs: 0,
    };
  }

  const startTime = Date.now();
  const effectiveMaxTokens = maxTokens || config.maxTokens;
  const effectiveTemperature = temperature ?? config.temperature;

  try {
    const response = await dispatchToProvider({
      systemPrompt,
      userPrompt,
      maxTokens: effectiveMaxTokens,
      temperature: effectiveTemperature,
    });

    const latencyMs = Date.now() - startTime;
    recordUsage(response.tokensUsed);

    return {
      ok: true,
      content: response.content,
      tokensUsed: response.tokensUsed,
      error: null,
      model: config.model,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    console.error(`[ai-key-manager] AI call failed (${latencyMs}ms):`, err.message);

    return {
      ok: false,
      content: null,
      tokensUsed: 0,
      error: err.message,
      model: config.model,
      latencyMs,
    };
  }
}

// ── Provider Dispatch ───────────────────────────────────────────────

/**
 * Dispatch to the configured AI provider via HTTP.
 *
 * @param {object} params
 * @returns {Promise<{ content: string, tokensUsed: number }>}
 */
async function dispatchToProvider({ systemPrompt, userPrompt, maxTokens, temperature }) {
  switch (config.provider) {
    case 'openai':
    case 'azure_openai':
      return callOpenAI({ systemPrompt, userPrompt, maxTokens, temperature });
    case 'anthropic':
      return callAnthropic({ systemPrompt, userPrompt, maxTokens, temperature });
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}

/**
 * Call OpenAI-compatible API (works for OpenAI and Azure OpenAI).
 */
async function callOpenAI({ systemPrompt, userPrompt, maxTokens, temperature }) {
  const endpoint = config.endpoint || 'https://api.openai.com/v1/chat/completions';

  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
    response_format: { type: 'json_object' },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error('No completion choice returned');

  return {
    content: choice.message?.content || '',
    tokensUsed: data.usage?.total_tokens || 0,
  };
}

/**
 * Call Anthropic Claude API.
 */
async function callAnthropic({ systemPrompt, userPrompt, maxTokens, temperature }) {
  const endpoint = config.endpoint || 'https://api.anthropic.com/v1/messages';

  const body = {
    model: config.model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
    ],
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const content = data.content?.[0]?.text || '';
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

  return { content, tokensUsed };
}

// ── Workspace-Aware Key Resolution ──────────────────────────────────
// Fetches AI keys from the owner-panel configuration stored in
// workspaces.settings->'ai'. Falls back to env vars if no DB key found.

import { pool } from './db.js';

/** Cache workspace keys for 5 minutes to avoid hammering DB on every fill */
const _wsKeyCache = new Map(); // workspaceId → { keys, expiry }
const WS_KEY_TTL_MS = 5 * 60 * 1000;

/**
 * Get AI key configuration for a specific workspace.
 * Reads from workspaces.settings->'ai' (set via owner-panel).
 * Falls back to process.env if no workspace-level key is configured.
 *
 * @param {string} workspaceId — UUID of the workspace
 * @returns {Promise<{ apiKey: string|null, provider: string, model: string, endpoint: string|null }>}
 */
export async function getKeyForWorkspace(workspaceId) {
  if (!workspaceId) return getEnvFallback();

  // Check cache
  const cached = _wsKeyCache.get(workspaceId);
  if (cached && cached.expiry > Date.now()) {
    return cached.keys;
  }

  try {
    const { rows } = await pool.query(
      `SELECT settings->'ai' AS ai_settings FROM workspaces WHERE id = $1`,
      [workspaceId]
    );

    const aiSettings = rows[0]?.ai_settings;
    if (aiSettings) {
      const keys = resolveWorkspaceKeys(aiSettings);
      if (keys.apiKey) {
        _wsKeyCache.set(workspaceId, { keys, expiry: Date.now() + WS_KEY_TTL_MS });
        return keys;
      }
    }
  } catch (err) {
    console.warn(`[ai-key-manager] Failed to fetch workspace AI keys: ${err.message}`);
  }

  // Fallback to environment
  return getEnvFallback();
}

/**
 * Resolve the best key/provider/model from workspace AI settings.
 * The owner-panel stores: groqKey, openrouterKey, mistralKey, textProvider, textModel.
 * For semantic mapping (text LLM), we use the text provider keys.
 *
 * @param {object} aiSettings — workspaces.settings.ai object
 * @returns {{ apiKey: string|null, provider: string, model: string, endpoint: string|null }}
 */
function resolveWorkspaceKeys(aiSettings) {
  const textProvider = aiSettings.textProvider || 'groq';
  const textModel = aiSettings.textModel || null;

  if (textProvider === 'openrouter' && aiSettings.openrouterKey) {
    return {
      apiKey: aiSettings.openrouterKey,
      provider: 'openrouter',
      model: textModel || 'meta-llama/llama-3.3-70b-instruct',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    };
  }

  if (aiSettings.groqKey) {
    return {
      apiKey: aiSettings.groqKey,
      provider: 'groq',
      model: textModel || 'llama-3.3-70b-versatile',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    };
  }

  if (aiSettings.openrouterKey) {
    return {
      apiKey: aiSettings.openrouterKey,
      provider: 'openrouter',
      model: textModel || 'meta-llama/llama-3.3-70b-instruct',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    };
  }

  return { apiKey: null, provider: 'none', model: '', endpoint: null };
}

/**
 * Fallback: get key from environment variables (AI_API_KEY only).
 * GROQ_API_KEY is NOT used here — all keys come from owner-panel.
 */
function getEnvFallback() {
  if (!config) loadConfig();
  if (config.apiKey) {
    return {
      apiKey: config.apiKey,
      provider: config.provider,
      model: config.model,
      endpoint: config.endpoint,
    };
  }
  return { apiKey: null, provider: 'none', model: '', endpoint: null };
}

/**
 * Check if AI is available for a specific workspace.
 *
 * @param {string} workspaceId
 * @returns {Promise<boolean>}
 */
export async function isAvailableForWorkspace(workspaceId) {
  const keys = await getKeyForWorkspace(workspaceId);
  return keys.apiKey != null && keys.apiKey.length > 0;
}

/**
 * Make an AI call using workspace-specific keys.
 * Uses OpenAI-compatible endpoint (works for Groq, OpenRouter, OpenAI).
 *
 * @param {string} workspaceId
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @param {number} [params.maxTokens]
 * @param {number} [params.temperature]
 * @returns {Promise<AIResponse|null>}
 */
export async function callAIForWorkspace(workspaceId, { systemPrompt, userPrompt, maxTokens, temperature }) {
  const keys = await getKeyForWorkspace(workspaceId);

  if (!keys.apiKey) return null;

  // Check quota (shared across all workspaces for now)
  const quota = checkQuota();
  if (!quota.allowed) {
    return {
      ok: false,
      content: null,
      tokensUsed: 0,
      error: quota.reason,
      model: keys.model,
      latencyMs: 0,
    };
  }

  const startTime = Date.now();
  const effectiveMaxTokens = maxTokens || DEFAULT_CONFIG.maxTokens;
  const effectiveTemperature = temperature ?? DEFAULT_CONFIG.temperature;

  try {
    const endpoint = keys.endpoint || 'https://api.openai.com/v1/chat/completions';
    const body = {
      model: keys.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: effectiveMaxTokens,
      temperature: effectiveTemperature,
      response_format: { type: 'json_object' },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${keys.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'unknown');
      throw new Error(`AI API error ${res.status} (${keys.provider}): ${errText}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('No completion choice returned');

    const tokensUsed = data.usage?.total_tokens || 0;
    const latencyMs = Date.now() - startTime;
    recordUsage(tokensUsed);

    return {
      ok: true,
      content: choice.message?.content || '',
      tokensUsed,
      error: null,
      model: keys.model,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    console.error(`[ai-key-manager] Workspace AI call failed (${keys.provider}, ${latencyMs}ms):`, err.message);
    return {
      ok: false,
      content: null,
      tokensUsed: 0,
      error: err.message,
      model: keys.model,
      latencyMs,
    };
  }
}

// ── Reset (for testing) ─────────────────────────────────────────────

/**
 * Reset internal state (for testing purposes).
 */
export function _reset() {
  config = null;
  _wsKeyCache.clear();
  usage = {
    requestCount: 0,
    tokenCount: 0,
    windowStart: Date.now(),
    windowDurationMs: DEFAULT_CONFIG.windowDurationMs,
  };
}
