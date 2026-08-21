/**
 * fill-debug-emitter — Debug Event Queue + Emitter
 *
 * Assembles fill debug events, batches them in a queue, and flushes them
 * to an injected sender (Chrome port or sendMessage). The sender is injected
 * so this capability is fully testable without a browser.
 *
 * Events are coalesced with a 40ms timer. High-priority events
 * (fill.start, fill.end, queue >= 6) flush immediately.
 *
 * Public API (on globalThis.CcFillDebugEmitter):
 *   createEmitter(opts) => emitter
 *
 * emitter:
 *   emit(event, payload)   — enqueue and possibly flush
 *   flush()                — flush immediately
 *   queue                  — read-only access to pending queue (for tests)
 *
 * See fill-debug-emitter.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Create a fill debug emitter.
   *
   * @param {object} opts
   * @param {function(): string} opts.getRunId       — returns current fillRunId
   * @param {function(): string} opts.getRv           — returns RUNTIME_VERSION
   * @param {function(): string} [opts.getHostname]  — returns hostname (default: location.hostname)
   * @param {function(Array): void} opts.send         — batch sender (receives array of event objects)
   * @returns {{ emit, flush, queue }}
   */
  function createEmitter(opts) {
    opts = opts || {};
    var getRunId   = opts.getRunId   || function () { return ''; };
    var getRv      = opts.getRv      || function () { return ''; };
    var getHostname = opts.getHostname || function () {
      return (typeof location !== 'undefined') ? location.hostname : '';
    };
    var send = opts.send || function () {};

    var _queue = [];
    var _timer = null;

    function _flush() {
      if (!_queue.length) return;
      var batch = _queue.splice(0, 40);
      send(batch);
      if (_queue.length) _schedule();
    }

    function _schedule() {
      if (_timer) return;
      _timer = setTimeout(function () {
        _timer = null;
        _flush();
      }, 40);
    }

    function emit(event, payload) {
      var evt = Object.assign(
        {
          event: event,
          fillRunId: getRunId(),
          hostname: getHostname(),
          ts: Date.now(),
          rv: getRv(),
        },
        payload || {}
      );
      // Rename widget type so it doesn't clash with message envelope type
      if (evt.type && evt.type !== 'FILL_DEBUG') {
        evt.fieldType = evt.type;
        delete evt.type;
      }
      _queue.push(evt);
      // fill.start / fill.end + large batches flush immediately
      var immediate = event === 'fill.start' || event === 'fill.end' || _queue.length >= 6;
      if (immediate) {
        if (_timer) { clearTimeout(_timer); _timer = null; }
        _flush();
      } else {
        _schedule();
      }
    }

    function flush() {
      if (_timer) { clearTimeout(_timer); _timer = null; }
      _flush();
    }

    return {
      emit: emit,
      flush: flush,
      get queue() { return _queue; },
    };
  }

  root.CcFillDebugEmitter = {
    createEmitter: createEmitter,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcFillDebugEmitter;
