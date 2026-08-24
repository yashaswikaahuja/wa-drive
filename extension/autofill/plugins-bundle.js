/**
 * AUTO-GENERATED
 * Source: @cc/plugins
 * Rebuild: pnpm --filter cybercontrol-extension build
 */

/* ==== interface.js ==== */
/**
 * PluginInterface — contract for interaction plugins.
 *
 * Plugins are bounded interaction adapters. They declare capability and topology.
 * Runtime owns: timing, retries, verification, replay, escalation.
 * Plugins own: HOW to interact with a specific widget family.
 */
var PluginInterface = {
  // Required: unique plugin identifier
  id: '',
  // Required: human-readable description
  description: '',
  // Required: does this plugin handle this element?
  // (el: HTMLElement, fieldContext: {type, label, selector}) => boolean
  supports: null,
  // Required: execute the interaction
  // (el: HTMLElement, value: string, context: {profileKey, parentValues, attempt}) => {success: boolean, settled: boolean, waitMs?: number}
  fill: null,
  // Required: declarative metadata for planner/runtime
  meta: {
    interactionFamily: '',       // e.g. 'cascade', 'ng-dropdown', 'file-upload'
    needsStabilization: false,   // runtime should wait after fill
    populatesChildren: false,    // filling this triggers async option population downstream
    dependsOn: [],               // profileKey[] of fields that must fill before this one
    waitFor: null,               // stabilization signal: 'options-populated' | 'dom-quiet' | null
    needsParentValues: false,    // if true, context.parentValues will be populated
  },
};

// Plugin registry — ordered by specificity (most specific first)
var PLUGIN_REGISTRY = [];

function registerPlugin(plugin) {
  if (!plugin.id || !plugin.supports || !plugin.fill) throw new Error('Invalid plugin: missing id/supports/fill');
  PLUGIN_REGISTRY.push(plugin);
}

function findPlugin(el, fieldContext) {
  for (const plugin of PLUGIN_REGISTRY) {
    try { if (plugin.supports(el, fieldContext)) return plugin; } catch {}
  }
  return null;
}

/* ==== cascade-select.js ==== */
/**
 * cascade-select plugin — handles dependent <select> chains (state→district→block→village).
 * 
 * Interaction contract:
 * 1. Wait for options to populate (parent must have filled first)
 * 2. Find matching option
 * 3. Apply selection with full event sequence (ASP.NET/DWR/jQuery compat)
 * 4. Report settled state
 *
 * Runtime owns: ordering (via dependsOn), retry policy, verification, replay.
 * Plugin owns: option matching, event dispatch, DWR re-apply.
 */

var CASCADE_FIELDS = ['state', 'district', 'sub_division', 'subdivision', 'block', 'panchayat', 'village', 'village_panchayat', 'post_office'];

var CASCADE_DEPENDENCIES = {
  district: ['state'],
  sub_division: ['district'],
  subdivision: ['district'],
  block: ['district', 'sub_division'],
  panchayat: ['block'],
  village: ['block'],
  village_panchayat: ['block'],
  post_office: ['block', 'village'],
};

var CascadeSelectPlugin = {
  id: 'cascade-select',
  description: 'Dependent <select> chains: waits for option population, applies with DWR/jQuery compat',

  supports(el, fieldContext) {
    if (!el || el.tagName !== 'SELECT') return false;
    // Match if field label/profileKey is a known cascade field
    var label = (fieldContext.label || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    var pk = (fieldContext.profileKey || '').toLowerCase();
    // Is this a cascade field?
    var isCascade = CASCADE_FIELDS.some(k => label.includes(k) || pk.includes(k));
    if (!isCascade) return false;
    // Is it a child (has dependencies)? Or a parent that populatesChildren?
    return true;
  },

  fill(el, value, context) {
    function findOpt(options) {
      // shared/option-match.js is injected before plugins run
      return window.ccMatchOption(value, options);
    }

    function applySelect(el, opt) {
      // Delegate to shared/select-apply.js
      return window.ccApplySelect(el, opt);
    }

    // Try immediate match
    var allOpts = Array.from(el.options);
    var opt = findOpt(allOpts);
    if (opt) {
      applySelect(el, opt);
      return { success: true, settled: true, waitMs: 0 };
    }

    // No options yet — need to wait (runtime should have waited, but report not settled)
    var realOpts = allOpts.filter(o => o.value && o.value !== '0' && o.value !== '-1' && o.value !== '');
    if (realOpts.length === 0) {
      return { success: false, settled: false, reason: 'no-options-loaded' };
    }

    // Options exist but no match
    return { success: false, settled: true, reason: 'no-matching-option', optionCount: realOpts.length };
  },

  meta: {
    interactionFamily: 'cascade',
    needsStabilization: true,
    populatesChildren: true,
    waitFor: 'options-populated',
    needsParentValues: true,
    // Dynamic dependsOn resolved per-field from CASCADE_DEPENDENCIES
    getDependsOn(profileKey) {
      var pk = (profileKey || '').toLowerCase();
      return CASCADE_DEPENDENCIES[pk] || [];
    },
  },
};

registerPlugin(CascadeSelectPlugin);

/* ==== ng-dropdown.js ==== */
/**
 * ng-dropdown plugin — handles Angular custom dropdown widgets.
 *
 * Structural auto-detection (no adapter required):
 * 1. Find trigger: .value-area, .ng-value-container, .select-type, or first clickable child
 * 2. Click trigger to open overlay
 * 3. Find options: li elements in nearest overlay/panel
 * 4. Match and click option
 * 5. Verify selection
 */

var TRIGGER_SELECTORS = ['.value-area', '.select-type', '.ng-value-container', '.ng-select-container', '[tabindex]'];
var OPTION_SELECTORS = ['li', '.ng-option', 'mat-option', '.dropdown-item', '.option', '[role="option"]'];
var OVERLAY_SELECTORS = ['app-dropdown', 'ng-dropdown-panel', '.ng-dropdown-panel', '.dropdown-options', '.options-list', '.options', 'ul', 'cdk-overlay-container'];

// Search for option items using multiple selectors (fallback when no adapter)
function findOptionsInContainer(container, optSel, isVisible) {
  if (optSel) {
    return Array.from(container.querySelectorAll(optSel)).filter(isVisible);
  }
  // Try each known option selector until we find visible options
  for (var sel of OPTION_SELECTORS) {
    var items = Array.from(container.querySelectorAll(sel)).filter(isVisible);
    if (items.length > 0) return items;
  }
  return [];
}

var NgDropdownPlugin = {
  id: 'ng-dropdown',
  description: 'Angular custom ng-dropdown: auto-detect trigger/options, click to select',

  supports(el, fieldContext) {
    if (!el) return false;
    if (fieldContext.type === 'ng-dropdown') return true;
    if (fieldContext.type === 'mat-select') return true;  // Custom comboboxes are typed mat-select by extractor
    if (el.classList && (el.classList.contains('ng-dropdown') || el.classList.contains('ng-select'))) return true;
    if (el.tagName === 'NG-SELECT' || (el.closest && el.closest('ng-select'))) return true;
    // Any non-native element with role=combobox/listbox
    const _tag = el.tagName.toLowerCase();
    if (_tag !== 'select' && _tag !== 'input' && (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'listbox')) return true;
    return false;
  },

  fill(el, value, context) {
    var adapter = context.portalAdapters || {};

    function isVisible(node) {
      return window.ccDomUtils.isVisible(node);
    }

    // Find trigger element
    let trigger = null;
    if (adapter.triggerSelector) trigger = el.querySelector(adapter.triggerSelector);
    if (!trigger) {
      for (const sel of TRIGGER_SELECTORS) {
        trigger = el.querySelector(sel);
        if (trigger && isVisible(trigger)) break;
      }
    }
    if (!trigger) trigger = el;

    // Click to open
    trigger.click();

    // Poll for options after DOM stabilizes
    var startTime = Date.now();
    var optSel = adapter.optionSelector || null;

    return new Promise((resolve) => {
      let attempts = 0;
      var poll = setInterval(() => {
        attempts++;
        if (Date.now() - startTime > 5000) {
          clearInterval(poll);
          document.body.click(); // close
          resolve({ success: false, settled: true, reason: 'timeout-no-options' });
          return;
        }

        // Find options - check overlays, then inside element
        let opts = [];
        // Try adapter-specified container first
        if (adapter.optionsContainer) {
          var container = document.querySelector(adapter.optionsContainer);
          if (container) opts = findOptionsInContainer(container, optSel, isVisible);
        }
        // Try sibling/nearby containers first (most likely to be the related panel)
        if (opts.length === 0) {
          // Check data-owner attribute (common pattern: panel has data-owner="elementId")
          var ownedPanel = el.id ? document.querySelector('[data-owner="' + el.id + '"]') : null;
          if (ownedPanel) opts = findOptionsInContainer(ownedPanel, optSel, isVisible);
          // Check next sibling
          if (opts.length === 0 && el.nextElementSibling) {
            opts = findOptionsInContainer(el.nextElementSibling, optSel, isVisible);
          }
          // Check parent's next sibling (widget wrapper pattern)
          if (opts.length === 0 && el.parentElement && el.parentElement.nextElementSibling) {
            opts = findOptionsInContainer(el.parentElement.nextElementSibling, optSel, isVisible);
          }
          // Check inside parent (panel might be a sibling child)
          if (opts.length === 0 && el.parentElement) {
            var siblings = Array.from(el.parentElement.children).filter(function(c) { return c !== el; });
            for (var si = 0; si < siblings.length; si++) {
              opts = findOptionsInContainer(siblings[si], optSel, isVisible);
              if (opts.length > 0) break;
            }
          }
        }
        // Fallback: try overlay selectors globally (with proximity ranking)
        if (opts.length === 0) {
          var elRect = el.getBoundingClientRect();
          var bestOpts = [], bestDist = Infinity;
          for (const oSel of OVERLAY_SELECTORS) {
            var containers = document.querySelectorAll(oSel);
            for (const c of containers) {
              var items = findOptionsInContainer(c, optSel, isVisible);
              if (items.length > 0) {
                var cRect = c.getBoundingClientRect();
                var dist = Math.abs(cRect.left - elRect.left) + Math.abs(cRect.top - elRect.bottom);
                if (dist < bestDist) { bestDist = dist; bestOpts = items; }
              }
            }
          }
          opts = bestOpts;
        }
        // Try inside the element itself
        if (opts.length === 0) {
          opts = findOptionsInContainer(el, optSel, isVisible);
        }

        if (opts.length === 0 && attempts < 15) return; // keep waiting

        // Match option using shared/option-match.js (injected before plugins)
        var match = null;
        var optTexts = opts.map(function(o) { return o.textContent.trim(); });
        var matched = window.ccMatchOption(value, optTexts);
        if (matched) {
          match = opts.find(function(o) { return o.textContent.trim() === matched; });
        }

        if (match) {
          clearInterval(poll);
          ['pointerdown','mousedown','mouseup','click'].forEach(ev =>
            match.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }))
          );
          // Verify after click
          setTimeout(() => {
            var displayed = el.querySelector('.value-area,.ng-value-label,.select-type');
            var ok = displayed && !(/select|choose/i.test(displayed.textContent.trim()));
            resolve({ success: ok !== false, settled: true, waitMs: Date.now() - startTime, matchedText: match.textContent.trim() });
          }, 500);
        } else if (attempts >= 15) {
          clearInterval(poll);
          document.body.click();
          resolve({ success: false, settled: true, reason: 'no-matching-option', optionCount: opts.length });
        }
      }, 300);
    });
  },

  meta: {
    interactionFamily: 'ng-dropdown',
    needsStabilization: true,
    populatesChildren: false,
    dependsOn: [],
    waitFor: 'dom-quiet',
    needsParentValues: false,
  },
};

registerPlugin(NgDropdownPlugin);

/* ==== button-click.js ==== */
/**
 * button-click plugin — workflow transition primitive.
 *
 * Handles taught navigation/expand/add-row buttons.
 * Plugin owns: clicking the button.
 * Runtime owns: stabilization, field graph rebuild, phase progression.
 *
 * Only activates on saved mappings (taught workflows).
 * Schema: EXECUTION_SCHEMA v1.0, action: click_button
 */

var ButtonClickPlugin = {
  id: 'button-click',
  description: 'Workflow transition: click taught buttons (navigation, expand, add-row)',

  supports(el, fieldContext) {
    if (!el) return false;
    // Only claims fields explicitly marked as buttons in the mapping
    return fieldContext.type === 'button';
  },

  fill(el, value, context) {
    // Plugin only clicks. Runtime handles everything after.
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.click();
    return { success: true, settled: false, transition: true };
  },

  meta: {
    interactionFamily: 'button-click',
    needsStabilization: true,
    populatesChildren: false,
    dependsOn: [],
    waitFor: 'dom-quiet',
    needsParentValues: false,
  },
};

registerPlugin(ButtonClickPlugin);

/* ==== keystroke-input.js ==== */
/**
 * keystroke-input plugin — types values char-by-char with full key+input event sequence.
 *
 * Why: some sites (UIDAI Aadhaar entry, banking OTP, captcha, masked inputs)
 * reject values set via `el.value = X` because they listen to `keydown`/
 * `keypress`/`input(inputType=insertText)` events and validate digit-by-digit.
 * The "value+dispatch input/change" approach passes synthetic events that
 * those listeners ignore (or worse: reset the field on next input).
 *
 * What: focuses, clears, then dispatches for each character:
 *   1. keydown            — code/key/keyCode set to char's keycode
 *   2. beforeinput        — inputType='insertText', data=char
 *   3. nativeValueSetter  — append char (works around React/Angular trapped setter)
 *   4. input              — InputEvent with inputType='insertText', data=char
 *   5. keypress
 *   6. keyup
 * Then a final `change` event after the loop completes.
 *
 * Per-char delay is configurable (default 12ms = ~80 chars/sec, near human typing).
 *
 * Use as a FALLBACK after the standard nativeInputValueSetter fill — if the
 * verification check `el.value === expected` fails, retry with this.
 */
;(function() {
  if (window._ccKeystrokeFillLoaded) return;
  window._ccKeystrokeFillLoaded = true;

  function keyCodeFor(ch) {
    if (/\d/.test(ch)) return ch.charCodeAt(0);
    if (/[a-z]/i.test(ch)) return ch.toUpperCase().charCodeAt(0);
    return ch.charCodeAt(0);
  }

  function codeFor(ch) {
    if (/\d/.test(ch)) return 'Digit' + ch;
    if (/[a-z]/i.test(ch)) return 'Key' + ch.toUpperCase();
    return '';
  }

  /**
  /**
   * Synchronous version — no per-char delay. Use this from sync callers
   * (the executor's fillOne is sync). Events are still fired in proper
   * order; validators that listen to keydown/input/keypress/keyup will see
   * them char-by-char even though they all execute within one JS tick.
   * This is the PRIMARY fill path for all text inputs as of v5.67.
   *
   * After typing, dispatches a Tab keydown so site-specific handlers
   * (RTPS Bihar's English→Hindi transliterator, ASP.NET validation,
   * jQuery focusout-bound formatters) run as if the user actually
   * pressed Tab to leave the field.
   */
  window.keystrokeFillSync = function keystrokeFillSync(el, value) {
    if (!el) return false;
    const str = String(value);
    const isTextarea = el.tagName === 'TEXTAREA';
    const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    const setVal = desc ? (v) => desc.set.call(el, v) : (v) => { el.value = v; };

    try { el.focus(); } catch (e) {}
    try { el.click(); } catch (e) {}

    if (el.value) {
      try { el.select(); } catch (e) {}
      setVal('');
      try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' })); } catch (e) {}
    }

    let current = '';
    for (const ch of str) {
      const kc = keyCodeFor(ch);
      const code = codeFor(ch);
      el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ch, code, keyCode: kc, which: kc, charCode: 0 }));
      try { el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ch })); } catch (e) {}
      current += ch;
      setVal(current);
      try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch })); }
      catch (e) { el.dispatchEvent(new Event('input', { bubbles: true })); }
      el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: ch, code, keyCode: kc, which: kc, charCode: kc }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ch, code, keyCode: kc, which: kc }));
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));

    // Dispatch Tab keydown so site-specific keydown handlers run.
    // RTPS Bihar's transliteration listener fires on Tab/keydown — without this,
    // the Hindi sibling field stays empty.
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab', code: 'Tab', keyCode: 9, which: 9 }));
    el.dispatchEvent(new KeyboardEvent('keyup',   { bubbles: true, cancelable: false, key: 'Tab', code: 'Tab', keyCode: 9, which: 9 }));
    // Trigger any focusout/blur handlers (jQuery .blur, ASP validators)
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    try { el.blur(); } catch (e) {}
    // Normalized comparison: the field may transform (uppercase, mask, format).
    // As long as the core alphanumeric content matches, we consider it filled.
    const actual = (el.value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const expected = str.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Accept: exact, partial (starts with or ends with 4+ chars), or actual is non-empty (masked)
    return actual === expected || (actual.length > 0 && (actual.endsWith(expected.slice(-4)) || actual.startsWith(expected.slice(0, 4))));
  };

})();

/* ==== network-monitor.js ==== */
/**
 * network-monitor.js — runs in PAGE world (chrome.scripting world: 'MAIN')
 *
 * Wraps fetch + XMLHttpRequest to track in-flight requests. Publishes counts
 * to document.body.dataset so the autofill executor (in ISOLATED world) can
 * poll them and proceed exactly when the network is actually idle.
 *
 * Avoids hardcoded setTimeout(500/3500/12000ms) magic numbers — the fill
 * advances the moment Angular/jQuery/DWR finishes its AJAX, no sooner.
 */
;(function () {
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
    } catch {}
  }

  function inc() {
    active++; totalRequests++; lastActivity = Date.now(); publish();
  }
  function dec() {
    active = Math.max(0, active - 1); lastActivity = Date.now(); publish();
  }

  // ── fetch wrap ───────────────────────────────────────────────────────────
  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch;
    window.fetch = function (...args) {
      inc();
      const p = origFetch.apply(this, args);
      // Don't await here — settle on resolve/reject to keep counter accurate
      Promise.resolve(p).finally(dec);
      return p;
    };
  }

  // ── XMLHttpRequest wrap ──────────────────────────────────────────────────
  if (typeof window.XMLHttpRequest === 'function') {
    const origOpen = window.XMLHttpRequest.prototype.open;
    const origSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.open = function (method, url) {
      // Don't count cross-origin to extension's own backend (api.cybercontrol.fun)
      // — those aren't part of the form's AJAX
      this._ccTrack = !(url && /api\.cybercontrol\.fun/.test(String(url)));
      return origOpen.apply(this, arguments);
    };
    window.XMLHttpRequest.prototype.send = function () {
      if (this._ccTrack) {
        inc();
        const cleanup = () => dec();
        this.addEventListener('loadend', cleanup, { once: true });
        // safety: error/abort also fire loadend, but in case browser misses it
        this.addEventListener('error',  cleanup, { once: true });
        this.addEventListener('abort',  cleanup, { once: true });
      }
      return origSend.apply(this, arguments);
    };
  }

  // ── jQuery .ajax (ServicePlus / RTPS / many gov.in sites) ────────────────
  // jQuery's $.ajax internally uses XHR which is already wrapped, but it also
  // emits ajaxStart/ajaxStop on the document — useful as a fallback signal.
  if (typeof window.jQuery !== 'undefined') {
    try {
      window.jQuery(document)
        .ajaxSend(() => { lastActivity = Date.now(); publish(); })
        .ajaxComplete(() => { lastActivity = Date.now(); publish(); });
    } catch {}
  }

  publish();
  // Heartbeat: even if no requests fire, keep lastActivity timestamp current
  // for waitForNetworkIdle's "no recent activity" condition to be meaningful.
})();
