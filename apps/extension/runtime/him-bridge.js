/**
 * CyberControl HIM Bridge — extension/runtime/him-bridge.js
 * Phase 4.0 — Background service-worker HIM message bridge
 *
 * Routes HIM messages between server (WSS), content script (HIM UI),
 * and the action plan executor. Holds nonce in background memory ONLY.
 *
 * TRUST MODEL (architecture/him-protocol.yml §security):
 *  - Background = trusted bridge
 *  - Content script = semi-trusted presenter
 *  - Page = untrusted (cannot reach nonces or forge confirmations)
 *  - Server = authoritative (sole source of authorization)
 *
 * CRITICAL RULE: UI click is NOT authorization.
 *  Only him_response action=continue from server authorizes execution resume.
 */

const HIM_PROTOCOL_VERSION = '1.0.0';

/** Valid confirmation sources from HIM UI. */
const VALID_CONFIRMATION_SOURCES = Object.freeze(new Set([
  'him_ui_button',
  'him_ui_keyboard_enter',
]));

/** Rate limit: max 1 confirmation per nonce per window (ms). */
const RATE_LIMIT_WINDOW_MS = 5000;

class HimBridge {
  /**
   * @param {object} deps
   * @param {object} deps.wsClient — WsClient instance (sends/receives server messages)
   * @param {object} deps.stateMachineModule — CcHimStateMachine module reference
   * @param {function} [deps.onResumeExecution] — called with (plan_id, step_id) when server authorizes continue
   * @param {function} [deps.sendToContentScript] — (tabId, message) => void
   * @param {function} [deps.log] — optional logger
   */
  constructor(deps) {
    if (!deps || !deps.wsClient || !deps.stateMachineModule) {
      throw new Error('HimBridge: requires wsClient and stateMachineModule');
    }
    this._ws = deps.wsClient;
    this._sm = deps.stateMachineModule;
    this._onResumeExecution = deps.onResumeExecution || null;
    this._sendToContentScript = deps.sendToContentScript || null;
    this._log = deps.log || (() => {});

    /** @type {Map<string, { machine: HimStateMachine, nonce: string, tabId: number, request: object, lastConfirmAt: number }>} */
    this._activeSessions = new Map(); // keyed by nonce

    /** @type {Map<string, number>} nonce → last confirmation timestamp (rate limiting) */
    this._confirmTimestamps = new Map();

    this._setupWsListener();
  }

  // ─── Server → Extension (via WSS) ──────────────────────────────────────

  /**
   * Handle incoming server message routed from WSS client.
   * Called by the WSS onMessage handler for HIM-type messages.
   * @param {object} msg
   * @param {number} [tabId] — tab where the plan is executing
   */
  handleServerMessage(msg, tabId) {
    if (!msg || !msg.message_type) return;
    if (msg.him_protocol_version !== HIM_PROTOCOL_VERSION) {
      this._log('[HIM-Bridge] Rejecting unknown protocol version:', msg.him_protocol_version);
      return;
    }

    switch (msg.message_type) {
      case 'him_request':
        this._handleHimRequest(msg, tabId);
        break;
      case 'him_response':
        this._handleHimResponse(msg);
        break;
      case 'him_timeout':
        this._handleHimTimeout(msg);
        break;
      default:
        // Unknown HIM message type — silently drop (security: no error leak)
        break;
    }
  }

  // ─── Content Script → Background ──────────────────────────────────────

  /**
   * Handle messages from content script (HIM UI).
   * Called from chrome.runtime.onMessage listener.
   * @param {object} msg — { type: 'HIM_CONFIRM' | 'HIM_CANCEL', nonce, ... }
   * @param {object} sender — chrome MessageSender
   * @returns {{ handled: boolean, response?: object }}
   */
  handleContentScriptMessage(msg, sender) {
    if (!msg || !msg.type) return { handled: false };

    switch (msg.type) {
      case 'HIM_CONFIRM':
        return { handled: true, response: this._handleOperatorConfirmation(msg, sender) };
      case 'HIM_CANCEL':
        return { handled: true, response: this._handleOperatorCancel(msg, sender) };
      default:
        return { handled: false };
    }
  }

  /**
   * Handle WSS disconnect event.
   * Transitions any active HIM sessions to failed.
   */
  handleWssDisconnect() {
    for (const [nonce, session] of this._activeSessions) {
      const state = session.machine.getState();
      if (state === 'waiting_human' || state === 'human_active') {
        const result = session.machine.transition(
          state, 'failed', 'bridge_error', 'extension'
        );
        if (result.ok) {
          this._log('[HIM-Bridge] WSS disconnect → failed for nonce:', nonce);
          this._notifyContentScript(session.tabId, {
            type: 'HIM_STATE_CHANGE',
            nonce,
            state: 'failed',
            reason: 'connection_lost',
          });
        }
      }
    }
    // Do NOT auto-continue — offline_degraded rules prohibit it
  }

  /**
   * Get active session count (for diagnostics).
   */
  getActiveSessionCount() {
    return this._activeSessions.size;
  }

  /**
   * Clean up expired/completed sessions.
   */
  cleanup() {
    for (const [nonce, session] of this._activeSessions) {
      if (session.machine.isTerminal()) {
        session.machine.destroy();
        this._activeSessions.delete(nonce);
        this._confirmTimestamps.delete(nonce);
      }
    }
  }

  // ─── Internal: Server message handlers ─────────────────────────────────

  _handleHimRequest(msg, tabId) {
    const { session_id, plan_id, step_id, nonce } = msg;
    if (!session_id || !plan_id || !step_id || !nonce) {
      this._log('[HIM-Bridge] Malformed him_request — missing required fields');
      return;
    }

    // Create state machine instance scoped to this interaction
    const machine = new this._sm.HimStateMachine({
      session_id,
      plan_id,
      step_id,
      nonce,
    });

    // Transition: idle → plan_executing → waiting_human
    let result = machine.transition('idle', 'plan_executing', 'plan_dispatched', 'server');
    if (!result.ok) {
      this._log('[HIM-Bridge] Failed idle→plan_executing:', result.error);
      return;
    }
    result = machine.transition('plan_executing', 'waiting_human', 'him_step_reached', 'extension');
    if (!result.ok) {
      this._log('[HIM-Bridge] Failed plan_executing→waiting_human:', result.error);
      return;
    }

    // Store session — nonce held in background memory ONLY
    this._activeSessions.set(nonce, {
      machine,
      nonce,
      tabId: tabId || null,
      request: msg,
      lastConfirmAt: 0,
    });

    // Forward to content script for UI rendering (nonce included for correlation)
    this._notifyContentScript(tabId, {
      type: 'HIM_SHOW_PROMPT',
      nonce,
      session_id,
      plan_id,
      step_id,
      interaction_type: msg.interaction_type,
      prompt: String(msg.prompt || '').slice(0, 500),
      expires_at: msg.expires_at,
      sensitive_field: !!msg.sensitive_field,
      destructive_warning: !!msg.destructive_warning,
      show_summary: !!msg.show_summary,
      target: msg.target || null,
      auto_detect: msg.auto_detect || null,
    });

    this._log('[HIM-Bridge] HIM request active, nonce:', nonce, 'type:', msg.interaction_type);
  }

  _handleHimResponse(msg) {
    const { nonce, action } = msg;
    const session = this._activeSessions.get(nonce);
    if (!session) {
      this._log('[HIM-Bridge] him_response for unknown nonce:', nonce);
      return;
    }

    const currentState = session.machine.getState();

    if (action === 'continue') {
      // Server authorizes continuation — THIS is the only path to resume execution
      const result = session.machine.transition(
        currentState, 'continued', 'him_confirmation_valid', 'server'
      );
      if (!result.ok) {
        this._log('[HIM-Bridge] Failed →continued:', result.error);
        return;
      }

      // Notify content script to dismiss UI
      this._notifyContentScript(session.tabId, {
        type: 'HIM_STATE_CHANGE',
        nonce,
        state: 'continued',
      });

      // Resume execution — only here, after server authorization
      if (this._onResumeExecution) {
        this._onResumeExecution(msg.plan_id || session.request.plan_id, msg.step_id || session.request.step_id);
      }

      this._log('[HIM-Bridge] Server authorized continue for nonce:', nonce);
    } else if (action === 'reject') {
      // Server rejected — stay in waiting_human, notify UI
      this._notifyContentScript(session.tabId, {
        type: 'HIM_REJECTED',
        nonce,
        reason: msg.rejection_reason || 'unknown',
      });
      this._log('[HIM-Bridge] Confirmation rejected:', msg.rejection_reason);
    } else if (action === 're_prompt') {
      // Server wants to re-prompt with new nonce
      if (msg.new_nonce) {
        // Retire old session, create fresh one
        session.machine.destroy();
        this._activeSessions.delete(nonce);
        this._confirmTimestamps.delete(nonce);

        // Re-issue as new request with updated nonce
        const updatedRequest = {
          ...session.request,
          nonce: msg.new_nonce,
          expires_at: msg.new_expires_at || session.request.expires_at,
        };
        this._handleHimRequest(updatedRequest, session.tabId);
      }
      this._log('[HIM-Bridge] Re-prompt issued with new nonce');
    }
  }

  _handleHimTimeout(msg) {
    const { nonce } = msg;
    const session = this._activeSessions.get(nonce);
    if (!session) {
      this._log('[HIM-Bridge] him_timeout for unknown nonce:', nonce);
      return;
    }

    const currentState = session.machine.getState();
    if (currentState !== 'waiting_human' && currentState !== 'human_active') {
      this._log('[HIM-Bridge] him_timeout in unexpected state:', currentState);
      return;
    }

    const result = session.machine.transition(
      currentState, 'expired', 'him_timeout', 'server'
    );
    if (!result.ok) {
      this._log('[HIM-Bridge] Failed →expired:', result.error);
      return;
    }

    // Notify content script to remove UI
    this._notifyContentScript(session.tabId, {
      type: 'HIM_STATE_CHANGE',
      nonce,
      state: 'expired',
      disposition: msg.disposition || 'abort_plan',
    });

    this._log('[HIM-Bridge] HIM expired for nonce:', nonce);
  }

  // ─── Internal: Content script message handlers ─────────────────────────

  _handleOperatorConfirmation(msg, sender) {
    const { nonce, confirmation_source } = msg;

    // Validate confirmation source — must come from HIM UI
    if (!VALID_CONFIRMATION_SOURCES.has(confirmation_source)) {
      this._log('[HIM-Bridge] Invalid confirmation_source:', confirmation_source);
      return { ok: false, error: 'invalid_confirmation_source' };
    }

    const session = this._activeSessions.get(nonce);
    if (!session) {
      this._log('[HIM-Bridge] Confirmation for unknown nonce');
      return { ok: false, error: 'unknown_nonce' };
    }

    // Rate limiting: max 1 confirmation per nonce per 5s
    const now = Date.now();
    const lastConfirm = this._confirmTimestamps.get(nonce) || 0;
    if (now - lastConfirm < RATE_LIMIT_WINDOW_MS) {
      this._log('[HIM-Bridge] Rate limited confirmation for nonce:', nonce);
      return { ok: false, error: 'rate_limited' };
    }
    this._confirmTimestamps.set(nonce, now);

    const currentState = session.machine.getState();

    // Detect operator engagement if still in waiting_human
    if (currentState === 'waiting_human') {
      session.machine.transition('waiting_human', 'human_active', 'operator_engaged', 'extension');
    }

    // Forward to server — NOT treated as authorization
    // Only server's him_response action=continue will resume execution
    const confirmation = {
      him_protocol_version: HIM_PROTOCOL_VERSION,
      message_type: 'operator_confirmation',
      session_id: session.request.session_id,
      plan_id: session.request.plan_id,
      step_id: session.request.step_id,
      nonce,
      confirmed_at: new Date().toISOString(),
      operator_action: this._resolveOperatorAction(session.request.interaction_type),
      confirmation_source,
    };

    try {
      this._ws.send('him_message', { him: confirmation });
      this._log('[HIM-Bridge] Forwarded confirmation to server, nonce:', nonce);
      return { ok: true, status: 'awaiting_server_authorization' };
    } catch (e) {
      this._log('[HIM-Bridge] Failed to send confirmation:', e.message);
      // WSS unavailable — transition to failed
      const state = session.machine.getState();
      if (state === 'waiting_human' || state === 'human_active') {
        session.machine.transition(state, 'failed', 'bridge_error', 'extension');
        this._notifyContentScript(session.tabId, {
          type: 'HIM_STATE_CHANGE',
          nonce,
          state: 'failed',
          reason: 'connection_lost',
        });
      }
      return { ok: false, error: 'send_failed' };
    }
  }

  _handleOperatorCancel(msg, sender) {
    const { nonce, reason } = msg;
    const session = this._activeSessions.get(nonce);
    if (!session) {
      return { ok: false, error: 'unknown_nonce' };
    }

    const currentState = session.machine.getState();
    if (currentState !== 'waiting_human' && currentState !== 'human_active') {
      return { ok: false, error: 'invalid_state_for_cancel' };
    }

    const result = session.machine.transition(
      currentState, 'cancelled', 'operator_cancel', 'operator'
    );
    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    // Forward cancellation to server
    const cancelMsg = {
      him_protocol_version: HIM_PROTOCOL_VERSION,
      message_type: 'him_cancel',
      session_id: session.request.session_id,
      plan_id: session.request.plan_id,
      step_id: session.request.step_id,
      nonce,
      cancelled_at: new Date().toISOString(),
      reason: reason || 'operator_explicit',
    };

    try {
      this._ws.send('him_message', { him: cancelMsg });
    } catch (e) {
      this._log('[HIM-Bridge] Failed to send cancel:', e.message);
    }

    // Notify content script to dismiss UI
    this._notifyContentScript(session.tabId, {
      type: 'HIM_STATE_CHANGE',
      nonce,
      state: 'cancelled',
    });

    this._log('[HIM-Bridge] Operator cancelled, nonce:', nonce);
    return { ok: true };
  }

  // ─── Internal: Helpers ─────────────────────────────────────────────────

  _resolveOperatorAction(interactionType) {
    switch (interactionType) {
      case 'irreversible_submit': return 'confirm_submit';
      case 'payment_authorization': return 'confirm_payment';
      case 'otp_entry':
      case 'captcha_solve':
      case 'signature':
      case 'file_upload':
        return 'confirm_with_value';
      default:
        return 'confirm_continue';
    }
  }

  _notifyContentScript(tabId, message) {
    if (!tabId) return;
    if (this._sendToContentScript) {
      this._sendToContentScript(tabId, message);
      return;
    }
    // Default: use chrome.tabs.sendMessage
    if (typeof chrome !== 'undefined' && chrome.tabs?.sendMessage) {
      chrome.tabs.sendMessage(tabId, message).catch(() => {});
    }
  }

  _setupWsListener() {
    // Listen for WSS state changes to detect disconnect
    if (this._ws._onStateChange) {
      const originalHandler = this._ws._onStateChange;
      this._ws._onStateChange = (state) => {
        if (state === 'suspended' || state === 'disconnected') {
          this.handleWssDisconnect();
        }
        originalHandler(state);
      };
    }
  }
}

const api = {
  HimBridge,
  HIM_PROTOCOL_VERSION,
  VALID_CONFIRMATION_SOURCES,
  RATE_LIMIT_WINDOW_MS,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcHimBridge = api;
}
