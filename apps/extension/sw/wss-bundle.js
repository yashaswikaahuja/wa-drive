/**
 * AUTO-GENERATED
 * Source: @cc/wss
 * Rebuild: pnpm --filter cybercontrol-extension build
 */

/* ==== reconnect-manager.ts ==== */
const DEFAULTS = {
  /** Initial delay before first reconnect attempt (ms). T4: fail-fast, not 20–30s dead air. */
  baseDelayMs: 400,
  /** Maximum delay between attempts (ms). Cap short so reconnect feels live. */
  maxDelayMs: 8e3,
  /** Backoff multiplier per attempt. */
  multiplier: 1.6,
  /** Random jitter factor (0–1). Applied as ± jitter * delay. */
  jitter: 0.2,
  /** Maximum number of attempts before giving up (0 = unlimited). */
  maxAttempts: 0
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
    this._attempts = 0;
    this._timer = null;
    this._active = false;
  }
  /**
   * Current attempt count.
   */
  get attempts() {
    return this._attempts;
  }
  /**
   * Whether reconnection scheduling is active.
   */
  get active() {
    return this._active;
  }
  /**
   * Schedule a reconnection attempt.
   * @param {function} connectFn — the function to call to initiate connection
   */
  scheduleReconnect(connectFn) {
    if (this._timer !== null) return;
    this._active = true;
    this._attempts += 1;
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
    const exponential = baseDelayMs * Math.pow(multiplier, this._attempts - 1);
    const capped = Math.min(exponential, maxDelayMs);
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
      nextDelayEstimate: this._active ? this._computeDelay() : null
    };
  }
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { ReconnectManager, DEFAULTS };
} else if (typeof globalThis !== "undefined") {
  globalThis.CcReconnectManager = ReconnectManager;
}

/* ==== ws-client.ts ==== */
const STATE = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  SUSPENDED: "suspended"
  // server unavailable — no autonomous decisions
};
let _msgSeq = 0;
function nextMsgId() {
  _msgSeq += 1;
  return `msg.${Date.now().toString(36)}.${_msgSeq}`;
}
class WsClient {
  /**
   * @param {object} options
   * @param {string} options.url — WSS endpoint (e.g. wss://api.example.com/ws)
   * @param {string} options.token — JWT auth token
   * @param {function} [options.onMessage] — (message: object) => void
   * @param {function} [options.onStateChange] — (state: string) => void
   * @param {function} [options.onError] — (error: Error) => void
   * @param {object} [options.reconnectManager] — ReconnectManager instance
   */
  constructor(options) {
    this._url = options.url;
    this._token = options.token;
    this._onMessage = options.onMessage || null;
    this._onStateChange = options.onStateChange || null;
    this._onError = options.onError || null;
    this._reconnectManager = options.reconnectManager || null;
    this._ws = null;
    this._state = STATE.DISCONNECTED;
    this._sessionId = null;
    this._pending = /* @__PURE__ */ new Map();
    this._requestTimeout = 15e3;
    this._lastSnapshotId = null;
    this._lastRevision = null;
    this._outSeq = 0;
    this._protocolVersion = 1;
    this._tabId = options.tabId || null;
    this._workflowId = options.workflowId || null;
    this._seenServerIds = /* @__PURE__ */ new Set();
    this._lastPlanId = null;
  }
  /**
   * Current connection state.
   */
  get state() {
    return this._state;
  }
  /**
   * Server-assigned session ID (null until connected).
   */
  get sessionId() {
    return this._sessionId;
  }
  /**
   * Connect to the WebSocket server.
   */
  connect() {
    if (this._state === STATE.CONNECTED || this._state === STATE.CONNECTING) return;
    this._setState(STATE.CONNECTING);
    const wsUrl = `${this._url}?token=${encodeURIComponent(this._token)}`;
    try {
      this._ws = new WebSocket(wsUrl);
    } catch (err) {
      this._setState(STATE.SUSPENDED);
      if (this._onError) this._onError(err);
      this._scheduleReconnect();
      return;
    }
    this._ws.onopen = () => {
    };
    this._ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      this._handleMessage(msg);
    };
    this._ws.onerror = (event) => {
      if (this._onError) this._onError(new Error("WebSocket error"));
    };
    this._ws.onclose = (event) => {
      this._ws = null;
      this._sessionId = null;
      for (const [id, entry] of this._pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error(`Connection closed (code=${event.code})`));
      }
      this._pending.clear();
      if (this._state !== STATE.DISCONNECTED) {
        this._setState(STATE.SUSPENDED);
        this._scheduleReconnect();
      }
    };
  }
  /**
   * Gracefully disconnect.
   */
  disconnect() {
    this.stopHeartbeat();
    this._setState(STATE.DISCONNECTED);
    if (this._ws) {
      this._ws.close(1e3, "client_disconnect");
      this._ws = null;
    }
    this._sessionId = null;
    if (this._reconnectManager) this._reconnectManager.reset();
  }
  /**
   * Send a typed message. Returns a message ID.
   * @param {string} type
   * @param {object} [payload]
   * @returns {string} messageId
   */
  send(type, payload = {}) {
    if (this._state !== STATE.CONNECTED) {
      throw new Error(`Cannot send in state: ${this._state} (Suspended Mode)`);
    }
    const id = nextMsgId();
    this._outSeq += 1;
    const message = {
      v: this._protocolVersion,
      id,
      type,
      seq: this._outSeq,
      ts: Date.now(),
      ...this._tabId ? { tabId: this._tabId } : {},
      ...this._workflowId ? { workflowId: this._workflowId } : {},
      ...payload
    };
    this._ws.send(JSON.stringify(message));
    return id;
  }
  /**
   * Send a message and wait for a response (matched by `ref` field).
   * @param {string} type
   * @param {object} [payload]
   * @param {number} [timeoutMs]
   * @returns {Promise<object>}
   */
  request(type, payload = {}, timeoutMs) {
    const timeout = timeoutMs || this._requestTimeout;
    const id = this.send(type, payload);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`Request timeout (${type}, ${id})`));
      }, timeout);
      this._pending.set(id, { resolve, reject, timer });
    });
  }
  // ─── Typed send helpers ───────────────────────────────────────────
  /**
   * Send a PageSnapshot to the server.
   */
  sendSnapshot(snapshot) {
    this._lastSnapshotId = snapshot.snapshot_id;
    this._lastRevision = snapshot.revision;
    return this.send("page_snapshot", { snapshot });
  }
  /**
   * Send a PageDelta to the server.
   */
  sendDelta(delta) {
    this._lastRevision = delta.revision;
    return this.send("page_delta", { delta });
  }
  /**
   * Send an ExecutionObservation.
   */
  sendObservation(observation) {
    return this.send("execution_observation", { observation });
  }
  /**
   * T5 — live fill/debug event stream (field.start / wait / done / fail).
   * Non-fatal if not connected; HTTPS session post remains durable end-state.
   * @param {'field.start'|'field.wait'|'field.done'|'field.fail'|'fill.start'|'fill.end'|'auth.presence'} event
   * @param {object} [payload]
   */
  sendFillDebugEvent(event, payload = {}) {
    if (this._state !== STATE.CONNECTED) return null;
    try {
      return this.send("fill_debug_event", {
        event,
        ts: Date.now(),
        ...payload
      });
    } catch (e) {
      return null;
    }
  }
  /**
   * T4 — explicit auth presence ping (fail-fast detection of dead sockets).
   */
  async pingAuth(timeoutMs = 3e3) {
    if (this._state !== STATE.CONNECTED) {
      throw new Error(`Cannot ping in state: ${this._state}`);
    }
    return this.request("ping", { purpose: "auth_presence" }, timeoutMs);
  }
  /**
   * Heartbeat helper for presence (T4). Call on an interval from popup/background.
   */
  startHeartbeat(intervalMs = 15e3) {
    this.stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (this._state !== STATE.CONNECTED) return;
      try {
        this.send("ping", { purpose: "heartbeat", ts: Date.now() });
      } catch (e) {
      }
    }, intervalMs);
  }
  stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }
  /**
   * Request knowledge sync over WSS.
   */
  async requestSync(requestType, payload = {}) {
    return this.request("sync_request", { requestType, payload });
  }
  /**
   * Send a teach-mode observation.
   */
  sendTeachObservation(data) {
    return this.send("teach_observation", { data });
  }
  /**
   * Send resume request after reconnection.
   */
  sendResume() {
    return this.send("resume", {
      lastSnapshotId: this._lastSnapshotId,
      lastRevision: this._lastRevision
    });
  }
  // ─── Internal ─────────────────────────────────────────────────────
  _handleMessage(msg) {
    var _a, _b;
    if (msg.id && typeof msg.id === "string") {
      if (this._seenServerIds.has(msg.id)) {
        return;
      }
      this._seenServerIds.add(msg.id);
      if (this._seenServerIds.size > 512) {
        const first = this._seenServerIds.values().next().value;
        this._seenServerIds.delete(first);
      }
    }
    if (msg.ref && this._pending.has(msg.ref)) {
      const { resolve, timer } = this._pending.get(msg.ref);
      clearTimeout(timer);
      this._pending.delete(msg.ref);
      resolve(msg);
      return;
    }
    switch (msg.type) {
      case "connected":
        this._sessionId = msg.sessionId;
        if (msg.protocolVersion != null) this._protocolVersion = Number(msg.protocolVersion) || 1;
        this._setState(STATE.CONNECTED);
        if (this._reconnectManager) this._reconnectManager.reset();
        if (this._lastSnapshotId) {
          this.sendResume();
        }
        break;
      case "server_shutdown":
        this._setState(STATE.SUSPENDED);
        break;
      case "action_plan": {
        const planId = ((_a = msg.plan) == null ? void 0 : _a.plan_id) || ((_b = msg.plan) == null ? void 0 : _b.id) || null;
        if (planId && planId === this._lastPlanId) {
          return;
        }
        if (planId) this._lastPlanId = planId;
        if (this._onMessage) this._onMessage(msg);
        break;
      }
      case "pong":
        break;
      case "error":
        if (this._onError) this._onError(new Error(`Server error: ${msg.code} \u2014 ${msg.message}`));
        break;
      default:
        if (this._state === STATE.CONNECTED && this._onMessage) this._onMessage(msg);
        break;
    }
  }
  _setState(newState) {
    if (this._state === newState) return;
    this._state = newState;
    if (this._onStateChange) this._onStateChange(newState);
  }
  _scheduleReconnect() {
    if (this._state === STATE.DISCONNECTED) return;
    if (this._reconnectManager) {
      this._reconnectManager.scheduleReconnect(() => this.connect());
    }
  }
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { WsClient, STATE };
} else if (typeof globalThis !== "undefined") {
  globalThis.CcWsClient = WsClient;
  globalThis.CcWsClientSTATE = STATE;
}

/* ==== page-shot.ts ==== */
function pageShotOffsets(scrollHeight, clientHeight, maxShots) {
  const view = Math.max(1, Math.round(Number(clientHeight) || 1));
  const height = Math.max(view, Math.round(Number(scrollHeight) || view));
  const limit = Math.max(1, Math.round(Number(maxShots) || 1));
  const maxY = Math.max(0, height - view);
  const offsets = [];
  for (let y = 0; offsets.length < limit; y += view) {
    const next = Math.min(y, maxY);
    offsets.push(next);
    if (next >= maxY) break;
  }
  return { offsets, clipped: offsets[offsets.length - 1] < maxY - 1 };
}
const pageShotRoot = typeof globalThis !== "undefined" ? globalThis : this;
pageShotRoot.CcPageShot = { pageShotOffsets };

/* ==== pointer-keys.ts ==== */
function pointerClickAt(spec) {
  var g = typeof globalThis !== "undefined" ? globalThis : this;
  var doc = g.document;
  if (!doc) return { ok: false, error: "no_document" };
  function resolve(sel) {
    if (!sel) return null;
    try {
      var resolver = g.CcResolveCcSelector;
      if (resolver && typeof resolver.resolveCcSelector === "function") {
        var byCc = resolver.resolveCcSelector(sel, doc);
        if (byCc) return byCc;
      }
    } catch (e) {
    }
    try {
      var clickApi = g.CcClickControl;
      if (clickApi && typeof clickApi.elementFor === "function") {
        var byClick = clickApi.elementFor(sel, doc);
        if (byClick) return byClick;
      }
    } catch (e2) {
    }
    try {
      return doc.querySelector(sel);
    } catch (e3) {
      return null;
    }
  }
  function labelOf(el) {
    if (!el) return "";
    var aria = el.getAttribute && el.getAttribute("aria-label");
    var raw = aria || el.innerText || el.textContent || el.value || el.placeholder || "";
    return String(raw).replace(/\s+/g, " ").trim().slice(0, 80);
  }
  function makeEvent(name, point2, button2, buttons2, detail) {
    var view = doc.defaultView || g.window || g;
    var init = {
      bubbles: true,
      cancelable: true,
      view,
      clientX: point2.x,
      clientY: point2.y,
      button: button2,
      buttons: buttons2,
      detail
    };
    try {
      if (name.indexOf("pointer") === 0 && view && typeof view.PointerEvent === "function") {
        return new view.PointerEvent(name, Object.assign({ pointerId: 1, pointerType: "mouse", isPrimary: true }, init));
      }
      if (view && typeof view.MouseEvent === "function") return new view.MouseEvent(name, init);
    } catch (e) {
    }
    return { type: name, bubbles: true, cancelable: true, clientX: point2.x, clientY: point2.y, button: button2 };
  }
  function fire(el, point2, button2, buttons2, names2, detail) {
    for (var i = 0; i < names2.length; i++) {
      var ev = makeEvent(names2[i], point2, button2, buttons2, detail);
      if (el && typeof el.dispatchEvent === "function") el.dispatchEvent(ev);
    }
  }
  var selector = spec && spec.selector ? String(spec.selector) : "";
  var buttonName = spec && spec.button === "right" ? "right" : spec && spec.button === "middle" ? "middle" : "left";
  var count = Number(spec && spec.count) === 2 ? 2 : 1;
  var button = buttonName === "right" ? 2 : buttonName === "middle" ? 1 : 0;
  var buttons = button === 0 ? 1 : button === 2 ? 2 : 4;
  var target = null;
  var point = null;
  if (selector) {
    target = resolve(selector);
    if (!target) return { ok: false, error: "not_found" };
    if (typeof target.scrollIntoView === "function") {
      try {
        target.scrollIntoView({ block: "center", inline: "center" });
      } catch (e4) {
      }
    }
    var box = typeof target.getBoundingClientRect === "function" ? target.getBoundingClientRect() : null;
    if (!box || box.width < 1 || box.height < 1) return { ok: false, error: "not_visible" };
    point = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  } else {
    var x = Number(spec && spec.x);
    var y = Number(spec && spec.y);
    if (!isFinite(x) || !isFinite(y)) return { ok: false, error: "x and y required" };
    point = { x, y };
    if (typeof doc.elementFromPoint === "function") target = doc.elementFromPoint(x, y);
    if (!target) return { ok: false, error: "nothing_there", x: Math.round(x), y: Math.round(y) };
  }
  var names = buttonName === "right" ? ["pointerdown", "mousedown", "pointerup", "mouseup", "contextmenu"] : ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
  fire(target, point, button, buttons, names, 1);
  if (count === 2 && buttonName === "left") {
    fire(target, point, button, buttons, names, 2);
    var dbl = makeEvent("dblclick", point, 0, 1, 2);
    if (typeof target.dispatchEvent === "function") target.dispatchEvent(dbl);
  }
  if (buttonName === "left" && count === 1 && typeof target.click === "function") {
    try {
      target.click();
    } catch (e5) {
    }
  }
  if (typeof target.focus === "function") {
    try {
      target.focus();
    } catch (e6) {
    }
  }
  return {
    ok: true,
    url: String(g.location && g.location.href || "").split("?")[0].slice(0, 300),
    title: doc.title || "",
    x: Math.round(point.x),
    y: Math.round(point.y),
    tag: String(target.tagName || "").toLowerCase(),
    clicked: labelOf(target),
    button: buttonName,
    count
  };
}
function keyboardPress(spec) {
  var g = typeof globalThis !== "undefined" ? globalThis : this;
  var doc = g.document;
  if (!doc) return { ok: false, error: "no_document" };
  var NAMED = {
    enter: { key: "Enter", code: "Enter", keyCode: 13 },
    tab: { key: "Tab", code: "Tab", keyCode: 9 },
    escape: { key: "Escape", code: "Escape", keyCode: 27 },
    esc: { key: "Escape", code: "Escape", keyCode: 27 },
    backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
    delete: { key: "Delete", code: "Delete", keyCode: 46 },
    space: { key: " ", code: "Space", keyCode: 32 },
    arrowup: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
    arrowdown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
    arrowleft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
    arrowright: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
    home: { key: "Home", code: "Home", keyCode: 36 },
    end: { key: "End", code: "End", keyCode: 35 },
    pageup: { key: "PageUp", code: "PageUp", keyCode: 33 },
    pagedown: { key: "PageDown", code: "PageDown", keyCode: 34 }
  };
  function resolve(sel) {
    if (!sel) return null;
    try {
      var resolver = g.CcResolveCcSelector;
      if (resolver && typeof resolver.resolveCcSelector === "function") {
        var byCc = resolver.resolveCcSelector(sel, doc);
        if (byCc) return byCc;
      }
    } catch (e) {
    }
    try {
      var clickApi = g.CcClickControl;
      if (clickApi && typeof clickApi.elementFor === "function") {
        var byClick = clickApi.elementFor(sel, doc);
        if (byClick) return byClick;
      }
    } catch (e2) {
    }
    try {
      return doc.querySelector(sel);
    } catch (e3) {
      return null;
    }
  }
  function tagOf(el2) {
    return String(el2 && el2.tagName || "").toLowerCase();
  }
  function isEditable(el2) {
    if (!el2) return false;
    var tag = tagOf(el2);
    if (tag === "input" || tag === "textarea") return !el2.disabled && !el2.readOnly;
    return !!el2.isContentEditable;
  }
  function blockedText(el2) {
    if (!el2) return false;
    var t = String(el2.type || "").toLowerCase();
    if (t === "password" || t === "hidden") return true;
    var blob = ((el2.name || "") + " " + (el2.id || "") + " " + (el2.getAttribute && el2.getAttribute("aria-label") || "")).toLowerCase();
    return /captcha|otp|\bpin\b|cvv|card number/.test(blob);
  }
  function emitInput(el2, data, inputType) {
    var view = doc.defaultView || g.window || g;
    try {
      if (view && typeof view.InputEvent === "function") {
        el2.dispatchEvent(new view.InputEvent("input", { bubbles: true, cancelable: true, inputType: inputType || "insertText", data: data || null }));
        return;
      }
    } catch (e) {
    }
    try {
      if (view && typeof view.Event === "function") el2.dispatchEvent(new view.Event("input", { bubbles: true }));
    } catch (e2) {
    }
  }
  function insertText(el2, text2) {
    if (!el2 || !text2) return;
    var tag = tagOf(el2);
    if (tag === "input" || tag === "textarea") {
      var value = String(el2.value || "");
      var start = el2.selectionStart != null ? el2.selectionStart : value.length;
      var end = el2.selectionEnd != null ? el2.selectionEnd : start;
      el2.value = value.slice(0, start) + text2 + value.slice(end);
      var pos = start + String(text2).length;
      try {
        el2.setSelectionRange(pos, pos);
      } catch (e) {
      }
      emitInput(el2, text2, "insertText");
      return;
    }
    if (el2.isContentEditable && doc.execCommand) {
      try {
        doc.execCommand("insertText", false, text2);
      } catch (e2) {
      }
      emitInput(el2, text2, "insertText");
    }
  }
  function deleteOne(el2, forward) {
    var tag = tagOf(el2);
    if (tag !== "input" && tag !== "textarea") return;
    var value = String(el2.value || "");
    var start = el2.selectionStart != null ? el2.selectionStart : value.length;
    var end = el2.selectionEnd != null ? el2.selectionEnd : start;
    if (start !== end) {
      el2.value = value.slice(0, start) + value.slice(end);
      try {
        el2.setSelectionRange(start, start);
      } catch (e) {
      }
    } else if (forward) {
      el2.value = value.slice(0, start) + value.slice(start + 1);
      try {
        el2.setSelectionRange(start, start);
      } catch (e2) {
      }
    } else if (start > 0) {
      el2.value = value.slice(0, start - 1) + value.slice(start);
      try {
        el2.setSelectionRange(start - 1, start - 1);
      } catch (e3) {
      }
    }
    emitInput(el2, null, forward ? "deleteContentForward" : "deleteContentBackward");
  }
  function tabbables() {
    var nodes = doc.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    var out = [];
    for (var i2 = 0; i2 < nodes.length; i2++) {
      var n = nodes[i2];
      if (n.disabled) continue;
      out.push(n);
    }
    return out;
  }
  function moveTab(el2, back) {
    var list = tabbables();
    if (!list.length) return el2;
    var idx = list.indexOf(el2);
    var next = back ? idx <= 0 ? list[list.length - 1] : list[idx - 1] : idx < 0 || idx >= list.length - 1 ? list[0] : list[idx + 1];
    if (next && typeof next.focus === "function") {
      try {
        next.focus();
      } catch (e) {
      }
    }
    return next || el2;
  }
  function named(raw) {
    var token = String(raw || "").trim();
    if (!token) return null;
    var lower = token.toLowerCase();
    if (NAMED[lower]) return NAMED[lower];
    if (token.length === 1) {
      var upper = token.toUpperCase();
      var code = /[a-z]/i.test(token) ? "Key" + upper : /[0-9]/.test(token) ? "Digit" + token : token;
      return { key: token, code, keyCode: token.charCodeAt(0) };
    }
    return null;
  }
  function fireKey(el2, def2, mods2) {
    var view = doc.defaultView || g.window || g;
    var opts = {
      key: def2.key,
      code: def2.code,
      keyCode: def2.keyCode,
      which: def2.keyCode,
      bubbles: true,
      cancelable: true,
      ctrlKey: !!mods2.ctrl,
      altKey: !!mods2.alt,
      shiftKey: !!mods2.shift,
      metaKey: !!mods2.meta
    };
    function send(name) {
      var ev = null;
      try {
        if (view && typeof view.KeyboardEvent === "function") ev = new view.KeyboardEvent(name, opts);
      } catch (e) {
        ev = null;
      }
      if (ev && typeof el2.dispatchEvent === "function") el2.dispatchEvent(ev);
      else if (typeof el2.dispatchEvent === "function") el2.dispatchEvent({ type: name, key: def2.key, bubbles: true, cancelable: true });
    }
    send("keydown");
    if (def2.key === "Backspace" && isEditable(el2) && !mods2.ctrl && !mods2.alt && !mods2.meta) deleteOne(el2, false);
    else if (def2.key === "Delete" && isEditable(el2) && !mods2.ctrl && !mods2.alt && !mods2.meta) deleteOne(el2, true);
    else if (def2.key === "Tab") moveTab(el2, !!mods2.shift);
    else if (def2.key.length === 1 && !mods2.ctrl && !mods2.alt && !mods2.meta && isEditable(el2) && !blockedText(el2)) insertText(el2, def2.key);
    send("keypress");
    send("keyup");
  }
  var selector = spec && spec.selector ? String(spec.selector) : "";
  var mods = {
    ctrl: !!(spec && spec.ctrl),
    alt: !!(spec && spec.alt),
    shift: !!(spec && spec.shift),
    meta: !!(spec && spec.meta)
  };
  var el = doc.activeElement || doc.body;
  if (selector) {
    var target = resolve(selector);
    if (!target) return { ok: false, error: "not_found" };
    if (typeof target.scrollIntoView === "function") {
      try {
        target.scrollIntoView({ block: "center", inline: "nearest" });
      } catch (e4) {
      }
    }
    if (typeof target.focus === "function") {
      try {
        target.focus();
      } catch (e5) {
      }
    }
    if (typeof target.click === "function" && tagOf(target) === "input") {
      try {
        target.click();
      } catch (e6) {
      }
    }
    el = target;
  }
  if (!el) el = doc.body;
  var typed = "";
  var keys = [];
  if (spec && spec.text) {
    var text = String(spec.text).slice(0, 300);
    if (blockedText(el)) return { ok: false, error: "blocked_field", tag: tagOf(el) };
    if (isEditable(el)) insertText(el, text);
    else if (el.isContentEditable) insertText(el, text);
    typed = text;
  }
  if (spec && spec.key) keys.push(spec.key);
  if (spec && Array.isArray(spec.keys)) {
    for (var k = 0; k < spec.keys.length && keys.length < 20; k++) keys.push(spec.keys[k]);
  }
  for (var i = 0; i < keys.length; i++) {
    var def = named(keys[i]);
    if (!def) return { ok: false, error: "unknown_key", key: String(keys[i] || "").slice(0, 40) };
    fireKey(el, def, mods);
    el = doc.activeElement || el;
  }
  var focused = doc.activeElement || el;
  return {
    ok: true,
    url: String(g.location && g.location.href || "").split("?")[0].slice(0, 300),
    title: doc.title || "",
    tag: tagOf(focused),
    focused: String(focused && (focused.id || focused.name || focused.getAttribute && focused.getAttribute("aria-label")) || tagOf(focused)).slice(0, 80),
    typed: typed ? typed.slice(0, 80) : "",
    key: keys.length ? String(keys[keys.length - 1]).slice(0, 40) : "",
    value: isEditable(focused) && !blockedText(focused) ? String(focused.value || "").slice(0, 80) : ""
  };
}
const pointerRoot = typeof globalThis !== "undefined" ? globalThis : this;
pointerRoot.CcPagePointer = { clickAt: pointerClickAt, pressKeys: keyboardPress };

/* ==== wss-session.ts ==== */
(function(root) {
  "use strict";
  const STORAGE_KEY = "ccWssState";
  let _client = null;
  let _reconnect = null;
  let _lastToken = null;
  let _lastUrl = null;
  function deriveWsUrl(backendUrl) {
    if (!backendUrl) return null;
    try {
      const trimmed = String(backendUrl).replace(/\/$/, "");
      const origin = trimmed.replace(/\/api$/i, "");
      const u = new URL(origin);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      u.pathname = "/ws";
      u.search = "";
      u.hash = "";
      const host = u.hostname;
      const port = u.port || (u.protocol === "wss:" ? "443" : "80");
      if ((host === "localhost" || host === "127.0.0.1") && (port === "3000" || port === "80")) {
        u.port = "3300";
      }
      return u.toString();
    } catch (e) {
      return null;
    }
  }
  function publishState(partial) {
    const payload = {
      state: "disconnected",
      sessionId: null,
      url: _lastUrl,
      lastError: null,
      updatedAt: Date.now()
    };
    if (partial && typeof partial === "object") {
      for (const k of Object.keys(partial)) {
        if (partial[k] !== void 0) payload[k] = partial[k];
      }
    }
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: payload });
    } catch (e) {
      console.warn("[CC][wss] publishState failed:", e.message);
    }
    return payload;
  }
  function replyBrowserTask(taskId, result) {
    try {
      if (_client && _client.state === "connected") {
        _client.send("browser_task_result", Object.assign({ taskId }, result));
      }
    } catch (e) {
    }
  }
  function kernelScripts() {
    var manifests = root.CcScriptManifests;
    if (manifests && manifests.SEQUENTIAL_KERNEL_SCRIPTS && manifests.SEQUENTIAL_KERNEL_SCRIPTS.length) {
      return manifests.SEQUENTIAL_KERNEL_SCRIPTS.slice();
    }
    return [
      "shared-bundle.js",
      "autofill/plugins-bundle.js",
      "drivers-bundle.js",
      "autofill/extractor-bundle.js",
      "autofill/mapper-bundle.js",
      "autofill/executor-bundle.js"
    ];
  }
  function readFormPage() {
    if (typeof extractFormFieldsWithFingerprint !== "function") return { ok: false, error: "extractor_not_loaded" };
    var extracted = extractFormFieldsWithFingerprint();
    var formFields = extracted && extracted.formFields || [];
    var visible = formFields.filter(function(f) {
      return f && f.visible === true;
    });
    var snapshotId = extracted && extracted.snapshotId || "";
    var page = {
      ok: true,
      url: location.href,
      title: document.title,
      snapshotId,
      fields: visible.map(function(f) {
        return {
          selector: f.selector || "",
          label: f.label || "",
          visualLabel: f.visualLabel || f.label || "",
          type: f.type || "text",
          options: f.options || null,
          placeholder: f.placeholder || "",
          fieldId: f.fieldId || ""
        };
      })
    };
    try {
      var clickApi = typeof globalThis !== "undefined" ? globalThis.CcClickControl : null;
      var buttons = clickApi && typeof clickApi.list === "function" ? clickApi.list(document) : [];
      for (var b = 0; b < buttons.length; b++) page.fields.push(buttons[b]);
    } catch (e) {
    }
    return page;
  }
  async function fillFormPage(incoming) {
    if (typeof fillFormFieldsSequential !== "function") return { ok: false, error: "executor_not_loaded" };
    var loop = typeof globalThis !== "undefined" ? globalThis.CcAgUiLoop : null;
    if (!loop || typeof loop.run !== "function") return { ok: false, error: "ag_ui_loop_missing" };
    var list = Array.isArray(incoming) ? incoming : [];
    var skip = /captcha|otp|password|cvv|card number|\bpin\b/i;
    var fields = [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!f || !f.selector) continue;
      var label = f.visualLabel || f.label || "";
      if (skip.test(label) || skip.test(f.selector)) continue;
      fields.push(f);
    }
    var out = await loop.run(fields, document);
    var records = out && out.records || [];
    function count(name) {
      return records.filter(function(r) {
        return r && r.result === name;
      }).length;
    }
    return {
      ok: !(out && out.stopped),
      url: location.href,
      stopped: !!(out && out.stopped),
      filled: count("filled") + count("chosen"),
      skipped: count("skipped"),
      failed: count("failed") + count("not_landed") + count("no_option") + count("no_effect"),
      records: records.map(function(r) {
        return {
          selector: r.selector || "",
          label: r.label || "",
          result: r.result || "",
          failReason: r.failReason || "",
          plannedValue: r.plannedValue != null ? r.plannedValue : "",
          actualValue: r.actualValue != null ? r.actualValue : ""
        };
      })
    };
  }
  async function pickTaskTab(tabId) {
    if (tabId) {
      try {
        var exact = await chrome.tabs.get(Number(tabId));
        if (exact && exact.id) return exact;
      } catch (e) {
      }
    }
    var irctc = await chrome.tabs.query({ url: "*://*.irctc.co.in/*" });
    if (irctc && irctc.length) return irctc[irctc.length - 1];
    var active = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return active && active[0] || null;
  }
  async function runPageTask(taskId, tabId, func, args) {
    var tab = await pickTaskTab(tabId);
    if (!tab || !tab.id) {
      replyBrowserTask(taskId, { ok: false, error: "no_tab" });
      return;
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: kernelScripts() });
      var results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func,
        args: args || []
      });
      var page = results && results[0] && results[0].result;
      replyBrowserTask(taskId, Object.assign({ ok: false, tabId: tab.id, url: tab.url || null }, page || { error: "no_result" }));
    } catch (e) {
      replyBrowserTask(taskId, { ok: false, tabId: tab.id, error: e && e.message || "page_task_failed" });
    }
  }
  async function clickFromJson(spec) {
    var api = typeof globalThis !== "undefined" ? globalThis.CcClickControl : null;
    if (!api || typeof api.list !== "function" || typeof api.press !== "function") {
      return { ok: false, error: "click_control_not_loaded" };
    }
    var entry = spec && spec.control;
    if (!entry || !entry.selector && !(entry && (entry.label || entry.visualLabel))) {
      var want = api.norm ? api.norm(spec && spec.text) : String(spec && spec.text || "").toLowerCase();
      var buttons = api.list(document) || [];
      entry = null;
      for (var i = 0; i < buttons.length; i++) {
        var live = api.norm ? api.norm(buttons[i].visualLabel || buttons[i].label) : "";
        if (want && live === want) {
          entry = buttons[i];
          break;
        }
      }
    }
    if (!entry) return { ok: false, error: "not_found", url: location.href };
    var beforeUrl = location.href;
    var beforeTitle = document.title;
    var pressed = api.press(entry, document);
    await new Promise(function(r) {
      setTimeout(r, 900);
    });
    var changed = location.href !== beforeUrl || document.title !== beforeTitle;
    var didPress = !!(pressed && pressed.pressed);
    return {
      ok: didPress,
      url: location.href,
      clicked: pressed && pressed.clicked || "",
      selector: pressed && pressed.selector || entry.selector || "",
      label: entry.visualLabel || entry.label || "",
      reason: didPress ? "" : pressed && pressed.reason || "not_found",
      moved: changed
    };
  }
  function loadFillOrchestrator() {
    if (root.CcFillOrchestrator && typeof root.CcFillOrchestrator.runProductFill === "function") return;
    importScripts("application/orchestrator-bundle.js", "application/fill-orchestrator.js");
  }
  async function runExtensionFill(profileId, tabId) {
    try {
      loadFillOrchestrator();
    } catch (e) {
      return { ok: false, error: "fill_orchestrator_missing" };
    }
    var api = root.CcFillOrchestrator;
    if (!api || typeof api.runProductFill !== "function") return { ok: false, error: "fill_orchestrator_missing" };
    var stored = await chrome.storage.local.get(["accessToken", "backendUrl"]);
    var id = profileId ? String(profileId) : "";
    if (!id) return { ok: false, error: "profile_required" };
    if (!stored.accessToken || !stored.backendUrl) return { ok: false, error: "extension_not_signed_in" };
    var tab = await pickTaskTab(tabId);
    if (!tab || !tab.id) return { ok: false, error: "no_tab" };
    if (!tab.url || String(tab.url).indexOf("chrome") === 0 || String(tab.url).indexOf("edge") === 0) {
      return { ok: false, error: "open_a_form_page" };
    }
    var base = String(stored.backendUrl).replace(/\/$/, "");
    var res = await fetch(base + "/profiles/" + encodeURIComponent(id), {
      headers: { Authorization: "Bearer " + stored.accessToken }
    });
    if (!res.ok) return { ok: false, error: "profile_fetch_" + res.status };
    var profile = await res.json();
    var out = await api.runProductFill({
      tabId: tab.id,
      profile,
      backendUrl: stored.backendUrl,
      accessToken: stored.accessToken,
      runtimeVersion: "mcp",
      executionPreference: "AUTO"
    });
    var records = out && out.records || [];
    return {
      ok: !!(out && out.ok),
      tabId: tab.id,
      url: tab.url || "",
      profileId: id,
      filled: out && out.filled || 0,
      failed: out && out.failed || 0,
      skipped: out && out.skipped || 0,
      error: out && out.error || "",
      operatorMessage: out && out.operatorMessage || "",
      records: records.slice(0, 40).map(function(r) {
        return {
          selector: r && r.selector || "",
          label: r && r.label || "",
          result: r && r.result || "",
          plannedValue: r && r.plannedValue != null ? String(r.plannedValue).slice(0, 120) : "",
          actualValue: r && r.actualValue != null ? String(r.actualValue).slice(0, 120) : ""
        };
      })
    };
  }
  function waitMs(ms) {
    return new Promise(function(resolve) {
      setTimeout(resolve, ms);
    });
  }
  function bytesToBase64(bytes) {
    var parts = [];
    var size = 32768;
    for (var i = 0; i < bytes.length; i += size) {
      parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + size))));
    }
    return btoa(parts.join(""));
  }
  async function bitmapFromDataUrl(dataUrl) {
    var response = await fetch(dataUrl);
    return createImageBitmap(await response.blob());
  }
  async function jpegBytes(canvas, quality) {
    var blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    return new Uint8Array(await blob.arrayBuffer());
  }
  async function encodeBitmap(bmp, sx, sy, sw, sh, maxWidth, quality) {
    var scale = Math.min(1, maxWidth / Math.max(1, sw));
    var dw = Math.max(1, Math.round(sw * scale));
    var dh = Math.max(1, Math.round(sh * scale));
    var canvas = new OffscreenCanvas(dw, dh);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, dw, dh);
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, dw, dh);
    var bytes = await jpegBytes(canvas, quality);
    return { base64: bytesToBase64(bytes), width: dw, height: dh };
  }
  async function shrinkShot(make) {
    var first = await make(1280, 0.72);
    if (first.base64.length <= 12e5) return first;
    var second = await make(720, 0.52);
    if (second.base64.length <= 12e5) return second;
    return null;
  }
  function measureForSnapshot(spec) {
    var beforeX = window.scrollX || 0;
    var beforeY = window.scrollY || 0;
    var box = null;
    var selector = spec && spec.selector ? String(spec.selector) : "";
    if (selector) {
      var el = null;
      try {
        var resolver = typeof globalThis !== "undefined" ? globalThis.CcResolveCcSelector : null;
        if (resolver && typeof resolver.resolveCcSelector === "function") el = resolver.resolveCcSelector(selector, document);
      } catch (e) {
        el = null;
      }
      if (!el) {
        try {
          var clickApi = typeof globalThis !== "undefined" ? globalThis.CcClickControl : null;
          if (clickApi && typeof clickApi.elementFor === "function") el = clickApi.elementFor(selector, document);
        } catch (e2) {
          el = null;
        }
      }
      if (!el) {
        try {
          el = document.querySelector(selector);
        } catch (e3) {
          el = null;
        }
      }
      if (!el) return { ok: false, error: "not_found" };
      try {
        el.scrollIntoView({ block: "center", inline: "nearest" });
      } catch (e4) {
      }
      var rect = el.getBoundingClientRect();
      if (!rect || rect.width < 2 || rect.height < 2) return { ok: false, error: "empty_area" };
      box = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    } else if (spec && spec.rect) {
      box = {
        x: Number(spec.rect.x) || 0,
        y: Number(spec.rect.y) || 0,
        width: Number(spec.rect.width) || 0,
        height: Number(spec.rect.height) || 0
      };
      if (box.width < 2 || box.height < 2) return { ok: false, error: "empty_area" };
    }
    var rootEl = document.documentElement;
    var body = document.body;
    return {
      ok: true,
      url: location.href,
      title: document.title,
      clientWidth: window.innerWidth || 1,
      clientHeight: window.innerHeight || 1,
      scrollHeight: Math.max(rootEl ? rootEl.scrollHeight : 0, body ? body.scrollHeight : 0, window.innerHeight || 0),
      scrollX: beforeX,
      scrollY: beforeY,
      scrolled: (window.scrollX || 0) !== beforeX || (window.scrollY || 0) !== beforeY,
      box
    };
  }
  async function cropVisible(dataUrl, box, clientWidth) {
    var bmp = await bitmapFromDataUrl(dataUrl);
    try {
      var sx = 0;
      var sy = 0;
      var sw = bmp.width;
      var sh = bmp.height;
      var clipped = false;
      if (box) {
        var px = bmp.width / Math.max(1, clientWidth || bmp.width);
        sx = Math.max(0, Math.floor(box.x * px));
        sy = Math.max(0, Math.floor(box.y * px));
        sw = Math.max(1, Math.floor(box.width * px));
        sh = Math.max(1, Math.floor(box.height * px));
        if (box.x < 0 || box.y < 0 || box.x + box.width > (clientWidth || bmp.width)) clipped = true;
        if (sx + sw > bmp.width) {
          sw = bmp.width - sx;
          clipped = true;
        }
        if (sy + sh > bmp.height) {
          sh = bmp.height - sy;
          clipped = true;
        }
        if (sw < 2 || sh < 2) throw new Error("empty_area");
      }
      var encoded = await shrinkShot(function(maxWidth, quality) {
        return encodeBitmap(bmp, sx, sy, sw, sh, maxWidth, quality);
      });
      if (!encoded) throw new Error("snapshot_too_large");
      encoded.clipped = clipped;
      return encoded;
    } finally {
      if (bmp.close) bmp.close();
    }
  }
  async function captureWholePage(tabId, windowId, metrics) {
    var plan = root.CcPageShot.pageShotOffsets(metrics.scrollHeight, metrics.clientHeight, 6);
    var shots = [];
    for (var i = 0; i < plan.offsets.length; i++) {
      var top = plan.offsets[i];
      await chrome.scripting.executeScript({
        target: { tabId },
        func: function(y) {
          window.scrollTo(0, y);
        },
        args: [top]
      });
      await waitMs(180);
      shots.push({
        y: top,
        dataUrl: await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 60 })
      });
    }
    var bitmaps = [];
    try {
      for (var s = 0; s < shots.length; s++) {
        bitmaps.push({ y: shots[s].y, bmp: await bitmapFromDataUrl(shots[s].dataUrl) });
      }
      var srcW = bitmaps[0].bmp.width;
      var pxPerCss = srcW / Math.max(1, metrics.clientWidth);
      var covered = Math.min(metrics.scrollHeight, bitmaps[bitmaps.length - 1].y + metrics.clientHeight);
      var fitScale = Math.min(1, 1e3 / srcW);
      var naturalH = Math.round(covered * pxPerCss * fitScale);
      var outW = Math.max(1, Math.round(srcW * fitScale));
      var outH = naturalH;
      var drawScale = fitScale;
      if (outH > 4200) {
        var fit = 4200 / outH;
        outW = Math.max(1, Math.round(outW * fit));
        outH = 4200;
        drawScale = outW / srcW;
      }
      var canvas = new OffscreenCanvas(outW, outH);
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);
      for (var d = 0; d < bitmaps.length; d++) {
        ctx.drawImage(bitmaps[d].bmp, 0, Math.round(bitmaps[d].y * pxPerCss * drawScale));
      }
      var bytes = await jpegBytes(canvas, naturalH > 4200 ? 0.45 : 0.62);
      if (bytes.length > 14e5) throw new Error("snapshot_too_large");
      return {
        base64: bytesToBase64(bytes),
        width: outW,
        height: outH,
        clipped: plan.clipped || naturalH > 4200
      };
    } finally {
      for (var c = 0; c < bitmaps.length; c++) {
        if (bitmaps[c].bmp && bitmaps[c].bmp.close) bitmaps[c].bmp.close();
      }
    }
  }
  async function pickWebTab(tabId) {
    if (tabId) {
      try {
        var exact = await chrome.tabs.get(Number(tabId));
        if (exact && exact.id && String(exact.url || "").indexOf("http") === 0) return exact;
      } catch (e) {
      }
    }
    var all = await chrome.tabs.query({});
    var pages = [];
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].url || "").indexOf("http") === 0) pages.push(all[i]);
    }
    if (!pages.length) return pickTaskTab(tabId);
    pages.sort(function(a, b) {
      return (b.lastAccessed || 0) - (a.lastAccessed || 0);
    });
    return pages[0];
  }
  async function runSnapshot(spec) {
    var tab = await pickWebTab(spec && spec.tabId);
    if (!tab || !tab.id) return { ok: false, error: "no_tab" };
    var url = String(tab.url || "");
    if (url.indexOf("http") !== 0) return { ok: false, error: "open_a_form_page", tabId: tab.id, url };
    var scope = spec && spec.scope === "page" ? "page" : "viewport";
    if (spec && spec.selector || spec && spec.rect) scope = "area";
    var metrics = null;
    try {
      if (spec && spec.selector) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: kernelScripts() });
      }
      var measured = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: measureForSnapshot,
        args: [{ selector: spec && spec.selector || "", rect: spec && spec.rect || null }]
      });
      metrics = measured && measured[0] && measured[0].result;
    } catch (e) {
      return { ok: false, error: "page_not_readable", tabId: tab.id };
    }
    if (!metrics || metrics.ok === false) {
      return { ok: false, error: metrics && metrics.error || "page_not_readable", tabId: tab.id, url };
    }
    try {
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId) {
        try {
          await chrome.windows.update(tab.windowId, { focused: true });
        } catch (eFocus) {
        }
      }
    } catch (e2) {
      return { ok: false, error: "tab_not_active", tabId: tab.id };
    }
    var shown = false;
    for (var attempt = 0; attempt < 8; attempt++) {
      await waitMs(120);
      try {
        var now = await chrome.tabs.get(tab.id);
        if (now && now.active) {
          shown = true;
          break;
        }
      } catch (eWait) {
      }
    }
    if (!shown) return { ok: false, error: "tab_not_active", tabId: tab.id, url };
    if (metrics.scrolled) await waitMs(200);
    var shot = null;
    try {
      async function captureShown() {
        return chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: scope === "page" ? 60 : 72 });
      }
      if (scope === "page") {
        shot = await captureWholePage(tab.id, tab.windowId, metrics);
      } else {
        var dataUrl = null;
        try {
          dataUrl = await captureShown();
        } catch (eCap) {
          await waitMs(300);
          dataUrl = await captureShown();
        }
        shot = await cropVisible(dataUrl, scope === "area" ? metrics.box : null, metrics.clientWidth);
      }
    } catch (e3) {
      var message = e3 && e3.message || "capture_failed";
      return { ok: false, error: String(message).slice(0, 180), tabId: tab.id, url: metrics.url || url };
    } finally {
      if (scope === "page" || metrics.scrolled) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: function(x, y) {
              window.scrollTo(x, y);
            },
            args: [metrics.scrollX || 0, metrics.scrollY || 0]
          });
        } catch (e4) {
        }
      }
    }
    return {
      ok: true,
      tabId: tab.id,
      url: metrics.url || url,
      title: metrics.title || "",
      scope,
      width: shot.width,
      height: shot.height,
      mimeType: "image/jpeg",
      clipped: !!shot.clipped,
      image: shot.base64
    };
  }
  function pageUrl(raw) {
    var value = String(raw || "");
    if (!value) return "";
    try {
      var parsed = new URL(value);
      return (parsed.origin + parsed.pathname).slice(0, 300);
    } catch (e) {
      return value.split("?")[0].slice(0, 300);
    }
  }
  function slimTab(tab) {
    return {
      tabId: tab.id,
      windowId: tab.windowId,
      title: String(tab.title || "").slice(0, 120),
      url: pageUrl(tab.url || tab.pendingUrl || ""),
      active: !!tab.active
    };
  }
  async function runListTabs() {
    var all = await chrome.tabs.query({});
    var tabs = [];
    for (var i = 0; i < all.length && tabs.length < 40; i++) tabs.push(slimTab(all[i]));
    tabs.sort(function(a, b) {
      return (b.active ? 1 : 0) - (a.active ? 1 : 0);
    });
    return { ok: true, tabs };
  }
  async function runFocusTab(tabId) {
    if (!tabId) return { ok: false, error: "tabId required" };
    var tab = null;
    try {
      tab = await chrome.tabs.get(Number(tabId));
    } catch (e) {
      return { ok: false, error: "no_tab" };
    }
    if (!tab || !tab.id) return { ok: false, error: "no_tab" };
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId) {
      try {
        await chrome.windows.update(tab.windowId, { focused: true });
      } catch (e2) {
      }
    }
    var shown = slimTab(tab);
    shown.active = true;
    return { ok: true, tabId: tab.id, title: shown.title, url: shown.url, active: true };
  }
  function scrollPage(spec) {
    var beforeX = window.scrollX || 0;
    var beforeY = window.scrollY || 0;
    var rootEl = document.scrollingElement || document.documentElement;
    if (spec && spec.selector) {
      var target = null;
      try {
        var resolver = typeof globalThis !== "undefined" ? globalThis.CcResolveCcSelector : null;
        if (resolver && typeof resolver.resolveCcSelector === "function") target = resolver.resolveCcSelector(spec.selector, document);
      } catch (e) {
        target = null;
      }
      if (!target) {
        try {
          var clickApi = typeof globalThis !== "undefined" ? globalThis.CcClickControl : null;
          if (clickApi && typeof clickApi.elementFor === "function") target = clickApi.elementFor(spec.selector, document);
        } catch (e2) {
          target = null;
        }
      }
      if (!target) {
        try {
          target = document.querySelector(spec.selector);
        } catch (e3) {
          target = null;
        }
      }
      if (!target) return { ok: false, error: "not_found" };
      try {
        target.scrollIntoView({ block: "center", inline: "nearest" });
      } catch (e4) {
      }
    } else if (spec && spec.to === "top") {
      window.scrollTo(0, 0);
    } else if (spec && spec.to === "bottom") {
      window.scrollTo(0, rootEl && rootEl.scrollHeight || 0);
    } else {
      window.scrollBy(Number(spec && spec.dx) || 0, Number(spec && spec.dy) || 0);
    }
    return {
      ok: true,
      url: String(location.href || "").split("?")[0].slice(0, 300),
      title: document.title,
      scrollX: window.scrollX || 0,
      scrollY: window.scrollY || 0,
      scrollHeight: rootEl && rootEl.scrollHeight || 0,
      clientHeight: window.innerHeight || 0,
      moved: (window.scrollX || 0) !== beforeX || (window.scrollY || 0) !== beforeY
    };
  }
  async function runScroll(spec) {
    var tab = await pickWebTab(spec && spec.tabId);
    if (!tab || !tab.id) return { ok: false, error: "no_tab" };
    if (String(tab.url || "").indexOf("http") !== 0) return { ok: false, error: "open_a_form_page", tabId: tab.id };
    if (spec && spec.selector) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: kernelScripts() });
      } catch (e) {
      }
    }
    try {
      var results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrollPage,
        args: [{
          dy: spec && spec.dy || 0,
          dx: spec && spec.dx || 0,
          to: spec && spec.to || "",
          selector: spec && spec.selector || ""
        }]
      });
      var page = results && results[0] && results[0].result;
      return Object.assign({ tabId: tab.id }, page || { ok: false, error: "no_result" });
    } catch (e2) {
      return { ok: false, error: "page_not_readable", tabId: tab.id };
    }
  }
  function historyStep(action) {
    if (action === "back") history.back();
    else if (action === "forward") history.forward();
    else location.reload();
    return location.href;
  }
  async function runHistory(spec) {
    var action = spec && spec.action;
    if (action !== "back" && action !== "forward" && action !== "reload") return { ok: false, error: "action required" };
    var tab = await pickWebTab(spec && spec.tabId);
    if (!tab || !tab.id) return { ok: false, error: "no_tab" };
    if (String(tab.url || "").indexOf("http") !== 0) return { ok: false, error: "open_a_form_page", tabId: tab.id };
    var before = pageUrl(tab.url);
    try {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: historyStep,
        args: [action]
      });
    } catch (e) {
      return { ok: false, error: "page_not_readable", tabId: tab.id, action };
    }
    await waitMs(700);
    var after = tab;
    try {
      after = await chrome.tabs.get(tab.id);
    } catch (e2) {
    }
    return {
      ok: true,
      tabId: tab.id,
      action,
      url: pageUrl(after && after.url || ""),
      title: after && after.title || "",
      moved: pageUrl(after && after.url || "") !== before
    };
  }
  async function runPointerTask(spec, fn) {
    var tab = await pickWebTab(spec && spec.tabId);
    if (!tab || !tab.id) return { ok: false, error: "no_tab" };
    if (String(tab.url || "").indexOf("http") !== 0) return { ok: false, error: "open_a_form_page", tabId: tab.id };
    if (typeof fn !== "function") return { ok: false, error: "pointer_not_loaded" };
    try {
      await chrome.tabs.update(tab.id, { active: true });
    } catch (e) {
    }
    if (spec && spec.selector) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: kernelScripts() });
      } catch (e2) {
      }
    }
    try {
      var results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fn,
        args: [spec || {}]
      });
      var page = results && results[0] && results[0].result;
      await waitMs(400);
      var after = tab;
      try {
        after = await chrome.tabs.get(tab.id);
      } catch (e3) {
      }
      return Object.assign({ tabId: tab.id }, page || { ok: false, error: "no_result" }, { url: pageUrl(after && after.url || page && page.url || "") });
    } catch (e4) {
      return { ok: false, error: "page_not_readable", tabId: tab.id };
    }
  }
  function runMouseClick(spec) {
    var api = root.CcPagePointer;
    return runPointerTask({
      tabId: spec && spec.tabId || null,
      x: spec && spec.x,
      y: spec && spec.y,
      selector: spec && spec.selector || "",
      button: spec && spec.button || "left",
      count: spec && spec.count || 1
    }, api && api.clickAt);
  }
  function runKeyboard(spec) {
    var api = root.CcPagePointer;
    return runPointerTask({
      tabId: spec && spec.tabId || null,
      selector: spec && spec.selector || "",
      text: spec && spec.text || "",
      key: spec && spec.key || "",
      keys: Array.isArray(spec && spec.keys) ? spec.keys : [],
      ctrl: !!(spec && spec.ctrl),
      alt: !!(spec && spec.alt),
      shift: !!(spec && spec.shift),
      meta: !!(spec && spec.meta)
    }, api && api.pressKeys);
  }
  function runBrowserTask(msg) {
    if (!msg || !msg.task) {
      replyBrowserTask(msg && msg.taskId, { ok: false, error: "unknown task" });
      return;
    }
    if (msg.task === "click") {
      runPageTask(msg.taskId, msg.tabId, clickFromJson, [{ text: msg.text || "", control: msg.control || null }]);
      return;
    }
    if (msg.task === "read_form") {
      runPageTask(msg.taskId, msg.tabId, readFormPage, []);
      return;
    }
    if (msg.task === "fill_form") {
      runPageTask(msg.taskId, msg.tabId, fillFormPage, [Array.isArray(msg.fields) ? msg.fields : []]);
      return;
    }
    if (msg.task === "fill") {
      runExtensionFill(msg.profileId, msg.tabId).then(function(result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function(err) {
        replyBrowserTask(msg.taskId, { ok: false, error: err && err.message || "fill_failed" });
      });
      return;
    }
    if (msg.task === "snapshot") {
      runSnapshot(msg).then(function(result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function(err) {
        replyBrowserTask(msg.taskId, { ok: false, error: err && err.message || "snapshot_failed" });
      });
      return;
    }
    if (msg.task === "list_tabs") {
      runListTabs().then(function(result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function(err) {
        replyBrowserTask(msg.taskId, { ok: false, error: err && err.message || "list_tabs_failed" });
      });
      return;
    }
    if (msg.task === "focus_tab") {
      runFocusTab(msg.tabId).then(function(result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function(err) {
        replyBrowserTask(msg.taskId, { ok: false, error: err && err.message || "focus_failed" });
      });
      return;
    }
    if (msg.task === "scroll") {
      runScroll(msg).then(function(result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function(err) {
        replyBrowserTask(msg.taskId, { ok: false, error: err && err.message || "scroll_failed" });
      });
      return;
    }
    if (msg.task === "history") {
      runHistory(msg).then(function(result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function(err) {
        replyBrowserTask(msg.taskId, { ok: false, error: err && err.message || "history_failed" });
      });
      return;
    }
    if (msg.task === "mouse_click") {
      runMouseClick(msg).then(function(result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function(err) {
        replyBrowserTask(msg.taskId, { ok: false, error: err && err.message || "mouse_click_failed" });
      });
      return;
    }
    if (msg.task === "keyboard") {
      runKeyboard(msg).then(function(result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function(err) {
        replyBrowserTask(msg.taskId, { ok: false, error: err && err.message || "keyboard_failed" });
      });
      return;
    }
    if (msg.task !== "open_url") {
      replyBrowserTask(msg.taskId, { ok: false, error: "unknown task" });
      return;
    }
    var url = msg.url;
    try {
      var parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        replyBrowserTask(msg.taskId, { ok: false, error: "url must be http or https" });
        return;
      }
    } catch (e) {
      replyBrowserTask(msg.taskId, { ok: false, error: "bad url" });
      return;
    }
    chrome.tabs.create({ url, active: true }, function(tab) {
      if (chrome.runtime.lastError || !tab) {
        replyBrowserTask(msg.taskId, { ok: false, error: chrome.runtime.lastError && chrome.runtime.lastError.message || "failed to open tab" });
        return;
      }
      replyBrowserTask(msg.taskId, { ok: true, tabId: tab.id, url: tab.pendingUrl || tab.url || url });
    });
  }
  function ensureClient(wsUrl, token) {
    const WsClient = root.CcWsClient;
    const ReconnectManager = root.CcReconnectManager;
    if (!WsClient) {
      publishState({ state: "error", lastError: "CcWsClient not loaded" });
      return null;
    }
    if (_client && _lastToken === token && _lastUrl === wsUrl) {
      if (_client.state === "disconnected" || _client.state === "suspended") {
        _client.connect();
      }
      return _client;
    }
    if (_client) {
      try {
        _client.disconnect();
      } catch (e) {
      }
      _client = null;
    }
    _lastToken = token;
    _lastUrl = wsUrl;
    _reconnect = new ReconnectManager({
      baseDelayMs: 400,
      maxDelayMs: 8e3,
      multiplier: 1.6,
      jitter: 0.2,
      onAttempt: (attempt, delayMs) => {
        publishState({
          state: "reconnecting",
          sessionId: null,
          lastError: `reconnect #${attempt} in ${delayMs}ms`
        });
      }
    });
    _client = new WsClient({
      url: wsUrl,
      token,
      reconnectManager: _reconnect,
      onStateChange: (state) => {
        publishState({
          state,
          sessionId: _client.sessionId || null,
          lastError: state === "connected" ? null : void 0
        });
        if (state === "connected") {
          try {
            _client.startHeartbeat(15e3);
          } catch (e) {
          }
          try {
            if (typeof root.__ccOnWssConnected === "function") root.__ccOnWssConnected();
          } catch (e) {
          }
        }
      },
      onError: (err) => {
        publishState({
          state: _client ? _client.state : "suspended",
          sessionId: null,
          lastError: err && err.message || String(err)
        });
      },
      onMessage: (msg) => {
        if (msg && msg.type === "browser_task") {
          runBrowserTask(msg);
          return;
        }
        if (msg && msg.type === "error") {
          publishState({
            state: _client ? _client.state : "suspended",
            lastError: msg.message || msg.code || "server error"
          });
        }
      }
    });
    publishState({ state: "connecting", sessionId: null, lastError: null });
    _client.connect();
    return _client;
  }
  async function ensureWssFromStorage() {
    const data = await chrome.storage.local.get(["accessToken", "backendUrl"]);
    if (!data.accessToken || !data.backendUrl) {
      disconnectWss("no credentials");
      return { ok: false, error: "no_credentials" };
    }
    const wsUrl = deriveWsUrl(data.backendUrl);
    if (!wsUrl) {
      publishState({ state: "error", lastError: "bad backendUrl" });
      return { ok: false, error: "bad_backend_url" };
    }
    const client = ensureClient(wsUrl, data.accessToken);
    return { ok: !!client, url: wsUrl, state: client ? client.state : "error" };
  }
  function disconnectWss(reason) {
    if (_client) {
      try {
        _client.disconnect();
      } catch (e) {
      }
      _client = null;
    }
    _lastToken = null;
    publishState({ state: "disconnected", sessionId: null, lastError: reason || null });
  }
  function getClient() {
    return _client;
  }
  async function getState() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] || { state: "disconnected" };
  }
  function sendFillDebug(event, payload) {
    if (!_client || _client.state !== "connected") return null;
    try {
      const raw = payload || {};
      const {
        event: _ev,
        type: _ty,
        id: _id,
        v: _v,
        seq: _seq,
        ...rest
      } = raw;
      return _client.sendFillDebugEvent(event, rest);
    } catch (e) {
      console.warn("[CC][wss] fill_debug send failed:", e.message);
      publishState({
        state: "suspended",
        sessionId: null,
        lastError: e.message || "send failed"
      });
      try {
        if (_client && typeof _client.connect === "function") _client.connect();
      } catch (e2) {
      }
      return null;
    }
  }
  async function requestFillPlan(payload, timeoutMs) {
    await ensureWssFromStorage();
    if (!_client || _client.state !== "connected") {
      throw new Error("wss_not_connected");
    }
    return _client.request("fill_request", payload || {}, timeoutMs || 2e4);
  }
  async function postFillSession(payload, timeoutMs) {
    await ensureWssFromStorage();
    if (!_client || _client.state !== "connected") {
      throw new Error("wss_not_connected");
    }
    return _client.request("fill_session", payload || {}, timeoutMs || 15e3);
  }
  async function requestProfilesList(timeoutMs) {
    await ensureWssFromStorage();
    const deadline = Date.now() + 8e3;
    while (Date.now() < deadline) {
      if (_client && _client.state === "connected") break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!_client || _client.state !== "connected") {
      throw new Error("wss_not_connected");
    }
    return _client.request("profiles_list", {}, timeoutMs || 15e3);
  }
  root.CcWssSession = {
    STORAGE_KEY,
    deriveWsUrl,
    ensureWssFromStorage,
    disconnectWss,
    getClient,
    getState,
    sendFillDebug,
    requestFillPlan,
    postFillSession,
    requestProfilesList,
    isConnected: () => !(!_client || _client.state !== "connected"),
    publishState
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
