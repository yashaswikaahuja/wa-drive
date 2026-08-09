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
  const apiKey = process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY || null;
  const provider = process.env.AI_PROVIDER || (process.env.OPENROUTER_API_KEY ? 'openrouter' : process.env.GROQ_API_KEY ? 'groq' : DEFAULT_CONFIG.provider);
  const model = process.env.AI_MODEL || (provider === 'openrouter' ? 'meta-llama/llama-3.3-70b-instruct' : provider === 'groq' ? 'llama-3.3-70b-versatile' : DEFAULT_CONFIG.model);
  const endpoint = process.env.AI_ENDPOINT || (provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : DEFAULT_CONFIG.endpoint);
  const maxTokens = parseInt(process.env.AI_MAX_TOKENS, 10) || DEFAULT_CONFIG.maxTokens;
  const temperature = parseFloat(process.env.AI_TEMPERATURE) || DEFAULT_CONFIG.temperature;
  const configuredTimeout = parseInt(process.env.AI_TIMEOUT_MS, 10);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 15_000;

  if (process.env.AI_QUOTA_REQUESTS) {
    DEFAULT_CONFIG.quotaRequests = parseInt(process.env.AI_QUOTA_REQUESTS, 10);
  }
  if (process.env.AI_QUOTA_TOKENS) {
    DEFAULT_CONFIG.quotaTokens = parseInt(process.env.AI_QUOTA_TOKENS, 10);
  }

  config = { apiKey, provider, model, endpoint, maxTokens, temperature, timeoutMs };

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
  const timeoutMs = config.timeoutMs || 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await dispatchToProvider({
      systemPrompt,
      userPrompt,
      maxTokens: effectiveMaxTokens,
      temperature: effectiveTemperature,
      signal: controller.signal,
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
    const failure = controller.signal.aborted
      ? new Error(`AI request timed out after ${timeoutMs}ms`)
      : err;
    console.error(`[ai-key-manager] AI call failed (${latencyMs}ms):`, failure.message);

    return {
      ok: false,
      content: null,
      tokensUsed: 0,
      error: failure.message,
      model: config.model,
      latencyMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Provider Dispatch ───────────────────────────────────────────────

/**
 * Dispatch to the configured AI provider via HTTP.
 *
 * @param {object} params
 * @returns {Promise<{ content: string, tokensUsed: number }>}
 */
async function dispatchToProvider({ systemPrompt, userPrompt, maxTokens, temperature, signal }) {
  switch (config.provider) {
    case 'openai':
    case 'azure_openai':
    case 'openrouter':
    case 'groq':
      return callOpenAI({ systemPrompt, userPrompt, maxTokens, temperature, signal });
    case 'anthropic':
      return callAnthropic({ systemPrompt, userPrompt, maxTokens, temperature, signal });
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`);
  }
}

/**
 * Call OpenAI-compatible API (works for OpenAI, Azure OpenAI, OpenRouter, Groq).
 */
async function callOpenAI({ systemPrompt, userPrompt, maxTokens, temperature, signal }) {
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

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  };
  // OpenRouter requires HTTP-Referer and X-Title headers
  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://cybercontrol.fun';
    headers['X-Title'] = 'CyberControl';
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
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
async function callAnthropic({ systemPrompt, userPrompt, maxTokens, temperature, signal }) {
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
    signal,
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

// ── Reset (for testing) ─────────────────────────────────────────────

/**
 * Reset internal state (for testing purposes).
 */
export function _reset() {
  config = null;
  usage = {
    requestCount: 0,
    tokenCount: 0,
    windowStart: Date.now(),
    windowDurationMs: DEFAULT_CONFIG.windowDurationMs,
  };
}
