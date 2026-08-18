// ── shared/llm-client.js ───────────────────────────────────────────────────
// Single LLM client for all AI calls across the extension.
// Exposes: window.ccLLM = { call, parseJSON }
//
// All callers (mapper.js aiMatch, ai-resolve.js, executor.js AI select,
// background.js groqAutoTeach) should use this instead of inline fetch.
// ────────────────────────────────────────────────────────────────────────────

;(function () {
  'use strict';

  var DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
  var DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct';
  var DEFAULT_MAX_TOKENS = 500;
  var DEFAULT_TIMEOUT = 12000; // keep short so fill is not blocked; soft outer races handle rest

  /**
   * Make an LLM API call.
   *
   * @param {Object} opts
   * @param {string} opts.apiKey         - API key (required)
   * @param {string} [opts.baseUrl]      - API endpoint URL
   * @param {string} [opts.model]        - Model name
   * @param {string} opts.systemPrompt   - System message
   * @param {string} opts.userPrompt     - User message
   * @param {number} [opts.maxTokens]    - Max response tokens
   * @param {number} [opts.temperature]  - Temperature (default: undefined = provider default)
   * @param {number} [opts.timeout]      - Request timeout in ms
   * @returns {Promise<{text: string, usage: Object|null, raw: Object}>}
   */
  async function call(opts) {
    if (!opts || !opts.apiKey) {
      return { text: '', usage: null, raw: null, error: 'no-api-key' };
    }

    var url = opts.baseUrl || DEFAULT_BASE_URL;
    var model = opts.model || DEFAULT_MODEL;
    var maxTokens = opts.maxTokens || DEFAULT_MAX_TOKENS;
    var timeout = opts.timeout || DEFAULT_TIMEOUT;

    var messages = [];
    if (opts.systemPrompt) {
      messages.push({ role: 'system', content: opts.systemPrompt });
    }
    messages.push({ role: 'user', content: opts.userPrompt });

    var body = {
      model: model,
      messages: messages,
      max_tokens: maxTokens,
    };
    if (opts.temperature !== undefined) {
      body.temperature = opts.temperature;
    }

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeout);

    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + opts.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        var errText = '';
        try { errText = await res.text(); } catch (e) {}
        return { text: '', usage: null, raw: null, error: 'http-' + res.status, detail: errText };
      }

      var data = await res.json();
      var text = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      var usage = (data && data.usage) || null;
      return { text: text, usage: usage, raw: data, error: null };
    } catch (e) {
      clearTimeout(timer);
      var errMsg = e.name === 'AbortError' ? 'timeout' : e.message;
      return { text: '', usage: null, raw: null, error: errMsg };
    }
  }

  /**
   * Parse a JSON object from LLM response text.
   * Handles common LLM quirks: markdown code blocks, extra text before/after.
   *
   * @param {string} text - Raw LLM response
   * @returns {Object|null} Parsed JSON or null
   */
  function parseJSON(text) {
    if (!text) return null;
    // Strip markdown code fences if present
    var stripped = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    // Find the outermost { ... }
    var match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      // Try fixing common issues: trailing commas
      try {
        var fixed = match[0].replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(fixed);
      } catch (e2) {
        return null;
      }
    }
  }

  // Expose globally
  window.ccLLM = {
    call: call,
    parseJSON: parseJSON,
    DEFAULT_BASE_URL: DEFAULT_BASE_URL,
    DEFAULT_MODEL: DEFAULT_MODEL,
  };
})();
