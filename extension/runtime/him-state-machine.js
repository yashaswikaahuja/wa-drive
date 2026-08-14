/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */
(function () {
'use strict';

/**
 * CyberControl HIM State Machine — extension/runtime/him-state-machine.js
 * Phase 4.0 — Human Interaction Mode client-side state tracking
 *
 * Tracks the lifecycle of a single HIM checkpoint within an executing plan.
 * Each instance is scoped to (session_id, plan_id, step_id, nonce).
 *
 * INVARIANTS (architecture/him-protocol.yml §state_machine):
 *  - Only the server may authorize continuation (→ continued)
 *  - Only the server may declare timeout (→ expired)
 *  - Extension may pause (→ waiting_human) and detect (→ human_active)
 *  - Terminal states (continued, cancelled, expired, failed) cannot resurrect
 *  - Each instance scoped to exactly one (session_id, plan_id, step_id, nonce)
 */

const HIM_PROTOCOL_VERSION = '1.0.0';

/** All valid HIM states. */
const STATES = Object.freeze({
  IDLE: 'idle',
  PLAN_EXECUTING: 'plan_executing',
  WAITING_HUMAN: 'waiting_human',
  HUMAN_ACTIVE: 'human_active',
  CONTINUED: 'continued',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  FAILED: 'failed',
});

/** Terminal states that cannot transition out. */
const TERMINAL_STATES = Object.freeze(new Set([
  STATES.CONTINUED,
  STATES.CANCELLED,
  STATES.EXPIRED,
  STATES.FAILED,
]));

/** Owner classification for transition authorization. */
const OWNERS = Object.freeze({
  SERVER: 'server',
  EXTENSION: 'extension',
  OPERATOR: 'operator',
});

/**
 * Legal transitions table.
 * Key: "from→to", Value: { trigger, owner }[]
 */
const TRANSITIONS = Object.freeze({
  'idle→plan_executing': [
    { trigger: 'plan_dispatched', owner: OWNERS.SERVER },
  ],
  'plan_executing→waiting_human': [
    { trigger: 'him_step_reached', owner: OWNERS.EXTENSION },
  ],
  'waiting_human→human_active': [
    { trigger: 'operator_engaged', owner: OWNERS.EXTENSION },
  ],
  'waiting_human→continued': [
    { trigger: 'him_confirmation_valid', owner: OWNERS.SERVER },
  ],
  'human_active→continued': [
    { trigger: 'him_confirmation_valid', owner: OWNERS.SERVER },
  ],
  'waiting_human→cancelled': [
    { trigger: 'operator_cancel', owner: OWNERS.OPERATOR },
  ],
  'human_active→cancelled': [
    { trigger: 'operator_cancel', owner: OWNERS.OPERATOR },
  ],
  'waiting_human→expired': [
    { trigger: 'him_timeout', owner: OWNERS.SERVER },
  ],
  'human_active→expired': [
    { trigger: 'him_timeout', owner: OWNERS.SERVER },
  ],
  'waiting_human→failed': [
    { trigger: 'bridge_error', owner: OWNERS.EXTENSION },
  ],
  'human_active→failed': [
    { trigger: 'bridge_error', owner: OWNERS.EXTENSION },
  ],
  'continued→plan_executing': [
    { trigger: 'resume_dispatched', owner: OWNERS.SERVER },
  ],
});

/**
 * HIM State Machine instance.
 * One instance per (session_id, plan_id, step_id, nonce).
 */
class HimStateMachine {
  /**
   * @param {object} scope
   * @param {string} scope.session_id
   * @param {string} scope.plan_id
   * @param {string} scope.step_id
   * @param {string} scope.nonce
   */
  constructor(scope) {
    if (!scope || !scope.session_id || !scope.plan_id || !scope.step_id || !scope.nonce) {
      throw new Error('HimStateMachine: scope requires session_id, plan_id, step_id, nonce');
    }
    this._scope = Object.freeze({ ...scope });
    this._state = STATES.IDLE;
    this._listeners = [];
    this._history = [];
    this._createdAt = Date.now();
  }

  /** Current state. */
  getState() {
    return this._state;
  }

  /** Scoping identifiers. */
  getScope() {
    return this._scope;
  }

  /** Whether current state is terminal (cannot transition out). */
  isTerminal() {
    return TERMINAL_STATES.has(this._state);
  }

  /** Transition history for diagnostics. */
  getHistory() {
    return this._history.slice();
  }

  /**
   * Attempt a state transition.
   * @param {string} from — expected current state (must match)
   * @param {string} to — target state
   * @param {string} trigger — event that caused this transition
   * @param {string} owner — who initiated (server | extension | operator)
   * @returns {{ ok: boolean, error?: string }}
   */
  transition(from, to, trigger, owner) {
    // Current state must match caller's expectation
    if (this._state !== from) {
      return {
        ok: false,
        error: `State mismatch: expected '${from}', actual '${this._state}'`,
      };
    }

    // Terminal states cannot resurrect
    if (TERMINAL_STATES.has(this._state)) {
      return {
        ok: false,
        error: `Cannot transition from terminal state '${this._state}'`,
      };
    }

    // Validate transition is legal
    const key = `${from}→${to}`;
    const allowed = TRANSITIONS[key];
    if (!allowed) {
      return {
        ok: false,
        error: `Illegal transition: ${key}`,
      };
    }

    // Validate trigger and owner match a legal combination
    const match = allowed.find(t => t.trigger === trigger && t.owner === owner);
    if (!match) {
      return {
        ok: false,
        error: `Transition ${key} not authorized for trigger='${trigger}' owner='${owner}'`,
      };
    }

    // Enforce invariants
    if (to === STATES.CONTINUED && owner !== OWNERS.SERVER) {
      return {
        ok: false,
        error: 'Only server can authorize continuation (→continued)',
      };
    }
    if (to === STATES.EXPIRED && owner !== OWNERS.SERVER) {
      return {
        ok: false,
        error: 'Only server can declare timeout (→expired)',
      };
    }

    // Perform transition
    const previousState = this._state;
    this._state = to;

    const event = Object.freeze({
      from: previousState,
      to,
      trigger,
      owner,
      timestamp: Date.now(),
      scope: this._scope,
    });
    this._history.push(event);

    // Emit to listeners
    for (const listener of this._listeners) {
      try { listener(event); } catch (e) { /* listener errors must not break state machine */ }
    }

    return { ok: true };
  }

  /**
   * Reset to idle state. Only valid from terminal states or idle itself.
   * Used when creating a new HIM cycle after the previous one completed.
   */
  reset() {
    if (!this.isTerminal() && this._state !== STATES.IDLE) {
      return {
        ok: false,
        error: `Cannot reset from non-terminal active state '${this._state}'`,
      };
    }
    const previousState = this._state;
    this._state = STATES.IDLE;
    this._history = [];

    const event = Object.freeze({
      from: previousState,
      to: STATES.IDLE,
      trigger: 'reset',
      owner: OWNERS.EXTENSION,
      timestamp: Date.now(),
      scope: this._scope,
    });
    for (const listener of this._listeners) {
      try { listener(event); } catch (e) { /* swallow */ }
    }
    return { ok: true };
  }

  /**
   * Register a transition listener.
   * @param {function} fn — (event) => void
   * @returns {function} unsubscribe function
   */
  on(fn) {
    if (typeof fn !== 'function') throw new Error('Listener must be a function');
    this._listeners.push(fn);
    return () => {
      const idx = this._listeners.indexOf(fn);
      if (idx !== -1) this._listeners.splice(idx, 1);
    };
  }

  /**
   * Destroy instance — removes all listeners.
   */
  destroy() {
    this._listeners.length = 0;
  }
}

const api = {
  HimStateMachine,
  STATES,
  TERMINAL_STATES,
  TRANSITIONS,
  OWNERS,
  HIM_PROTOCOL_VERSION,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof globalThis !== 'undefined') {
  globalThis.CcHimStateMachine = api;
}
})();
