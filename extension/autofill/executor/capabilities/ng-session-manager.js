/**
 * ng-session-manager — ng-dropdown Replay Session Manager
 *
 * Manages the lifecycle of ng-dropdown fill sessions stored in a Map.
 * Each session tracks poll timers, timeout IDs, and a MutationObserver
 * that must all be cleaned up when a session is cancelled or superseded.
 *
 * The session store is injected so this capability is testable without
 * a real browser window.
 *
 * Public API (on globalThis.CcNgSessionManager):
 *   cancelSession(label, sessions)  — cancel + cleanup a named session
 *   createSession(label, sessions)  — register a new blank session
 *   cleanupSession(session, sessions, label)  — cleanup without deleting from store
 *
 * sessions: Map<string, NgSession>   — injected store (window._ccReplaySessions in production)
 *
 * NgSession shape:
 *   { id, fieldKey, resolved, cancelled, pollTimer, timeoutIds, observer, startedAt, _result? }
 *
 * See ng-session-manager.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Cancel an active session by label.
   * Clears poll timer, all timeout IDs, disconnects MutationObserver,
   * and removes the session from the store.
   *
   * No-op if sessions is null/undefined or label not present.
   *
   * @param {string} label       — field key / session label
   * @param {Map}    sessions    — session store (window._ccReplaySessions)
   */
  function cancelSession(label, sessions) {
    if (!sessions || !sessions.has(label)) return;
    var old = sessions.get(label);
    old.cancelled = true;
    try { clearInterval(old.pollTimer); } catch (e) {}
    (old.timeoutIds || []).forEach(function (id) { try { clearTimeout(id); } catch (e) {} });
    if (old.observer) { try { old.observer.disconnect(); } catch (e) {} old.observer = null; }
    sessions.delete(label);
  }

  /**
   * Create and register a new blank session.
   *
   * @param {string} label    — field key / session label
   * @param {Map}    sessions — session store
   * @returns {NgSession}
   */
  function createSession(label, sessions) {
    var session = {
      id: Math.random().toString(36).slice(2, 8),
      fieldKey: label,
      resolved: false,
      cancelled: false,
      pollTimer: null,
      timeoutIds: [],
      observer: null,
      startedAt: Date.now(),
    };
    sessions.set(label, session);
    return session;
  }

  /**
   * Clean up a session's resources without deleting it from the store.
   * Used by the session itself when it resolves normally.
   *
   * @param {NgSession} session
   * @param {Map}       sessions
   * @param {string}    label
   */
  function cleanupSession(session, sessions, label) {
    try { clearInterval(session.pollTimer); } catch (e) {}
    (session.timeoutIds || []).forEach(function (id) { try { clearTimeout(id); } catch (e) {} });
    if (session.observer) { try { session.observer.disconnect(); } catch (e) {} session.observer = null; }
    if (sessions && label !== undefined) sessions.delete(label);
  }

  root.CcNgSessionManager = {
    cancelSession: cancelSession,
    createSession: createSession,
    cleanupSession: cleanupSession,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
