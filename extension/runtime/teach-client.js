/**
 * CyberControl Teach Client — extension/runtime/teach-client.js
 * Phase 5.1 — Server Behavioral Teach (Unknown Widgets)
 *
 * Lightweight extension-side teach executor. Runs in the content script/
 * service worker context. Responsibilities:
 *   - Receives teach prompts from server via WSS
 *   - Observes operator interactions (clicks, types, selections)
 *   - Reports raw observations back to server
 *   - DOES NOT interpret or extract patterns (server-side only)
 *
 * ARCHITECTURE (constitution.yml):
 *   Extension = Eyes + Hands. This module is "Eyes" during teach.
 *   No AI/LLM calls. No pattern interpretation. Only observe and report.
 *
 * Export: CJS/globalThis dual export (works in content scripts and service workers).
 */

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Events to observe during teach mode.
 */
const OBSERVED_EVENTS = [
  'click', 'dblclick', 'input', 'change', 'focus', 'blur',
  'keydown', 'mousedown', 'mouseup',
];

/**
 * Teach client states.
 */
const TeachClientState = {
  IDLE: 'idle',
  OBSERVING: 'observing',
  PAUSED: 'paused',
};

/**
 * Maximum queued observations before forced flush.
 */
const FLUSH_THRESHOLD = 20;

/**
 * Flush interval (ms) — send queued observations to server.
 */
const FLUSH_INTERVAL_MS = 500;

// ═══════════════════════════════════════════════════════════════════════
// TEACH CLIENT CLASS
// ═══════════════════════════════════════════════════════════════════════

class TeachClient {
  /**
   * @param {object} options
   * @param {function} options.sendMessage — (type: string, payload: object) => void
   *   Sends a WSS message via the existing WsClient.
   * @param {function} [options.resolveNode] — (element: Element) => { node_id, context_id, tag, role, label }
   *   Resolves a DOM element to its PageSnapshot node reference.
   *   Falls back to basic tag/role extraction if not provided.
   * @param {function} [options.getElementState] — (element: Element) => object
   *   Captures observable state of an element (value, checked, expanded, etc.)
   * @param {function} [options.onStateChange] — (state: string) => void
   */
  constructor(options) {
    this._sendMessage = options.sendMessage;
    this._resolveNode = options.resolveNode || _defaultResolveNode;
    this._getElementState = options.getElementState || _defaultGetElementState;
    this._onStateChange = options.onStateChange || null;

    /** @type {string} */
    this._state = TeachClientState.IDLE;

    /** @type {string|null} Current teach session ID (from server). */
    this._teachSessionId = null;

    /** @type {string|null} Target node_id being taught. */
    this._targetNodeId = null;

    /** @type {string|null} Target context_id. */
    this._targetContextId = null;

    /** @type {Array<object>} Queued observations not yet sent. */
    this._queue = [];

    /** @type {number|null} Flush timer ID. */
    this._flushTimer = null;

    /** @type {AbortController|null} For removing event listeners. */
    this._abortController = null;

    /** @type {Element|null} Cached state-before element (for before/after pairs). */
    this._lastFocusedElement = null;

    /** @type {object|null} State captured on focus (before interaction). */
    this._stateBefore = null;
  }

  /**
   * Current teach client state.
   */
  get state() { return this._state; }

  /**
   * Active teach session ID (null when idle).
   */
  get teachSessionId() { return this._teachSessionId; }

  // ─── Server prompt handling ─────────────────────────────────────────

  /**
   * Handle an incoming teach_prompt message from the server.
   * This is the ONLY entry point for server communication.
   *
   * @param {object} message — the teach_prompt message
   * @param {string} message.promptType — 'begin_observe' | 'probe_request' | 'stop_observe' | 'session_complete' | 'session_failed'
   */
  handleTeachPrompt(message) {
    switch (message.promptType) {
      case 'begin_observe':
        this._beginObserving(message);
        break;

      case 'probe_request':
        this._executeProbe(message);
        break;

      case 'stop_observe':
        this._stopObserving();
        break;

      case 'session_complete':
        this._endSession('complete');
        break;

      case 'session_failed':
        this._endSession('failed');
        break;

      default:
        // Unknown prompt — ignore (server may be newer version)
        break;
    }
  }

  /**
   * Manually stop the teach client (e.g. page unload).
   */
  destroy() {
    this._stopObserving();
    this._state = TeachClientState.IDLE;
    this._teachSessionId = null;
  }

  // ─── Internal: observation lifecycle ────────────────────────────────

  /**
   * Begin observing operator interactions for a teach session.
   */
  _beginObserving(message) {
    this._teachSessionId = message.teachSessionId;
    this._targetNodeId = message.targetNodeId || null;
    this._targetContextId = message.targetContextId || null;

    this._queue = [];
    this._setState(TeachClientState.OBSERVING);

    // Attach event listeners
    this._abortController = new AbortController();
    const signal = this._abortController.signal;
    const doc = typeof document !== 'undefined' ? document : null;

    if (doc) {
      for (const eventName of OBSERVED_EVENTS) {
        doc.addEventListener(eventName, this._handleEvent.bind(this), {
          capture: true,
          passive: true,
          signal,
        });
      }
    }

    // Start flush timer
    this._flushTimer = setInterval(() => this._flush(), FLUSH_INTERVAL_MS);
  }

  /**
   * Stop observing and flush remaining queue.
   */
  _stopObserving() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }

    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }

    // Final flush
    this._flush();

    this._setState(TeachClientState.PAUSED);
  }

  /**
   * End the session entirely.
   */
  _endSession(reason) {
    this._stopObserving();
    this._setState(TeachClientState.IDLE);
    this._teachSessionId = null;
    this._targetNodeId = null;
    this._targetContextId = null;
    this._queue = [];
  }

  // ─── Internal: event handling ───────────────────────────────────────

  /**
   * Handle a DOM event during teach observation.
   * Captures the action and observable state, queues for sending.
   *
   * @param {Event} event
   */
  _handleEvent(event) {
    if (this._state !== TeachClientState.OBSERVING) return;

    const element = event.target;
    if (!element || !element.nodeType || element.nodeType !== 1) return;

    // Resolve the element to a node reference
    const target = this._resolveNode(element);

    // Build the observation
    const observation = {
      action_type: _mapEventType(event.type),
      target,
      timestamp: Date.now(),
      metadata: _extractMetadata(event),
    };

    // Capture state transitions for meaningful events
    if (event.type === 'focus') {
      this._lastFocusedElement = element;
      this._stateBefore = this._getElementState(element);
      observation.state_before = this._stateBefore;
    } else if (event.type === 'blur' || event.type === 'change') {
      if (this._lastFocusedElement === element && this._stateBefore) {
        observation.state_before = this._stateBefore;
        observation.state_after = this._getElementState(element);
      }
      this._lastFocusedElement = null;
      this._stateBefore = null;
    } else if (event.type === 'click' || event.type === 'dblclick') {
      // Capture state after click (may cause expansion, etc.)
      observation.state_before = this._getElementState(element);
      // Defer state_after capture slightly to allow DOM update
      const stateAfterDeferred = () => {
        const afterState = this._getElementState(element);
        if (JSON.stringify(observation.state_before) !== JSON.stringify(afterState)) {
          observation.state_after = afterState;
        }
      };
      // Use microtask to capture post-event state
      if (typeof Promise !== 'undefined') {
        Promise.resolve().then(stateAfterDeferred);
      }
    } else if (event.type === 'input') {
      observation.state_after = this._getElementState(element);
    }

    this._queue.push(observation);

    // Auto-flush if queue is full
    if (this._queue.length >= FLUSH_THRESHOLD) {
      this._flush();
    }
  }

  /**
   * Execute a probe action requested by the server.
   * The server may ask the client to perform a specific action to observe response.
   *
   * @param {object} message
   * @param {object} message.probe — { action, targetNodeId, targetContextId, params }
   */
  _executeProbe(message) {
    const { probe } = message;
    if (!probe) return;

    // Find the target element by node_id
    // This relies on the binding registry or DOM gateway having a lookup
    const element = _findElementByNodeId(probe.targetNodeId);
    if (!element) {
      // Report probe failure
      this._sendMessage('teach_observation', {
        data: {
          type: 'probe_result',
          teachSessionId: this._teachSessionId,
          probe_action: probe.action,
          success: false,
          reason: 'element_not_found',
        },
      });
      return;
    }

    // Capture state before probe
    const stateBefore = this._getElementState(element);

    // Execute the probe action
    _performAction(element, probe.action, probe.params || {});

    // Capture state after (deferred for DOM update)
    setTimeout(() => {
      const stateAfter = this._getElementState(element);
      this._sendMessage('teach_observation', {
        data: {
          type: 'probe_result',
          teachSessionId: this._teachSessionId,
          probe_action: probe.action,
          success: true,
          target: this._resolveNode(element),
          state_before: stateBefore,
          state_after: stateAfter,
          timestamp: Date.now(),
        },
      });
    }, 100);
  }

  // ─── Internal: flush ────────────────────────────────────────────────

  /**
   * Send queued observations to the server.
   */
  _flush() {
    if (this._queue.length === 0) return;
    if (!this._teachSessionId) return;

    const batch = this._queue.splice(0);
    this._sendMessage('teach_observation', {
      data: {
        type: 'observation_batch',
        teachSessionId: this._teachSessionId,
        observations: batch,
        batchSize: batch.length,
        timestamp: Date.now(),
      },
    });
  }

  // ─── Internal: state management ────────────────────────────────────

  _setState(newState) {
    if (this._state === newState) return;
    this._state = newState;
    if (this._onStateChange) this._onStateChange(newState);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS (module-level, not class methods)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Map DOM event type to our canonical action_type.
 */
function _mapEventType(eventType) {
  switch (eventType) {
    case 'mousedown': return 'click'; // normalize to click
    case 'mouseup': return 'click';
    case 'input': return 'type';
    default: return eventType;
  }
}

/**
 * Extract relevant metadata from an event.
 */
function _extractMetadata(event) {
  const meta = {};
  if (event.type === 'keydown' || event.type === 'keyup') {
    meta.key = event.key;
    meta.code = event.code;
    meta.ctrlKey = event.ctrlKey;
    meta.altKey = event.altKey;
    meta.shiftKey = event.shiftKey;
  }
  if (event.type === 'click' || event.type === 'dblclick' || event.type === 'mousedown') {
    meta.button = event.button;
    meta.clientX = event.clientX;
    meta.clientY = event.clientY;
  }
  return meta;
}

/**
 * Default node resolver — extracts basic info from a DOM element.
 * Used when no binding registry lookup is available.
 */
function _defaultResolveNode(element) {
  if (!element) return { node_id: null, context_id: null, tag: null, role: null, label: null };

  return {
    node_id: element.getAttribute?.('data-cc-node-id') || null,
    context_id: element.getAttribute?.('data-cc-context-id') ||
                element.closest?.('[data-cc-context-id]')?.getAttribute?.('data-cc-context-id') || null,
    tag: element.tagName?.toLowerCase() || null,
    role: element.getAttribute?.('role') || _inferRole(element) || null,
    label: _getLabel(element),
  };
}

/**
 * Default state extractor — captures observable state from a DOM element.
 */
function _defaultGetElementState(element) {
  if (!element) return {};

  const state = {};

  // Value
  if ('value' in element) state.value = element.value;

  // Checked (checkbox/radio)
  if ('checked' in element) state.checked = element.checked;

  // Selected (option)
  if ('selected' in element) state.selected = element.selected;

  // Disabled
  if (element.disabled != null) state.disabled = element.disabled;

  // ARIA expanded (custom dropdowns)
  const expanded = element.getAttribute?.('aria-expanded');
  if (expanded != null) state.expanded = expanded === 'true';

  // ARIA selected
  const ariaSelected = element.getAttribute?.('aria-selected');
  if (ariaSelected != null) state.selected = ariaSelected === 'true';

  // Visibility
  if (element.offsetParent !== undefined) {
    state.visible = element.offsetParent !== null || element.offsetWidth > 0;
  }

  // Open (details/dialog)
  if ('open' in element) state.opened = element.open;

  return state;
}

/**
 * Infer ARIA role from element tag.
 */
function _inferRole(element) {
  const tag = element.tagName?.toLowerCase();
  switch (tag) {
    case 'input': return element.type || 'textbox';
    case 'select': return 'combobox';
    case 'textarea': return 'textbox';
    case 'button': return 'button';
    case 'a': return 'link';
    case 'option': return 'option';
    default: return null;
  }
}

/**
 * Get accessible label for an element.
 */
function _getLabel(element) {
  // aria-label
  const ariaLabel = element.getAttribute?.('aria-label');
  if (ariaLabel) return ariaLabel;

  // aria-labelledby
  const labelledBy = element.getAttribute?.('aria-labelledby');
  if (labelledBy && typeof document !== 'undefined') {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return labelEl.textContent?.trim()?.slice(0, 100) || null;
  }

  // Associated <label>
  if (element.id && typeof document !== 'undefined') {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label.textContent?.trim()?.slice(0, 100) || null;
  }

  // placeholder
  const placeholder = element.getAttribute?.('placeholder');
  if (placeholder) return placeholder;

  // title
  const title = element.getAttribute?.('title');
  if (title) return title;

  return null;
}

/**
 * Find a DOM element by its cc-node-id attribute.
 * @param {string} nodeId
 * @returns {Element|null}
 */
function _findElementByNodeId(nodeId) {
  if (!nodeId || typeof document === 'undefined') return null;
  return document.querySelector(`[data-cc-node-id="${nodeId}"]`) || null;
}

/**
 * Perform a synthetic action on an element (for probing).
 * Dispatches real DOM events.
 */
function _performAction(element, action, params) {
  if (!element) return;

  switch (action) {
    case 'click':
      element.focus?.();
      element.click?.();
      break;

    case 'focus':
      element.focus?.();
      break;

    case 'type':
      element.focus?.();
      if (params.text) {
        // Set value and dispatch input event
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(element), 'value'
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(element, params.text);
        } else {
          element.value = params.text;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      break;

    case 'key_press':
      if (params.key) {
        element.dispatchEvent(new KeyboardEvent('keydown', {
          key: params.key,
          code: params.code || params.key,
          bubbles: true,
        }));
        element.dispatchEvent(new KeyboardEvent('keyup', {
          key: params.key,
          code: params.code || params.key,
          bubbles: true,
        }));
      }
      break;

    case 'scroll':
      element.scrollTop = params.scrollTop || 0;
      break;

    default:
      break;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CJS / globalThis DUAL EXPORT
// ═══════════════════════════════════════════════════════════════════════

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TeachClient, TeachClientState, OBSERVED_EVENTS, FLUSH_THRESHOLD, FLUSH_INTERVAL_MS };
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcTeachClient = TeachClient;
  globalThis.CcTeachClientState = TeachClientState;
}
