/**
 * AUTO-GENERATED
 * Source: @cc/plugins
 * Rebuild: pnpm --filter cybercontrol-extension build
 */

/* ==== interface.ts ==== */
var PluginInterface = {
  // Required: unique plugin identifier
  id: "",
  // Required: human-readable description
  description: "",
  // Required: does this plugin handle this element?
  // (el: HTMLElement, fieldContext: {type, label, selector}) => boolean
  supports: null,
  // Required: execute the interaction
  // (el: HTMLElement, value: string, context: {profileKey, parentValues, attempt}) => {success: boolean, settled: boolean, waitMs?: number}
  fill: null,
  // Required: declarative metadata for planner/runtime
  meta: {
    interactionFamily: "",
    // e.g. 'cascade', 'ng-dropdown', 'file-upload'
    needsStabilization: false,
    // runtime should wait after fill
    populatesChildren: false,
    // filling this triggers async option population downstream
    dependsOn: [],
    // profileKey[] of fields that must fill before this one
    waitFor: null,
    // stabilization signal: 'options-populated' | 'dom-quiet' | null
    needsParentValues: false
    // if true, context.parentValues will be populated
  }
};
var PLUGIN_REGISTRY = [];
function registerPlugin(plugin) {
  if (!plugin.id || !plugin.supports || !plugin.fill) throw new Error("Invalid plugin: missing id/supports/fill");
  PLUGIN_REGISTRY.push(plugin);
}
function findPlugin(el, fieldContext) {
  for (const plugin of PLUGIN_REGISTRY) {
    try {
      if (plugin.supports(el, fieldContext)) return plugin;
    } catch (e) {
    }
  }
  return null;
}

/* ==== cascade-select.ts ==== */
var CASCADE_FIELDS = ["state", "district", "sub_division", "subdivision", "block", "panchayat", "village", "village_panchayat", "post_office"];
var CASCADE_DEPENDENCIES = {
  district: ["state"],
  sub_division: ["district"],
  subdivision: ["district"],
  block: ["district", "sub_division"],
  panchayat: ["block"],
  village: ["block"],
  village_panchayat: ["block"],
  post_office: ["block", "village"]
};
var CascadeSelectPlugin = {
  id: "cascade-select",
  description: "Dependent <select> chains: waits for option population, applies with DWR/jQuery compat",
  supports(el, fieldContext) {
    if (!el || el.tagName !== "SELECT") return false;
    var label = (fieldContext.label || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
    var pk = (fieldContext.profileKey || "").toLowerCase();
    var isCascade = CASCADE_FIELDS.some((k) => label.includes(k) || pk.includes(k));
    if (!isCascade) return false;
    return true;
  },
  fill(el, value, context) {
    function findOpt(options) {
      return window.ccMatchOption(value, options);
    }
    function applySelect(el2, opt2) {
      return window.ccApplySelect(el2, opt2);
    }
    var allOpts = Array.from(el.options);
    var opt = findOpt(allOpts);
    if (opt) {
      applySelect(el, opt);
      return { success: true, settled: true, waitMs: 0 };
    }
    var realOpts = allOpts.filter((o) => o.value && o.value !== "0" && o.value !== "-1" && o.value !== "");
    if (realOpts.length === 0) {
      return { success: false, settled: false, reason: "no-options-loaded" };
    }
    return { success: false, settled: true, reason: "no-matching-option", optionCount: realOpts.length };
  },
  meta: {
    interactionFamily: "cascade",
    needsStabilization: true,
    populatesChildren: true,
    waitFor: "options-populated",
    needsParentValues: true,
    // Dynamic dependsOn resolved per-field from CASCADE_DEPENDENCIES
    getDependsOn(profileKey) {
      var pk = (profileKey || "").toLowerCase();
      return CASCADE_DEPENDENCIES[pk] || [];
    }
  }
};
registerPlugin(CascadeSelectPlugin);

/* ==== ng-dropdown.ts ==== */
var TRIGGER_SELECTORS = [".value-area", ".select-type", ".ng-value-container", ".ng-select-container", ".v-field__input", ".v-select__selection", ".v-field", ".ui-selectmenu-button", "[tabindex]"];
var OPTION_SELECTORS = [".ng-option", "mat-option", ".v-list-item", ".ui-menu-item-wrapper", ".dropdown-item", ".option", '[role="option"]', "li"];
var OVERLAY_SELECTORS = ["app-dropdown", "ng-dropdown-panel", ".ng-dropdown-panel", ".dropdown-options", ".options-list", ".options", ".v-overlay__content", ".v-menu > .v-overlay__content", ".ui-selectmenu-menu", ".ui-menu", "ul", "cdk-overlay-container"];
function findOptionsInContainer(container, optSel, isVisible) {
  if (optSel) return Array.from(container.querySelectorAll(optSel)).filter(isVisible);
  for (var sel of OPTION_SELECTORS) {
    var items = Array.from(container.querySelectorAll(sel)).filter(isVisible);
    if (items.length) return items;
  }
  return [];
}
var NgDropdownPlugin = {
  id: "ng-dropdown",
  description: "Angular, Vuetify and jQuery UI custom select: open, choose and verify",
  supports(el, fieldContext) {
    if (!el) return false;
    if (fieldContext.type === "ng-dropdown" || fieldContext.type === "mat-select") return true;
    if (el.classList && ["ng-dropdown", "ng-select", "v-select", "v-autocomplete", "v-combobox", "ui-selectmenu-button"].some(function(c) { return el.classList.contains(c); })) return true;
    if (el.tagName === "NG-SELECT" || el.closest && el.closest("ng-select, .v-select, .v-autocomplete, .v-combobox, .ui-selectmenu-button")) return true;
    var tag = String(el.tagName || "").toLowerCase();
    return tag !== "select" && tag !== "input" && (el.getAttribute("role") === "combobox" || el.getAttribute("role") === "listbox");
  },
  fill(el, value, context) {
    var adapter = context.portalAdapters || {};
    function isVisible(node) { return window.ccDomUtils.isVisible(node); }
    var trigger = null;
    if (adapter.triggerSelector) trigger = el.querySelector(adapter.triggerSelector);
    if (!trigger) {
      for (var i = 0; i < TRIGGER_SELECTORS.length; i++) {
        trigger = el.querySelector(TRIGGER_SELECTORS[i]);
        if (trigger && isVisible(trigger)) break;
        trigger = null;
      }
    }
    if (!trigger && el.matches && el.matches('.ui-selectmenu-button, [role="combobox"]')) trigger = el;
    if (!trigger) trigger = el;
    trigger.click();
    var startTime = Date.now(), optSel = adapter.optionSelector || null;
    return new Promise(function(resolve) {
      var attempts = 0;
      var poll = setInterval(function() {
        attempts++;
        if (Date.now() - startTime > 5000) {
          clearInterval(poll);
          resolve({ success: false, settled: true, reason: "timeout-no-options" });
          return;
        }
        var opts = [];
        if (adapter.optionsContainer) {
          var configured = document.querySelector(adapter.optionsContainer);
          if (configured) opts = findOptionsInContainer(configured, optSel, isVisible);
        }
        if (!opts.length) {
          var panel = el.id ? document.querySelector('[data-owner="' + el.id + '"]') : null;
          if (panel) opts = findOptionsInContainer(panel, optSel, isVisible);
          if (!opts.length && el.nextElementSibling) opts = findOptionsInContainer(el.nextElementSibling, optSel, isVisible);
          if (!opts.length && el.parentElement) {
            var siblings = Array.from(el.parentElement.children).filter(function(c) { return c !== el; });
            for (var si = 0; si < siblings.length; si++) {
              opts = findOptionsInContainer(siblings[si], optSel, isVisible);
              if (opts.length) break;
            }
          }
        }
        if (!opts.length) {
          var rect = el.getBoundingClientRect(), best = [], bestDistance = Infinity;
          for (var oi = 0; oi < OVERLAY_SELECTORS.length; oi++) {
            var containers = document.querySelectorAll(OVERLAY_SELECTORS[oi]);
            for (var ci = 0; ci < containers.length; ci++) {
              var items = findOptionsInContainer(containers[ci], optSel, isVisible);
              if (!items.length) continue;
              var cr = containers[ci].getBoundingClientRect();
              var distance = Math.abs(cr.left - rect.left) + Math.abs(cr.top - rect.bottom);
              if (distance < bestDistance) { bestDistance = distance; best = items; }
            }
          }
          opts = best;
        }
        if (!opts.length) opts = findOptionsInContainer(el, optSel, isVisible);
        if (!opts.length && attempts < 15) return;
        var texts = opts.map(function(o) { return String(o.textContent || "").replace(/\s+/g, " ").trim(); });
        var matched = window.ccMatchOption(value, texts);
        var match = matched ? opts.find(function(o) { return String(o.textContent || "").replace(/\s+/g, " ").trim() === matched; }) : null;
        if (!match) {
          if (attempts >= 15) { clearInterval(poll); resolve({ success: false, settled: true, reason: "no-matching-option", optionCount: opts.length }); }
          return;
        }
        clearInterval(poll);
        ["pointerdown", "mousedown", "pointerup", "mouseup"].forEach(function(eventName) {
          match.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true }));
        });
        if (typeof match.click === "function") match.click();
        setTimeout(function() {
          var owner = el.closest && el.closest(".v-select, .v-autocomplete, .v-combobox") || el;
          var displaySelector = ".value-area,.ng-value-label,.select-type,.mat-mdc-select-min-line,.mat-select-value-text,.v-select__selection-text,.v-select__selection,.v-chip__content,.ui-selectmenu-text";
          var displayed = owner.querySelector && owner.querySelector(displaySelector);
          var input = owner.querySelector && owner.querySelector("input");
          var displayedText = displayed ? String(displayed.textContent || "").replace(/\s+/g, " ").trim() : input && String(input.value || "").trim() || "";
          var selectedText = String(match.textContent || "").replace(/\s+/g, " ").trim();
          var norm = function(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); };
          var actual = norm(displayedText), expected = norm(selectedText);
          var ok = !!actual && (actual === expected || actual.indexOf(expected) !== -1 || expected.indexOf(actual) !== -1);
          resolve({ success: ok, verified: ok, settled: true, reason: ok ? "" : "selection-not-confirmed", waitMs: Date.now() - startTime, matchedText: selectedText, displayedText: displayedText });
        }, 500);
      }, 250);
    });
  },
  meta: { interactionFamily: "ng-dropdown", needsStabilization: true, populatesChildren: false, dependsOn: [], waitFor: "dom-quiet", needsParentValues: false }
};
registerPlugin(NgDropdownPlugin);

/* ==== button-click.ts ==== */
var ButtonClickPlugin = {
  id: "button-click",
  description: "Workflow transition: click taught buttons (navigation, expand, add-row)",
  supports(el, fieldContext) {
    if (!el) return false;
    return fieldContext.type === "button";
  },
  fill(el, value, context) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.click();
    return { success: true, settled: false, transition: true };
  },
  meta: {
    interactionFamily: "button-click",
    needsStabilization: true,
    populatesChildren: false,
    dependsOn: [],
    waitFor: "dom-quiet",
    needsParentValues: false
  }
};
registerPlugin(ButtonClickPlugin);

/* ==== keystroke-input.ts ==== */
;
(function() {
  if (window._ccKeystrokeFillLoaded) return;
  window._ccKeystrokeFillLoaded = true;
  function keyCodeFor(ch) {
    if (/\d/.test(ch)) return ch.charCodeAt(0);
    if (/[a-z]/i.test(ch)) return ch.toUpperCase().charCodeAt(0);
    return ch.charCodeAt(0);
  }
  function codeFor(ch) {
    if (/\d/.test(ch)) return "Digit" + ch;
    if (/[a-z]/i.test(ch)) return "Key" + ch.toUpperCase();
    return "";
  }
  window.keystrokeFillSync = function keystrokeFillSync(el, value) {
    if (!el) return false;
    const str = String(value);
    const isTextarea = el.tagName === "TEXTAREA";
    const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    const setVal = desc ? (v) => desc.set.call(el, v) : (v) => {
      el.value = v;
    };
    try {
      el.focus();
    } catch (e) {
    }
    try {
      el.click();
    } catch (e) {
    }
    if (el.value) {
      try {
        el.select();
      } catch (e) {
      }
      setVal("");
      try {
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
      } catch (e) {
      }
    }
    let current = "";
    for (const ch of str) {
      const kc = keyCodeFor(ch);
      const code = codeFor(ch);
      el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: ch, code, keyCode: kc, which: kc, charCode: 0 }));
      try {
        el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: ch }));
      } catch (e) {
      }
      current += ch;
      setVal(current);
      try {
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ch }));
      } catch (e) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
      el.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, cancelable: true, key: ch, code, keyCode: kc, which: kc, charCode: kc }));
      el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: ch, code, keyCode: kc, which: kc }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab", code: "Tab", keyCode: 9, which: 9 }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: false, key: "Tab", code: "Tab", keyCode: 9, which: 9 }));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    try {
      el.blur();
    } catch (e) {
    }
    const actual = (el.value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const expected = str.toLowerCase().replace(/[^a-z0-9]/g, "");
    return actual === expected || actual.length > 0 && (actual.endsWith(expected.slice(-4)) || actual.startsWith(expected.slice(0, 4)));
  };
})();

/* ==== network-monitor.ts ==== */
;
(function() {
  if (window._ccNetMonInstalled) return;
  window._ccNetMonInstalled = true;
  let active = 0;
  let lastActivity = Date.now();
  let totalRequests = 0;
  function publish() {
    try {
      document.body.dataset.ccAjaxActive = String(active);
      document.body.dataset.ccAjaxLastActivity = String(lastActivity);
      document.body.dataset.ccAjaxTotal = String(totalRequests);
    } catch (e) {
    }
  }
  function inc() {
    active++;
    totalRequests++;
    lastActivity = Date.now();
    publish();
  }
  function dec() {
    active = Math.max(0, active - 1);
    lastActivity = Date.now();
    publish();
  }
  if (typeof window.fetch === "function") {
    const origFetch = window.fetch;
    window.fetch = function(...args) {
      inc();
      const p = origFetch.apply(this, args);
      Promise.resolve(p).finally(dec);
      return p;
    };
  }
  if (typeof window.XMLHttpRequest === "function") {
    const origOpen = window.XMLHttpRequest.prototype.open;
    const origSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.open = function(method, url) {
      this._ccTrack = !(url && /api\.cybercontrol\.fun/.test(String(url)));
      return origOpen.apply(this, arguments);
    };
    window.XMLHttpRequest.prototype.send = function() {
      if (this._ccTrack) {
        inc();
        const cleanup = () => dec();
        this.addEventListener("loadend", cleanup, { once: true });
        this.addEventListener("error", cleanup, { once: true });
        this.addEventListener("abort", cleanup, { once: true });
      }
      return origSend.apply(this, arguments);
    };
  }
  if (typeof window.jQuery !== "undefined") {
    try {
      window.jQuery(document).ajaxSend(() => {
        lastActivity = Date.now();
        publish();
      }).ajaxComplete(() => {
        lastActivity = Date.now();
        publish();
      });
    } catch (e) {
    }
  }
  publish();
})();
