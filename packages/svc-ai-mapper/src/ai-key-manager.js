// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CyberControl AI Key Manager — @cybercontrol/svc-ai-mapper
// Phase 4.3 — Cold-Start Semantic Mapping (+ #211 workspace keys)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Server-only. Keys are NEVER sent to the extension.
//
// Text / field-mapping AI resolution order (#211):
//   1. Owner-panel workspace DB: workspaces.settings->'ai'
//        openrouterKey / llmKey / groqKey + textProvider / textModel
//   2. Env fallback: OPENROUTER_API_KEY, then AI_API_KEY / LLM_API_KEY
//
// Mistral (mistralKey / MISTRAL_API_KEY) is OCR-only on the hub — never used here.
//
// Inject the Postgres pool at bootstrap via setPool(pool).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * @typedef {object} AIKeyConfig
 * @property {string|null} apiKey
 * @property {string} provider
 * @property {string} model
 * @property {string|null} endpoint
 * @property {number} maxTokens
 * @property {number} temperature
 */

/**
 * @typedef {object} AIResponse
 * @property {boolean} ok
 * @property {string|null} content
 * @property {number} tokensUsed
 * @property {string|null} error
 * @property {string} model
 * @property {number} latencyMs
 */

const PROVIDER_DEFAULTS = {
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.3-70b-instruct',
  },
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
  },
  azure_openai: {
    endpoint: null,
    model: 'gpt-4o',
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-20250514',
  },
};

const DEFAULT_CONFIG = {
  provider: 'openrouter',
  model: PROVIDER_DEFAULTS.openrouter.model,
  endpoint: PROVIDER_DEFAULTS.openrouter.endpoint,
  maxTokens: 2048,
  temperature: 0.1,
  quotaRequests: 500,
  quotaTokens: 200_000,
  windowDurationMs: 60 * 60 * 1000,
};

/** @type {AIKeyConfig|null} */
let config = null;

let usage = {
  requestCount: 0,
  tokenCount: 0,
  windowStart: Date.now(),
  windowDurationMs: DEFAULT_CONFIG.windowDurationMs,
};

/** @type {import('pg').Pool|null} */
let pool = null;

/** workspaceId → { keys, expiry } */
const _wsKeyCache = new Map();
const WS_KEY_TTL_MS = 5 * 60 * 1000;

/**
 * Inject Postgres pool (same pattern as svc-knowledge).
 * @param {import('pg').Pool} nextPool
 */
export function setPool(nextPool) {
  if (!nextPool || typeof nextPool.query !== 'function') {
    throw new TypeError('svc-ai-mapper requires a pg-compatible pool');
  }
  pool = nextPool;
}

// ── Env config (legacy fallback) ────────────────────────────────────

function resolveEnvTextProvider() {
  const openrouterKey = process.env.OPENROUTER_API_KEY || '';
  const genericKey =
    process.env.AI_API_KEY ||
    process.env.LLM_API_KEY ||
    '';
  const explicitProvider = (
    process.env.AI_PROVIDER ||
    process.env.LLM_PROVIDER ||
    ''
  ).toLowerCase().trim();

  const pick = (provider, apiKey) => {
    const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openrouter;
    return {
      provider: PROVIDER_DEFAULTS[provider] ? provider : 'openrouter',
      apiKey,
      endpoint: process.env.AI_ENDPOINT || process.env.LLM_BASE_URL || defaults.endpoint,
      model: process.env.AI_MODEL || process.env.LLM_MODEL || defaults.model,
    };
  };

  if (openrouterKey) {
    if (explicitProvider && explicitProvider !== 'openrouter' && genericKey && PROVIDER_DEFAULTS[explicitProvider]) {
      return pick(explicitProvider, genericKey);
    }
    return pick('openrouter', openrouterKey);
  }
  if (genericKey) {
    return pick(explicitProvider || 'groq', genericKey);
  }
  return {
    provider: explicitProvider || 'openrouter',
    apiKey: null,
    endpoint: process.env.AI_ENDPOINT || process.env.LLM_BASE_URL || null,
    model: process.env.AI_MODEL || process.env.LLM_MODEL || DEFAULT_CONFIG.model,
  };
}

export function loadConfig() {
  const resolved = resolveEnvTextProvider();
  const maxTokens = parseInt(process.env.AI_MAX_TOKENS, 10) || DEFAULT_CONFIG.maxTokens;
  const temperature = parseFloat(process.env.AI_TEMPERATURE);
  const effectiveTemperature = Number.isFinite(temperature) ? temperature : DEFAULT_CONFIG.temperature;

  if (process.env.AI_QUOTA_REQUESTS) {
    DEFAULT_CONFIG.quotaRequests = parseInt(process.env.AI_QUOTA_REQUESTS, 10);
  }
  if (process.env.AI_QUOTA_TOKENS) {
    DEFAULT_CONFIG.quotaTokens = parseInt(process.env.AI_QUOTA_TOKENS, 10);
  }

  config = {
    apiKey: resolved.apiKey,
    provider: resolved.provider,
    model: resolved.model,
    endpoint: resolved.endpoint,
    maxTokens,
    temperature: effectiveTemperature,
  };

  if (!resolved.apiKey) {
    console.warn('[ai-key-manager] No env text AI key — fill AI uses owner-panel workspace keys (workspaces.settings.ai)');
  } else {
    console.log(`[ai-key-manager] Env fallback configured: provider=${resolved.provider}, model=${resolved.model}`);
  }
  return config;
}

export function isAvailable() {
  if (!config) loadConfig();
  return !!(config.apiKey && config.apiKey.length);
}

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

function recordUsage(tokens) {
  maybeResetWindow();
  usage.requestCount += 1;
  usage.tokenCount += tokens;
}

export function getUsage() {
  maybeResetWindow();
  return { ...usage };
}

// ── Workspace-aware keys (owner-panel) ──────────────────────────────

/**
 * Resolve text LLM keys from owner-panel AI settings.
 * Uses openrouterKey / llmKey / groqKey — never mistralKey (OCR only).
 *
 * @param {object} aiSettings
 */
function resolveWorkspaceKeys(aiSettings) {
  if (!aiSettings || typeof aiSettings !== 'object') {
    return { apiKey: null, provider: 'none', model: '', endpoint: null };
  }

  const textProvider = String(aiSettings.textProvider || '').toLowerCase();
  const textModel = aiSettings.textModel || null;
  const openrouterKey = aiSettings.openrouterKey || '';
  const llmKey = aiSettings.llmKey || aiSettings.groqKey || '';

  if ((textProvider === 'openrouter' || !textProvider) && openrouterKey) {
    return {
      apiKey: openrouterKey,
      provider: 'openrouter',
      model: textModel || PROVIDER_DEFAULTS.openrouter.model,
      endpoint: PROVIDER_DEFAULTS.openrouter.endpoint,
    };
  }

  if (textProvider === 'groq' && llmKey) {
    return {
      apiKey: llmKey,
      provider: 'groq',
      model: textModel || PROVIDER_DEFAULTS.groq.model,
      endpoint: PROVIDER_DEFAULTS.groq.endpoint,
    };
  }

  if (openrouterKey) {
    return {
      apiKey: openrouterKey,
      provider: 'openrouter',
      model: textModel || PROVIDER_DEFAULTS.openrouter.model,
      endpoint: PROVIDER_DEFAULTS.openrouter.endpoint,
    };
  }

  if (llmKey) {
    const provider = textProvider === 'openai' ? 'openai' : 'groq';
    const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.groq;
    return {
      apiKey: llmKey,
      provider,
      model: textModel || defaults.model,
      endpoint: defaults.endpoint,
    };
  }

  return { apiKey: null, provider: 'none', model: '', endpoint: null };
}

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
 * Get AI key config for a workspace (owner-panel DB → env fallback).
 * @param {string|null|undefined} workspaceId
 */
export async function getKeyForWorkspace(workspaceId) {
  if (!workspaceId) return getEnvFallback();

  const cached = _wsKeyCache.get(workspaceId);
  if (cached && cached.expiry > Date.now()) {
    return cached.keys;
  }

  if (!pool) {
    console.warn('[ai-key-manager] No pool set — cannot read owner-panel keys; using env fallback');
    return getEnvFallback();
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

  return getEnvFallback();
}

/**
 * @param {string|null|undefined} workspaceId
 * @returns {Promise<boolean>}
 */
export async function isAvailableForWorkspace(workspaceId) {
  const keys = await getKeyForWorkspace(workspaceId);
  return !!(keys.apiKey && keys.apiKey.length);
}

/**
 * Invalidate cached keys after owner-panel updates (optional).
 * @param {string} [workspaceId]
 */
export function invalidateWorkspaceKeyCache(workspaceId) {
  if (workspaceId) _wsKeyCache.delete(workspaceId);
  else _wsKeyCache.clear();
}

/**
 * Make an AI call using owner-panel (workspace) keys.
 * @param {string|null|undefined} workspaceId
 * @param {object} params
 * @returns {Promise<AIResponse|null>}
 */
export async function callAIForWorkspace(workspaceId, { systemPrompt, userPrompt, maxTokens, temperature }) {
  const keys = await getKeyForWorkspace(workspaceId);
  if (!keys.apiKey) return null;

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
    const endpoint = keys.endpoint || PROVIDER_DEFAULTS.openrouter.endpoint;
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

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${keys.apiKey}`,
    };
    if (keys.provider === 'openrouter') {
      if (process.env.OPENROUTER_HTTP_REFERER) headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER;
      headers['X-Title'] = process.env.OPENROUTER_APP_TITLE || process.env.BRAND_NAME || 'CyberControl';
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
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

// ── Legacy env-only callAI (kept for tests / non-workspace callers) ─

export async function callAI({ systemPrompt, userPrompt, maxTokens, temperature }) {
  if (!config) loadConfig();
  if (!config.apiKey) return null;
  // Delegate through workspace path with null id → env fallback
  return callAIForWorkspace(null, { systemPrompt, userPrompt, maxTokens, temperature });
}

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
