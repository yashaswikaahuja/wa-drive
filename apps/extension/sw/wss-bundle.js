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
  function isShown(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return true;
    var box2 = el.getBoundingClientRect();
    if (box2.width < 1 || box2.height < 1) return false;
    try {
      var st = el.ownerDocument && el.ownerDocument.defaultView || g.window || g;
      if (st && st.getComputedStyle) {
        var cs = st.getComputedStyle(el);
        if (cs && (cs.display === "none" || cs.visibility === "hidden")) return false;
      }
    } catch (e) {
    }
    return true;
  }
  function queryDeep(rootDoc, sel) {
    if (!rootDoc || !sel) return null;
    var nodes = [];
    try {
      nodes = rootDoc.querySelectorAll(sel);
    } catch (e0) {
      nodes = [];
    }
    var first = null;
    for (var n = 0; n < nodes.length; n++) {
      if (!first) first = nodes[n];
      if (isShown(nodes[n])) return nodes[n];
    }
    if (first) return first;
    var frames = [];
    try {
      frames = rootDoc.querySelectorAll("iframe,frame");
    } catch (e1) {
      return null;
    }
    for (var i = 0; i < frames.length; i++) {
      var child = null;
      try {
        child = frames[i].contentDocument;
      } catch (e2) {
        child = null;
      }
      if (!child) continue;
      var nested = queryDeep(child, sel);
      if (nested) return nested;
    }
    return null;
  }
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
    return queryDeep(doc, sel);
  }
  function labelOf(el) {
    if (!el) return "";
    var aria = el.getAttribute && el.getAttribute("aria-label");
    var raw = aria || el.innerText || el.textContent || el.value || el.placeholder || "";
    return String(raw).replace(/\s+/g, " ").trim().slice(0, 80);
  }
  function makeEvent(name, point2, button2, buttons2, detail) {
    var view2 = doc.defaultView || g.window || g;
    var scrollX = view2 && view2.scrollX || 0;
    var scrollY = view2 && view2.scrollY || 0;
    var init = {
      bubbles: true,
      cancelable: true,
      view: view2,
      clientX: point2.x,
      clientY: point2.y,
      pageX: point2.x + scrollX,
      pageY: point2.y + scrollY,
      screenX: point2.x,
      screenY: point2.y,
      button: button2,
      buttons: buttons2,
      which: button2 === 0 ? 1 : button2 === 2 ? 3 : 2,
      detail
    };
    try {
      if (name.indexOf("pointer") === 0 && view2 && typeof view2.PointerEvent === "function") {
        return new view2.PointerEvent(name, Object.assign({ pointerId: 1, pointerType: "mouse", isPrimary: true }, init));
      }
      if (view2 && typeof view2.MouseEvent === "function") return new view2.MouseEvent(name, init);
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
  function forceHover(el) {
    var rootDoc = el && el.ownerDocument || doc;
    try {
      var marked = rootDoc.documentElement;
      if (marked && marked.getAttribute && marked.getAttribute("data-cc-hover-css") !== "1") {
        if (marked.setAttribute) marked.setAttribute("data-cc-hover-css", "1");
        var sheets = rootDoc.styleSheets || [];
        for (var s = 0; s < sheets.length; s++) {
          var rules = null;
          try {
            rules = sheets[s].cssRules;
          } catch (e0) {
            continue;
          }
          if (!rules || !sheets[s].insertRule) continue;
          var add = [];
          for (var r = 0; r < rules.length; r++) {
            var rule = rules[r];
            if (!rule || !rule.selectorText || String(rule.selectorText).indexOf(":hover") === -1) continue;
            add.push(String(rule.selectorText).replace(/:hover/g, ".cc-force-hover") + "{" + (rule.style && rule.style.cssText || "") + "}");
          }
          for (var a = 0; a < add.length; a++) {
            try {
              sheets[s].insertRule(add[a], sheets[s].cssRules.length);
            } catch (e1) {
            }
          }
        }
      }
    } catch (e2) {
    }
    try {
      var prev = rootDoc.querySelectorAll && rootDoc.querySelectorAll(".cc-force-hover");
      if (prev) {
        for (var c = 0; c < prev.length; c++) {
          if (prev[c] && prev[c].classList) prev[c].classList.remove("cc-force-hover");
        }
      }
    } catch (e3) {
    }
    var node = el;
    while (node && node.classList) {
      try {
        node.classList.add("cc-force-hover");
      } catch (e4) {
        break;
      }
      node = node.parentElement || node.parentNode;
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
  var action = spec && spec.action === "hover" ? "hover" : spec && spec.action === "drag" ? "drag" : "click";
  if (action === "hover") {
    fire(target, point, 0, 0, ["pointerover", "pointerenter", "mouseover", "mouseenter", "pointermove", "mousemove"], 0);
    forceHover(target);
    return {
      ok: true,
      action: "hover",
      url: String(g.location && g.location.href || "").split("?")[0].slice(0, 300),
      title: doc.title || "",
      x: Math.round(point.x),
      y: Math.round(point.y),
      tag: String(target.tagName || "").toLowerCase(),
      hovered: labelOf(target)
    };
  }
  if (action === "drag") {
    let html5Drag2 = function(el) {
      if (!el) return false;
      if (el.draggable === true) return true;
      return !!(el.getAttribute && el.getAttribute("draggable") === "true");
    }, html5Drop2 = function(el) {
      if (!el) return false;
      if (typeof el.hasAttribute === "function" && el.hasAttribute("ondrop")) return true;
      return /\bui-droppable\b|\bdroppable\b/.test(String(el.className || ""));
    }, closestHtml52 = function(el) {
      var n = el;
      var hops = 0;
      while (n && n.nodeType === 1 && hops < 8) {
        if (html5Drag2(n) || html5Drop2(n)) return n;
        n = n.parentElement;
        hops += 1;
      }
      return el;
    }, dragEv2 = function(name, el, pt) {
      var ev = null;
      try {
        if (view && typeof view.DragEvent === "function") {
          ev = new view.DragEvent(name, {
            bubbles: true,
            cancelable: true,
            view,
            clientX: pt.x,
            clientY: pt.y,
            screenX: pt.x,
            screenY: pt.y,
            dataTransfer: dt
          });
        }
      } catch (e11) {
        ev = null;
      }
      if (!ev) {
        try {
          ev = view && typeof view.Event === "function" ? new view.Event(name, { bubbles: true, cancelable: true }) : { type: name, bubbles: true, cancelable: true };
        } catch (e12) {
          ev = { type: name, bubbles: true, cancelable: true };
        }
      }
      try {
        Object.defineProperty(ev, "dataTransfer", { get: function() {
          return dt;
        }, configurable: true });
      } catch (e13) {
        try {
          ev.dataTransfer = dt;
        } catch (e14) {
        }
      }
      try {
        ev.clientX = pt.x;
        ev.clientY = pt.y;
      } catch (e15) {
      }
      if (typeof ev.preventDefault !== "function") ev.preventDefault = function() {
      };
      if (typeof ev.stopPropagation !== "function") ev.stopPropagation = function() {
      };
      if (el && typeof el.dispatchEvent === "function") el.dispatchEvent(ev);
    };
    var html5Drag = html5Drag2, html5Drop = html5Drop2, closestHtml5 = closestHtml52, dragEv = dragEv2;
    var end = null;
    var toSel = spec && spec.toSelector ? String(spec.toSelector) : "";
    if (toSel) {
      var toEl = resolve(toSel);
      if (!toEl) return { ok: false, error: "not_found" };
      var toBox = typeof toEl.getBoundingClientRect === "function" ? toEl.getBoundingClientRect() : null;
      if (!toBox || toBox.width < 1 || toBox.height < 1) return { ok: false, error: "not_visible" };
      end = { x: toBox.left + toBox.width / 2, y: toBox.top + toBox.height / 2 };
    } else {
      var x2 = Number(spec && spec.x2);
      var y2 = Number(spec && spec.y2);
      if (!isFinite(x2) || !isFinite(y2)) return { ok: false, error: "x2 and y2, or toSelector, required" };
      end = { x: x2, y: y2 };
    }
    var resolvedEnd = toSel ? toEl : null;
    var hitEnd = typeof doc.elementFromPoint === "function" ? doc.elementFromPoint(end.x, end.y) : null;
    var endTarget = closestHtml52(resolvedEnd || hitEnd || target);
    var view = doc.defaultView || g.window || g;
    var store = {};
    var dt = {
      dropEffect: "move",
      effectAllowed: "all",
      files: [],
      items: [],
      types: [],
      setData: function(type, val) {
        store[String(type)] = String(val == null ? "" : val);
        dt.types = Object.keys(store);
      },
      getData: function(type) {
        var key = String(type);
        if (store[key] != null) return store[key];
        if (key === "text" && store["text/plain"] != null) return store["text/plain"];
        return "";
      },
      clearData: function(type) {
        if (type) delete store[String(type)];
        else store = {};
        dt.types = Object.keys(store);
      },
      setDragImage: function() {
      }
    };
    try {
      var nativeDt = view && view.DataTransfer ? new view.DataTransfer() : null;
      if (nativeDt) {
        var origSet = dt.setData;
        dt.setData = function(type, val) {
          origSet(type, val);
          try {
            nativeDt.setData(type, val);
          } catch (e7) {
          }
        };
      }
    } catch (e8) {
    }
    try {
      dt.setData("text/plain", labelOf(target) || target && target.id || "drag");
    } catch (e9) {
    }
    try {
      dt.setData("text/html", target && target.innerHTML || "");
    } catch (e10) {
    }
    var srcHtml = target && target.innerHTML;
    var dstHtml = endTarget && endTarget.innerHTML;
    fire(target, point, 0, 1, ["pointerdown", "mousedown"], 1);
    dragEv2("dragstart", target, point);
    for (var step = 1; step <= 8; step++) {
      var mid = {
        x: point.x + (end.x - point.x) * step / 8,
        y: point.y + (end.y - point.y) * step / 8
      };
      fire(step === 8 ? endTarget : target, mid, 0, 1, ["pointermove", "mousemove"], 0);
      dragEv2("drag", step === 8 ? endTarget : target, mid);
    }
    dragEv2("dragenter", endTarget, end);
    dragEv2("dragover", endTarget, end);
    dragEv2("drop", endTarget, end);
    fire(endTarget, end, 0, 0, ["pointerup", "mouseup"], 1);
    dragEv2("dragend", target, end);
    if (target && endTarget && target !== endTarget && html5Drag2(target) && html5Drag2(endTarget) && srcHtml !== dstHtml) {
      if (target.innerHTML !== dstHtml || endTarget.innerHTML !== srcHtml) {
        try {
          target.innerHTML = dstHtml;
          endTarget.innerHTML = srcHtml;
        } catch (e16) {
        }
      }
    }
    return {
      ok: true,
      action: "drag",
      url: String(g.location && g.location.href || "").split("?")[0].slice(0, 300),
      title: doc.title || "",
      x: Math.round(point.x),
      y: Math.round(point.y),
      x2: Math.round(end.x),
      y2: Math.round(end.y),
      tag: String(endTarget.tagName || "").toLowerCase(),
      dragged: true
    };
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
    action: "click",
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
  function isShown(el2) {
    if (!el2 || typeof el2.getBoundingClientRect !== "function") return true;
    var box = el2.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    try {
      var st = el2.ownerDocument && el2.ownerDocument.defaultView || g.window || g;
      if (st && st.getComputedStyle) {
        var cs = st.getComputedStyle(el2);
        if (cs && (cs.display === "none" || cs.visibility === "hidden")) return false;
      }
    } catch (e) {
    }
    return true;
  }
  function queryDeep(rootDoc, sel) {
    if (!rootDoc || !sel) return null;
    var nodes = [];
    try {
      nodes = rootDoc.querySelectorAll(sel);
    } catch (e0) {
      nodes = [];
    }
    var first = null;
    for (var n = 0; n < nodes.length; n++) {
      if (!first) first = nodes[n];
      if (isShown(nodes[n])) return nodes[n];
    }
    if (first) return first;
    var frames = [];
    try {
      frames = rootDoc.querySelectorAll("iframe,frame");
    } catch (e1) {
      return null;
    }
    for (var i2 = 0; i2 < frames.length; i2++) {
      var child = null;
      try {
        child = frames[i2].contentDocument;
      } catch (e2) {
        child = null;
      }
      if (!child) continue;
      var nested = queryDeep(child, sel);
      if (nested) return nested;
    }
    return null;
  }
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
    return queryDeep(doc, sel);
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
    if (nudgeRange(el2, def2)) {
    } else if (def2.key === "Backspace" && isEditable(el2) && !mods2.ctrl && !mods2.alt && !mods2.meta) deleteOne(el2, false);
    else if (def2.key === "Delete" && isEditable(el2) && !mods2.ctrl && !mods2.alt && !mods2.meta) deleteOne(el2, true);
    else if (def2.key === "Tab") moveTab(el2, !!mods2.shift);
    else if (def2.key.length === 1 && !mods2.ctrl && !mods2.alt && !mods2.meta && isEditable(el2) && !blockedText(el2)) insertText(el2, def2.key);
    send("keypress");
    send("keyup");
  }
  function nudgeRange(el2, def2) {
    if (!el2 || tagOf(el2) !== "input") return false;
    if (String(el2.type || "").toLowerCase() !== "range") return false;
    var min = Number(el2.min);
    var max = Number(el2.max);
    var step = Number(el2.step);
    if (!isFinite(min)) min = 0;
    if (!isFinite(max)) max = 100;
    if (!isFinite(step) || step <= 0) step = 1;
    var cur = Number(el2.value);
    if (!isFinite(cur)) cur = min;
    var next = cur;
    if (def2.key === "ArrowRight" || def2.key === "ArrowUp") next = cur + step;
    else if (def2.key === "ArrowLeft" || def2.key === "ArrowDown") next = cur - step;
    else if (def2.key === "Home") next = min;
    else if (def2.key === "End") next = max;
    else return false;
    if (next > max) next = max;
    if (next < min) next = min;
    el2.value = String(next);
    emitInput(el2, null, "insertReplacementText");
    var view = doc.defaultView || g.window || g;
    try {
      if (view && typeof view.Event === "function") el2.dispatchEvent(new view.Event("change", { bubbles: true }));
    } catch (e) {
    }
    return true;
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

/* ==== scroll-page.ts ==== */
async function scrollPage(spec) {
  var g = typeof globalThis !== "undefined" ? globalThis : this;
  var doc = g.document;
  if (!doc) return { ok: false, error: "no_document" };
  var win = doc.defaultView || g.window || g;
  function wait(ms) {
    return new Promise(function(resolve2) {
      setTimeout(resolve2, ms);
    });
  }
  function overflowY(el) {
    if (!el || !win.getComputedStyle) return false;
    try {
      var oy = String((win.getComputedStyle(el) || {}).overflowY || "");
      return oy === "auto" || oy === "scroll" || oy === "overlay";
    } catch (e) {
      return false;
    }
  }
  function delta(el) {
    if (!el) return 0;
    return Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
  }
  function isWindowRoot(el) {
    return el === doc.scrollingElement || el === doc.documentElement || el === doc.body;
  }
  function isChromePane(el) {
    if (!el) return false;
    if (el.closest && el.closest('nav,aside,header,footer,[role="navigation"],[role="banner"],.left-pannel,.left-panel')) return true;
    var w = el.clientWidth || 0;
    var vw = win.innerWidth || 0;
    return vw > 0 && w > 0 && w < vw * 0.4;
  }
  function paneActuallyScrolls(el) {
    if (!el) return false;
    var y0 = el.scrollTop || 0;
    var probe = y0 > 8 ? y0 - 8 : y0 + 8;
    try {
      el.scrollTop = probe;
    } catch (e) {
      return false;
    }
    var y1 = el.scrollTop || 0;
    try {
      el.scrollTop = y0;
    } catch (e2) {
    }
    return Math.abs(y1 - y0) > 1;
  }
  function isPane(el) {
    if (!el || isWindowRoot(el) || isChromePane(el)) return false;
    if (delta(el) <= 32) return false;
    if (overflowY(el)) return true;
    var w = el.clientWidth || 0;
    var vw = win.innerWidth || 0;
    if (vw > 0 && w > vw * 0.45 && paneActuallyScrolls(el)) return true;
    return false;
  }
  function windowActuallyScrolls() {
    var scrolling = doc.scrollingElement || doc.documentElement;
    if (delta(scrolling) <= 32) return false;
    if (typeof win.scrollTo !== "function") return false;
    var y0 = win.scrollY || 0;
    var probe = y0 > 8 ? y0 - 8 : y0 + 8;
    try {
      win.scrollTo(0, probe);
    } catch (e) {
      return false;
    }
    var y1 = win.scrollY || 0;
    try {
      win.scrollTo(0, y0);
    } catch (e2) {
    }
    return Math.abs(y1 - y0) > 1;
  }
  function findNested() {
    var best = null;
    var bestDelta = 0;
    var nodes = [];
    try {
      nodes = doc.querySelectorAll("div,main,section,article");
    } catch (e) {
      nodes = [];
    }
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!isPane(el)) continue;
      var d = delta(el);
      if (d > bestDelta + 8) {
        best = el;
        bestDelta = d;
      }
    }
    if (best && bestDelta > 32) return best;
    return null;
  }
  function findRoot() {
    var scrolling = doc.scrollingElement || doc.documentElement;
    if (spec && spec.to === "bottom") return scrolling;
    if (windowActuallyScrolls()) return scrolling;
    return findNested() || scrolling;
  }
  function pos(root2) {
    if (!root2) return { x: 0, y: 0 };
    if (isWindowRoot(root2)) return { x: win.scrollX || 0, y: win.scrollY || 0 };
    return { x: root2.scrollLeft || 0, y: root2.scrollTop || 0 };
  }
  function setPos(root2, x, y) {
    if (!root2) return;
    if (isWindowRoot(root2)) {
      if (typeof win.scrollTo === "function") win.scrollTo(x, y);
      try {
        if (doc.documentElement) {
          doc.documentElement.scrollLeft = x;
          doc.documentElement.scrollTop = y;
        }
      } catch (e) {
      }
      try {
        if (doc.body) {
          doc.body.scrollLeft = x;
          doc.body.scrollTop = y;
        }
      } catch (e2) {
      }
      try {
        root2.scrollLeft = x;
        root2.scrollTop = y;
      } catch (e3) {
      }
      return;
    }
    root2.scrollLeft = x;
    root2.scrollTop = y;
  }
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
      var hit = doc.querySelector(sel);
      if (hit) return hit;
      var frames = doc.querySelectorAll("iframe,frame");
      for (var fi = 0; fi < frames.length; fi++) {
        var child = null;
        try {
          child = frames[fi].contentDocument;
        } catch (e4) {
          child = null;
        }
        if (!child) continue;
        try {
          hit = child.querySelector(sel);
          if (hit) return hit;
        } catch (e5) {
        }
      }
    } catch (e3) {
      return null;
    }
    return null;
  }
  async function apply(targetRoot, from) {
    var selector = spec && spec.selector ? String(spec.selector) : "";
    if (selector) {
      var target = resolve(selector);
      if (!target) return { missing: true };
      try {
        target.scrollIntoView({ block: "center", inline: "nearest" });
      } catch (e4) {
      }
      return { missing: false };
    }
    if (spec && spec.to === "top") {
      setPos(targetRoot, 0, 0);
      return { missing: false };
    }
    if (spec && spec.to === "bottom") {
      var stable = 0;
      for (var n = 0; n < 10; n++) {
        var h = targetRoot && targetRoot.scrollHeight || 0;
        setPos(targetRoot, 0, h);
        try {
          if (isWindowRoot(targetRoot) && win.dispatchEvent) win.dispatchEvent(new Event("scroll"));
          else if (targetRoot && targetRoot.dispatchEvent) targetRoot.dispatchEvent(new Event("scroll"));
        } catch (e5) {
        }
        await wait(500);
        var grown = (targetRoot && targetRoot.scrollHeight || 0) > h + 2;
        if (grown) stable = 0;
        else {
          stable += 1;
          if (stable >= 2) break;
        }
      }
      return { missing: false };
    }
    var dx = Number(spec && spec.dx) || 0;
    var dy = Number(spec && spec.dy) || 0;
    setPos(targetRoot, from.x + dx, from.y + dy);
    return { missing: false };
  }
  var root = findRoot();
  var before = pos(root);
  var applied = await apply(root, before);
  if (applied.missing) return { ok: false, error: "not_found" };
  var after = pos(root);
  var moved = after.x !== before.x || after.y !== before.y;
  if (!moved && !(spec && spec.selector)) {
    var alt = isWindowRoot(root) ? findNested() : doc.scrollingElement || doc.documentElement;
    if (alt && alt !== root) {
      var altBefore = pos(alt);
      await apply(alt, altBefore);
      var altAfter = pos(alt);
      if (altAfter.x !== altBefore.x || altAfter.y !== altBefore.y) {
        root = alt;
        after = altAfter;
        moved = true;
      }
    }
  }
  return {
    ok: true,
    url: String(g.location && g.location.href || "").split("?")[0].slice(0, 300),
    title: doc.title || "",
    scrollX: after.x,
    scrollY: after.y,
    scrollHeight: root && root.scrollHeight || 0,
    clientHeight: isWindowRoot(root) ? win.innerHeight || 0 : root && root.clientHeight || 0,
    scrollRoot: isWindowRoot(root) ? "window" : "element",
    moved
  };
}
const scrollRoot = typeof globalThis !== "undefined" ? globalThis : this;
scrollRoot.CcScrollPage = { scrollPage };

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
  function isAdFrameUrl(url) {
    return /doubleclick|googlesyndication|googleads|adservice|adnxs|adplus|facebook\.com\/tr|hotjar|clarity\.ms/i.test(String(url || ""));
  }
  function mergeReadFrames(results) {
    var fields = [];
    var main = null;
    for (var i = 0; i < (results || []).length; i++) {
      var row = results[i];
      var page = row && row.result;
      if (!page || page.ok === false) continue;
      if (isAdFrameUrl(page.url)) continue;
      if (!main) main = page;
      var list = page.fields || [];
      for (var f = 0; f < list.length; f++) {
        fields.push(Object.assign({}, list[f], { frameId: row.frameId }));
      }
    }
    if (!main) return null;
    return Object.assign({}, main, { fields });
  }
  function pickBestFrameResult(results) {
    var fallback = null;
    for (var i = 0; i < (results || []).length; i++) {
      var page = results[i] && results[i].result;
      if (!page) continue;
      var tagged = Object.assign({}, page, { frameId: results[i].frameId });
      if (page.ok) return tagged;
      if (!fallback || page.error !== "not_found") fallback = tagged;
    }
    return fallback;
  }
  async function injectKernel(tabId, allFrames) {
    await chrome.scripting.executeScript({
      target: allFrames ? { tabId, allFrames: true } : { tabId },
      files: kernelScripts()
    });
  }
  function isFrameGone(err) {
    return /Frame with ID .* was removed|frame was removed|The tab was closed|No tab with id|moved to a different document|click_script_timeout/i.test(String(err && err.message || err || ""));
  }
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise(function(_, reject) {
        setTimeout(function() {
          reject(new Error(label || "script_timeout"));
        }, ms);
      })
    ]);
  }
  async function tabIfNavigated(tab, beforeUrl) {
    for (var i = 0; i < 6; i++) {
      await waitMs(i === 0 ? 250 : 200);
      var after = tab;
      try {
        after = await chrome.tabs.get(tab.id);
      } catch (e) {
        return null;
      }
      if (after && after.status === "loading") continue;
      if (pageUrl(after && after.url || "") && pageUrl(after.url) !== pageUrl(beforeUrl)) {
        return {
          ok: true,
          tabId: tab.id,
          url: pageUrl(after.url),
          title: after.title || "",
          moved: true,
          reason: ""
        };
      }
    }
    return null;
  }
  async function runPageTask(taskId, tabId, func, args) {
    var tab = await pickTaskTab(tabId);
    if (!tab || !tab.id) {
      replyBrowserTask(taskId, { ok: false, error: "no_tab" });
      return;
    }
    var beforeUrl = tab.url || "";
    try {
      await injectKernel(tab.id, true);
      var results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func,
        args: args || []
      });
      var page = func === readFormPage ? mergeReadFrames(results) : pickBestFrameResult(results);
      replyBrowserTask(taskId, Object.assign({ ok: false, tabId: tab.id, url: tab.url || null }, page || { error: "no_result" }));
    } catch (e) {
      var nav = await tabIfNavigated(tab, beforeUrl);
      if (nav) {
        replyBrowserTask(taskId, nav);
        return;
      }
      replyBrowserTask(taskId, { ok: false, tabId: tab.id, error: e && e.message || "page_task_failed" });
    }
  }
  async function runClickTask(taskId, tabId, spec) {
    var tab = await pickWebTab(tabId);
    if (!tab || !tab.id) {
      replyBrowserTask(taskId, { ok: false, error: "no_tab" });
      return;
    }
    if (String(tab.url || "").indexOf("http") !== 0) {
      replyBrowserTask(taskId, { ok: false, error: "open_a_form_page", tabId: tab.id });
      return;
    }
    var beforeUrl = tab.url || "";
    var want = spec && spec.text || "";
    try {
      try {
        await chrome.tabs.update(tab.id, { active: true });
      } catch (e0) {
      }
      await injectKernel(tab.id, false);
      var results = null;
      try {
        results = await withTimeout(chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: clickFromJson,
          args: [spec || {}]
        }), 3500, "click_script_timeout");
      } catch (e1) {
        var nav = await tabIfNavigated(tab, beforeUrl);
        if (nav) {
          replyBrowserTask(taskId, Object.assign(nav, { clicked: want, label: want }));
          return;
        }
        if (!isFrameGone(e1)) {
          replyBrowserTask(taskId, { ok: false, tabId: tab.id, error: e1 && e1.message || "page_task_failed" });
          return;
        }
      }
      var page = results && results[0] && results[0].result;
      var after = tab;
      try {
        after = await chrome.tabs.get(tab.id);
      } catch (e2) {
      }
      var afterUrl = after && after.url || page && page.url || beforeUrl;
      var moved = pageUrl(afterUrl) !== pageUrl(beforeUrl);
      if (!moved && page && page.link) {
        var late = await tabIfNavigated(tab, beforeUrl);
        if (late) {
          replyBrowserTask(taskId, {
            ok: true,
            tabId: tab.id,
            url: late.url,
            title: late.title,
            clicked: page && page.clicked || want,
            hovered: page && page.hovered || null,
            selector: page && page.selector || "",
            label: page && page.label || want,
            reason: "",
            moved: true
          });
          return;
        }
        try {
          after = await chrome.tabs.get(tab.id);
        } catch (e4) {
        }
        afterUrl = after && after.url || afterUrl;
        moved = pageUrl(afterUrl) !== pageUrl(beforeUrl);
      }
      var ok = !!(page && page.ok) || moved;
      replyBrowserTask(taskId, {
        ok,
        tabId: tab.id,
        url: pageUrl(afterUrl),
        title: after && after.title || page && page.title || "",
        clicked: page && page.clicked || want,
        hovered: page && page.hovered || null,
        selector: page && page.selector || "",
        label: page && page.label || want,
        reason: ok ? "" : page && page.reason || page && page.error || "not_found",
        moved: moved || !!(page && page.moved)
      });
    } catch (e3) {
      var nav2 = await tabIfNavigated(tab, beforeUrl);
      if (nav2) {
        replyBrowserTask(taskId, Object.assign(nav2, { clicked: want, label: want }));
        return;
      }
      replyBrowserTask(taskId, { ok: false, tabId: tab.id, error: e3 && e3.message || "page_task_failed" });
    }
  }
  async function runFillFormTask(taskId, tabId, fields) {
    var tab = await pickTaskTab(tabId);
    if (!tab || !tab.id) {
      replyBrowserTask(taskId, { ok: false, error: "no_tab" });
      return;
    }
    try {
      await injectKernel(tab.id, true);
      var groups = {};
      for (var i = 0; i < (fields || []).length; i++) {
        var field = fields[i];
        var key = Number.isFinite(Number(field && field.frameId)) ? String(Number(field.frameId)) : "main";
        if (!groups[key]) groups[key] = [];
        groups[key].push(field);
      }
      var keys = Object.keys(groups);
      var records = [];
      var filled = 0;
      var skipped = 0;
      var failed = 0;
      var stopped = false;
      var url = tab.url || null;
      for (var g = 0; g < keys.length; g++) {
        var key = keys[g];
        var target = { tabId: tab.id };
        if (key !== "main") target.frameIds = [Number(key)];
        var results = await chrome.scripting.executeScript({
          target,
          func: fillFormPage,
          args: [groups[key]]
        });
        var page = results && results[0] && results[0].result;
        if (!page) continue;
        url = page.url || url;
        if (page.stopped) stopped = true;
        filled += page.filled || 0;
        skipped += page.skipped || 0;
        failed += page.failed || 0;
        if (Array.isArray(page.records)) records = records.concat(page.records);
      }
      replyBrowserTask(taskId, {
        ok: !stopped,
        tabId: tab.id,
        url,
        stopped,
        filled,
        skipped,
        failed,
        records
      });
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
      if (!entry && api.findByText) {
        var found = api.findByText(spec && spec.text, document);
        if (found && found.field) entry = found.field;
      }
    }
    if (!entry) return { ok: false, error: "not_found", url: location.href };
    var beforeUrl = location.href;
    var beforeTitle = document.title;
    var pressed = api.press(entry, document);
    var navigates = entry && entry.type === "link";
    var hovered = !!(pressed && pressed.hovered);
    await new Promise(function(r) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        try {
          window.removeEventListener("pagehide", finish);
        } catch (e0) {
        }
        r();
      }
      try {
        window.addEventListener("pagehide", finish);
      } catch (e1) {
      }
      setTimeout(finish, navigates ? 50 : hovered ? 200 : 900);
    });
    var changed = location.href !== beforeUrl || document.title !== beforeTitle;
    var didPress = !!(pressed && pressed.pressed);
    return {
      ok: didPress,
      url: location.href,
      clicked: pressed && pressed.clicked || "",
      hovered: hovered ? pressed && pressed.clicked || "" : null,
      selector: pressed && pressed.selector || entry.selector || "",
      label: entry.visualLabel || entry.label || "",
      reason: didPress ? "" : pressed && pressed.reason || "not_found",
      moved: changed,
      link: navigates
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
  function isCaptureQuota(err) {
    return /MAX_CAPTURE_VISIBLE_TAB|quota/i.test(String(err && err.message || err || ""));
  }
  async function captureVisibleJpeg(windowId, quality) {
    var last = null;
    for (var i = 0; i < 5; i++) {
      try {
        return await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality });
      } catch (e) {
        last = e;
        if (!isCaptureQuota(e)) throw e;
        await waitMs(600 + i * 300);
      }
    }
    var quota = new Error("capture_quota");
    quota.cause = last;
    throw quota;
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
      await waitMs(i === 0 ? 250 : 650);
      shots.push({
        y: top,
        dataUrl: await captureVisibleJpeg(windowId, 60)
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
      if (scope === "page") {
        shot = await captureWholePage(tab.id, tab.windowId, metrics);
      } else {
        var dataUrl = await captureVisibleJpeg(tab.windowId, 72);
        shot = await cropVisible(dataUrl, scope === "area" ? metrics.box : null, metrics.clientWidth);
      }
    } catch (e3) {
      var message = e3 && e3.message || "capture_failed";
      if (isCaptureQuota(e3) || message === "capture_quota") message = "capture_quota";
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
    var cssW = metrics.clientWidth || 1;
    var cssH = metrics.clientHeight || 1;
    if (scope === "area" && metrics.box) {
      cssW = metrics.box.width || cssW;
      cssH = metrics.box.height || cssH;
    } else if (scope === "page") {
      cssH = Math.min(metrics.scrollHeight || cssH, (metrics.clientHeight || 1) * 6);
    }
    var imgW = shot.width || 1;
    var imgH = shot.height || 1;
    return {
      ok: true,
      tabId: tab.id,
      url: metrics.url || url,
      title: metrics.title || "",
      scope,
      width: shot.width,
      height: shot.height,
      cssWidth: Math.round(cssW),
      cssHeight: Math.round(cssH),
      scaleX: cssW / imgW,
      scaleY: cssH / imgH,
      clickSpace: "css",
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
  async function runCloseTab(tabId) {
    if (!tabId) return { ok: false, error: "tabId required" };
    var id = Number(tabId);
    try {
      await chrome.tabs.get(id);
    } catch (e) {
      return { ok: false, error: "no_tab" };
    }
    try {
      await chrome.tabs.remove(id);
    } catch (e2) {
      return { ok: false, error: e2 && e2.message || "close_failed", tabId: id };
    }
    return { ok: true, closed: true, tabId: id };
  }
  async function runScroll(spec) {
    var tab = await pickWebTab(spec && spec.tabId);
    if (!tab || !tab.id) return { ok: false, error: "no_tab" };
    if (String(tab.url || "").indexOf("http") !== 0) return { ok: false, error: "open_a_form_page", tabId: tab.id };
    var fn = root.CcScrollPage && root.CcScrollPage.scrollPage;
    if (typeof fn !== "function") return { ok: false, error: "scroll_not_loaded" };
    if (spec && spec.selector) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: kernelScripts() });
      } catch (e) {
      }
    }
    try {
      await chrome.tabs.update(tab.id, { active: true });
    } catch (e0) {
    }
    try {
      var scrollMs = spec && spec.to === "bottom" ? 2e4 : 8e3;
      var results = await withTimeout(chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fn,
        args: [{
          dy: spec && spec.dy || 0,
          dx: spec && spec.dx || 0,
          to: spec && spec.to || "",
          selector: spec && spec.selector || ""
        }],
        injectImmediately: true
      }), scrollMs, "scroll_script_timeout");
      var page = results && results[0] && results[0].result;
      return Object.assign({ tabId: tab.id }, page || { ok: false, error: "no_result" });
    } catch (e2) {
      return { ok: false, error: e2 && e2.message || "page_not_readable", tabId: tab.id };
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
    var beforeUrl = tab.url || "";
    try {
      await chrome.tabs.update(tab.id, { active: true });
    } catch (e) {
    }
    if (spec && spec.selector) {
      try {
        await injectKernel(tab.id, true);
      } catch (e2) {
      }
    }
    try {
      var target = { tabId: tab.id };
      if (Number.isFinite(Number(spec && spec.frameId))) target.frameIds = [Number(spec.frameId)];
      var results = await withTimeout(chrome.scripting.executeScript({
        target,
        func: fn,
        args: [spec || {}],
        injectImmediately: true,
        world: spec && spec.action === "drag" ? "MAIN" : "ISOLATED"
      }), 8e3, "pointer_script_timeout");
      var page = results && results[0] && results[0].result;
      if ((!page || page.error === "not_found") && spec && spec.selector && !target.frameIds) {
        results = await withTimeout(chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          func: fn,
          args: [spec || {}],
          injectImmediately: true
        }), 8e3, "pointer_script_timeout");
        page = pickBestFrameResult(results);
      }
      await waitMs(400);
      var after = tab;
      try {
        after = await chrome.tabs.get(tab.id);
      } catch (e3) {
      }
      return Object.assign({ tabId: tab.id }, page || { ok: false, error: "no_result" }, { url: pageUrl(after && after.url || page && page.url || "") });
    } catch (e4) {
      var nav = await tabIfNavigated(tab, beforeUrl);
      if (nav) return Object.assign({ clicked: spec && spec.selector || "" }, nav);
      return { ok: false, error: isFrameGone(e4) ? e4 && e4.message : "page_not_readable", tabId: tab.id };
    }
  }
  function runMouseClick(spec) {
    var api = root.CcPagePointer;
    return runPointerTask({
      tabId: spec && spec.tabId || null,
      x: spec && spec.x,
      y: spec && spec.y,
      x2: spec && spec.x2,
      y2: spec && spec.y2,
      selector: spec && spec.selector || "",
      toSelector: spec && spec.toSelector || "",
      frameId: spec && spec.frameId,
      button: spec && spec.button || "left",
      count: spec && spec.count || 1,
      action: spec && spec.action || "click"
    }, api && api.clickAt);
  }
  function runHover(spec) {
    return runMouseClick(Object.assign({}, spec, { action: "hover" }));
  }
  function runDrag(spec) {
    return runMouseClick(Object.assign({}, spec, { action: "drag" }));
  }
  function runKeyboard(spec) {
    var api = root.CcPagePointer;
    return runPointerTask({
      tabId: spec && spec.tabId || null,
      selector: spec && spec.selector || "",
      frameId: spec && spec.frameId,
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
      runClickTask(msg.taskId, msg.tabId, { text: msg.text || "", control: msg.control || null });
      return;
    }
    if (msg.task === "read_form") {
      runPageTask(msg.taskId, msg.tabId, readFormPage, []);
      return;
    }
    if (msg.task === "fill_form") {
      runFillFormTask(msg.taskId, msg.tabId, Array.isArray(msg.fields) ? msg.fields : []);
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
    if (msg.task === "close_tab") {
      runCloseTab(msg.tabId).then(function(result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function(err) {
        replyBrowserTask(msg.taskId, { ok: false, error: err && err.message || "close_failed" });
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
    if (msg.task === "hover") {
      runHover(msg).then(function(result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function(err) {
        replyBrowserTask(msg.taskId, { ok: false, error: err && err.message || "hover_failed" });
      });
      return;
    }
    if (msg.task === "drag") {
      runDrag(msg).then(function(result) {
        replyBrowserTask(msg.taskId, result);
      }).catch(function(err) {
        replyBrowserTask(msg.taskId, { ok: false, error: err && err.message || "drag_failed" });
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
    var reuse = !!(msg.tabId || msg.newTab === false);
    if (reuse) {
      runOpenInTab(msg.taskId, url, msg.tabId).catch(function(err) {
        replyBrowserTask(msg.taskId, { ok: false, error: err && err.message || "navigate_failed" });
      });
      return;
    }
    chrome.tabs.create({ url, active: true }, function(tab) {
      if (chrome.runtime.lastError || !tab) {
        replyBrowserTask(msg.taskId, { ok: false, error: chrome.runtime.lastError && chrome.runtime.lastError.message || "failed to open tab" });
        return;
      }
      replyBrowserTask(msg.taskId, { ok: true, tabId: tab.id, url: tab.pendingUrl || tab.url || url, navigated: false });
    });
  }
  async function runOpenInTab(taskId, url, tabId) {
    var tab = await pickWebTab(tabId);
    if (tab && tab.id) {
      try {
        var updated = await chrome.tabs.update(tab.id, { url, active: true });
        replyBrowserTask(taskId, {
          ok: true,
          tabId: tab.id,
          url: updated && (updated.pendingUrl || updated.url) || url,
          navigated: true
        });
        return;
      } catch (e) {
      }
    }
    chrome.tabs.create({ url, active: true }, function(created) {
      if (chrome.runtime.lastError || !created) {
        replyBrowserTask(taskId, { ok: false, error: chrome.runtime.lastError && chrome.runtime.lastError.message || "failed to open tab" });
        return;
      }
      replyBrowserTask(taskId, { ok: true, tabId: created.id, url: created.pendingUrl || created.url || url, navigated: false });
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
