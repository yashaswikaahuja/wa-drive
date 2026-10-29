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
    var mapping = {};
    var fbs = {};
    var list = Array.isArray(incoming) ? incoming : [];
    var skip = /captcha|otp|password|cvv|card number|\bpin\b/i;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!f || !f.selector || f.value == null || String(f.value) === "") continue;
      var label = f.visualLabel || f.label || "";
      if (skip.test(label) || skip.test(f.selector)) continue;
      if (/^(button|submit)$/i.test(f.type || "")) continue;
      if (/^(reset|image|file)$/i.test(f.type || "")) continue;
      mapping[f.selector] = { value: String(f.value), type: f.type || "text", label, visualLabel: label };
      fbs[f.selector] = { label, visualLabel: label, source: "operator" };
    }
    await fillFormFieldsSequential(mapping, fbs, {}, list);
    var clickRecords = [];
    var clickApi = typeof globalThis !== "undefined" ? globalThis.CcClickControl : null;
    if (clickApi && typeof clickApi.press === "function") {
      for (var c = 0; c < list.length; c++) {
        var buttonField = list[c];
        if (!buttonField || !/^(button|submit)$/i.test(buttonField.type || "")) continue;
        var buttonLabel = buttonField.visualLabel || buttonField.label || "";
        if (skip.test(buttonLabel)) continue;
        var beforeMark = location.href + "|" + document.title + "|" + (document.body && document.body.innerText ? document.body.innerText.length : 0);
        var pressed = clickApi.press(buttonField, document);
        await new Promise(function(r) {
          setTimeout(r, 700);
        });
        var afterMark = location.href + "|" + document.title + "|" + (document.body && document.body.innerText ? document.body.innerText.length : 0);
        var changed = beforeMark !== afterMark;
        clickRecords.push({
          selector: pressed && pressed.selector || buttonField.selector || "",
          label: buttonLabel,
          result: pressed && pressed.pressed && changed ? "clicked" : "no_effect",
          failReason: pressed && pressed.pressed ? changed ? "" : "no_effect" : pressed && pressed.reason || "not_found",
          plannedValue: buttonLabel,
          actualValue: pressed && pressed.clicked || ""
        });
      }
    }
    var records = [];
    try {
      var raw = document.body && document.body.getAttribute("data-cc-records");
      if (raw) records = JSON.parse(raw);
    } catch (e) {
    }
    if (!records.length && Array.isArray(window.__ccFillRecords)) records = window.__ccFillRecords;
    records = records.concat(clickRecords);
    function count(name) {
      return records.filter(function(r) {
        return r && r.result === name;
      }).length;
    }
    return {
      ok: true,
      url: location.href,
      filled: count("filled"),
      skipped: count("skipped") + count("waiting_human"),
      failed: count("failed") + count("error"),
      records: records.map(function(r) {
        return {
          selector: r.selector || "",
          label: r.label || "",
          result: r.result || "",
          failReason: r.failReason || "",
          plannedValue: r.plannedValue != null ? r.plannedValue : r.value,
          actualValue: r.actualValue != null ? r.actualValue : r.actual != null ? r.actual : ""
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
    var beforeMark = location.href + "|" + document.title + "|" + (document.body && document.body.innerText ? document.body.innerText.length : 0);
    var pressed = api.press(entry, document);
    await new Promise(function(r) {
      setTimeout(r, 900);
    });
    var afterMark = location.href + "|" + document.title + "|" + (document.body && document.body.innerText ? document.body.innerText.length : 0);
    var changed = beforeMark !== afterMark;
    return {
      ok: !!(pressed && pressed.pressed && changed),
      url: location.href,
      clicked: pressed && pressed.clicked || "",
      selector: pressed && pressed.selector || entry.selector || "",
      label: entry.visualLabel || entry.label || "",
      reason: pressed && pressed.pressed ? changed ? "" : "no_effect" : pressed && pressed.reason || "not_found"
    };
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
