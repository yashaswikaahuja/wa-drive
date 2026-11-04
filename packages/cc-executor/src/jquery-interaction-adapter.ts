/**
 * jQuery interaction adapter for the extension executor.
 * Page-world jQuery may be hidden by Chrome's isolated content-script world.
 * Native bubbling events still reach jQuery .on() handlers registered by the page.
 * Synthetic events are not trusted user gestures; use browser-input for those.
 */
(function (root) {
  'use strict';
  function getJQuery() {
    var jq = root && (root.jQuery || root.$);
    return typeof jq === 'function' && jq.fn && typeof jq.fn.trigger === 'function' ? jq : null;
  }
  function makeEvent(el, name, detail) {
    var view = el && el.ownerDocument && el.ownerDocument.defaultView;
    var E = view && view.Event ? view.Event : (typeof Event !== 'undefined' ? Event : null);
    var CE = view && view.CustomEvent ? view.CustomEvent : (typeof CustomEvent !== 'undefined' ? CustomEvent : null);
    if (detail !== undefined && CE) return new CE(name, { bubbles: true, cancelable: true, detail: detail });
    return E ? new E(name, { bubbles: true, cancelable: true }) : null;
  }
  function trigger(el, name, detail) {
    if (!el || typeof name !== 'string' || !name.trim()) return { success: false, strategy: 'none', reason: 'invalid-target-or-event' };
    var jq = getJQuery();
    if (jq) {
      try { jq(el).trigger(name.trim(), detail === undefined ? undefined : [detail]); return { success: true, strategy: 'jquery-trigger', event: name.trim() }; }
      catch (e) { /* native fallback */ }
    }
    var event = makeEvent(el, name.trim(), detail);
    if (!event || typeof el.dispatchEvent !== 'function') return { success: false, strategy: 'none', reason: 'event-dispatch-unavailable' };
    try { return { success: el.dispatchEvent(event) !== false, strategy: 'native-event', event: name.trim() }; }
    catch (e) { return { success: false, strategy: 'native-event', event: name.trim(), reason: 'dispatch-failed' }; }
  }
  function triggerHandler(el, name, detail) {
    var jq = getJQuery();
    if (!jq || !el || typeof name !== 'string' || !name.trim()) return { success: false, strategy: 'none', reason: 'jquery-triggerHandler-unavailable' };
    try { jq(el).triggerHandler(name.trim(), detail === undefined ? undefined : [detail]); return { success: true, strategy: 'jquery-triggerHandler', event: name.trim() }; }
    catch (e) { return { success: false, strategy: 'jquery-triggerHandler', event: name.trim(), reason: 'handler-failed' }; }
  }
  function setValue(el, value, options) {
    if (!el) return { success: false, verified: false, reason: 'target-not-found' };
    var raw = value == null ? '' : String(value);
    var jq = getJQuery();
    var strategy = 'native-setter';
    try {
      if (jq) { jq(el).val(raw); strategy = 'jquery-val'; }
      else {
        var view = el.ownerDocument && el.ownerDocument.defaultView;
        var tag = String(el.tagName || '').toLowerCase();
        var ctor = tag === 'textarea' ? view && view.HTMLTextAreaElement : view && view.HTMLInputElement;
        var desc = ctor && Object.getOwnPropertyDescriptor(ctor.prototype, 'value');
        if (desc && desc.set) desc.set.call(el, raw); else el.value = raw;
      }
    } catch (e) { return { success: false, verified: false, strategy: strategy, reason: 'value-set-failed' }; }
    var events = options && Array.isArray(options.events) ? options.events : [];
    var eventResults = events.map(function (eventName) { return trigger(el, eventName); });
    var actual = String(el.value == null ? '' : el.value);
    var verified = actual === raw;
    return { success: verified, verified: verified, strategy: strategy, value: actual, events: eventResults, reason: verified ? '' : 'value-verification-failed' };
  }
  function click(el) {
    if (!el || typeof el.click !== 'function') return { success: false, strategy: 'native-click', reason: 'click-unavailable' };
    try { el.click(); return { success: true, strategy: 'native-click' }; }
    catch (e) { return { success: false, strategy: 'native-click', reason: 'click-failed' }; }
  }
  root.CcJQueryInteractionAdapter = {
    isJQueryAvailable: function () { return !!getJQuery(); },
    trigger: trigger,
    triggerHandler: triggerHandler,
    setValue: setValue,
    click: click
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
