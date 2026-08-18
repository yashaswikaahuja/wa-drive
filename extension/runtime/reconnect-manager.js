/**
 * CyberControl Reconnect Manager — extension/runtime/reconnect-manager.js
 * Phase 3.4 — WSS Protocol
 *
 * Manages WebSocket reconnection with exponential backoff and jitter.
 * Implements Suspended Mode compliance: while disconnected, the extension
 * must not plan, map, interpret, choose recovery, or start learning.
 *
 * ARCHITECTURE (constitution.yml, Discussion 11):
 *   Extension = Eyes + Hands. When server is unavailable:
 *     MAY: preserve transport state, buffer observations, finish
 *          already-authorized safe instructions, reconnect, show status.
 *     MUST NOT: plan, map fields, interpret knowledge, invoke AI,
 *              choose recovery, start learning/teach, select strategies.
 */

/** Default configuration. */
const DEFAULTS = {
  /** Initial delay before first reconnect attempt (ms). T4: fail-fast, not 20–30s dead air. */
  baseDelayMs: 400,
  /** Maximum delay between attempts (ms). Cap short so reconnect feels live. */
  maxDelayMs: 8_000,
  /** Backoff multiplier per attempt. */
  multiplier: 1.6,
  /** Random jitter factor (0–1). Applied as ± jitter * delay. */
  jitter: 0.2,
  /** Maximum number of attempts before giving up (0 = unlimited). */
  maxAttempts: 0,
};

class ReconnectManager {
  /**
   * @param {object} [options]
   * @param {number} [options.baseDelayMs]
   * @param {number} [options.maxDelayMs]
   * @param {number} [options.multiplier]
   * @param {number} [options.jitter]
   * @param {number} [options.maxAttempts]
   * @param {function} [options.onAttempt] — (attempt, delayMs) => void
   * @param {function} [options.onGiveUp] — (attempts) => void
   */
  constructor(options = {}) {
    this._config = { ...DEFAULTS, ...options };
    this._onAttempt = options.onAttempt || null;
    this._onGiveUp = options.onGiveUp || null;

    /** @type {number} Current attempt count. */
    this._attempts = 0;

    /** @type {number|null} Current timer ID. */
    this._timer = null;

    /** @type {boolean} Whether reconnection is active. */
    this._active = false;
  }

  /**
   * Current attempt count.
   */
  get attempts() { return this._attempts; }

  /**
   * Whether reconnection scheduling is active.
   */
  get active() { return this._active; }

  /**
   * Schedule a reconnection attempt.
   * @param {function} connectFn — the function to call to initiate connection
   */
  scheduleReconnect(connectFn) {
    if (this._timer !== null) return; // Already scheduled
    this._active = true;
    this._attempts += 1;

    // Check max attempts
    if (this._config.maxAttempts > 0 && this._attempts > this._config.maxAttempts) {
      this._active = false;
      if (this._onGiveUp) this._onGiveUp(this._attempts - 1);
      return;
    }

    const delay = this._computeDelay();
    if (this._onAttempt) this._onAttempt(this._attempts, delay);

    this._timer = setTimeout(() => {
      this._timer = null;
      connectFn();
    }, delay);
  }

  /**
   * Reset the manager (on successful connection).
   */
  reset() {
    this._attempts = 0;
    this._active = false;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /**
   * Cancel any pending reconnection.
   */
  cancel() {
    this._active = false;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /**
   * Compute the next delay with exponential backoff and jitter.
   * @returns {number} delay in ms
   */
  _computeDelay() {
    const { baseDelayMs, maxDelayMs, multiplier, jitter } = this._config;
    // Exponential: base * multiplier^(attempts-1)
    const exponential = baseDelayMs * Math.pow(multiplier, this._attempts - 1);
    const capped = Math.min(exponential, maxDelayMs);
    // Jitter: ± jitter * capped
    const jitterRange = capped * jitter;
    const jitterValue = (Math.random() * 2 - 1) * jitterRange;
    return Math.max(0, Math.round(capped + jitterValue));
  }

  /**
   * Get the current state for diagnostics.
   */
  getState() {
    return {
      active: this._active,
      attempts: this._attempts,
      maxAttempts: this._config.maxAttempts,
      nextDelayEstimate: this._active ? this._computeDelay() : null,
    };
  }
}

// Export for both ESM and content-script/service-worker contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReconnectManager, DEFAULTS };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcReconnectManager = ReconnectManager;
}
