async function fillFormFieldsSequential(mapping, filledBySource, portalAdapters, allFields) {
  portalAdapters = portalAdapters || {};
  console.log('[CC] fillFormFieldsSequential started v' + ((typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : 'inj') + ', fields:', Object.keys(mapping).length);
  const _replayResults = {}; // label -> 'ok'|'no-option'|'no-adapter'|'verify-fail'
  const _ccRecords = []; // ReplayRecord[] — structured observability
  function _flushRecords() { try { document.body.setAttribute('data-cc-records', JSON.stringify(_ccRecords)); } catch {} }

  // ── Runtime version constants ─────────────────────────────────────────────
  const RUNTIME_VERSION = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : 'inj';
  const STRATEGY_VERSION = '1.0';
  const WAIT_ENGINE_VERSION = '1.0';

  // Plugin dispatch (Phase 1: cascade-select)
  const _CC_USE_PLUGINS = true;
  const _CC_LEGACY_COMPARE = true;


  // ── Strategy Registry — named strategies with VerificationContracts ────────
  // Phase 2: strategies coexist with existing if/else logic (migration-safe)
  // Each strategy: { name, applies(el, type), verify(el, value), description }
  const STRATEGY_REGISTRY = {
    'ng-dropdown-click': {
      name: 'ng-dropdown-click',
      description: 'Angular custom ng-dropdown: click trigger, wait for li options, click match',
      applies: (el, type) => type === 'ng-dropdown' || (el && el.classList?.contains('ng-dropdown')),
      verify: {
        method: 'visual_text',
        check: (el, expected) => {
          const displayed = el.querySelector('.select-type,.value-area,.ng-value-label');
          return displayed ? displayed.textContent.trim().toLowerCase().includes(expected.toLowerCase().slice(0,6)) : false;
        },
        timeout: 1000,
      },
    },
    'mat-select-click': {
      name: 'mat-select-click',
      description: 'Angular Material mat-select: click trigger, wait for panel, click option',
      applies: (el, type) => type === 'mat-select' || el?.tagName === 'MAT-SELECT',
      verify: {
        method: 'visual_text',
        check: (el, expected) => {
          const v = el.querySelector('.mat-select-value-text,.mat-mdc-select-value-text');
          return v ? v.textContent.trim().toLowerCase().includes(expected.toLowerCase().slice(0,4)) : false;
        },
        timeout: 500,
      },
    },
    'native-select': {
      name: 'native-select',
      description: 'Native <select>: set value via nativeSetter, dispatch change',
      applies: (el, type) => type === 'select' || el?.tagName === 'SELECT',
      verify: {
        method: 'dom_value',
        check: (el, expected) => {
          const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
          return norm(el.value) === norm(expected) ||
                 norm(el.options[el.selectedIndex]?.text||'').includes(norm(expected).slice(0,6));
        },
        timeout: 300,
      },
    },
    'dwr-cascade-select': {
      name: 'dwr-cascade-select',
      description: 'ServicePlus DWR cascade: waitForOptions then set value, re-apply after DWR reset',
      applies: (el, type) => type === 'select' && el?.getAttribute('data-datatype') === 'custLGDHierarchy',
      verify: {
        method: 'dom_value',
        check: (el, expected) => {
          const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
          return norm(el.options[el.selectedIndex]?.text||'').includes(norm(expected).slice(0,4));
        },
        timeout: 500,
      },
    },
    'text-input': {
      name: 'text-input',
      description: 'Text/email/tel input: nativeInputValueSetter + input/change events',
      applies: (el, type) => !['select','ng-dropdown','mat-select','mat-radio','mat-checkbox','radio','checkbox'].includes(type),
      verify: {
        method: 'dom_value',
        check: (el, expected) => el.value === expected || el.value.includes(expected.slice(0,8)),
        timeout: 200,
      },
    },
  };

  // Detect which strategy applies to a field (for ReplayRecord tagging)
  function detectStrategy(el, type) {
    for (const [key, s] of Object.entries(STRATEGY_REGISTRY)) {
      try { if (s.applies(el, type)) return key; } catch {}
    }
    return type || 'unknown';
  }

  // Verify a field's actual current value matches what we tried to fill.
  // Tolerates masked-input reformatting (e.g. '9155049176188766' becomes
  // '9155 0491 7618 8766' on UIDAI). Compares the alphanumeric core of both.
  // Returns { ok, actualValue, normExpected, normActual }
  async function verifyValue(selector, expected, settleMs) {
    settleMs = (typeof settleMs === 'number') ? settleMs : 150;
    // Wait for framework to react (validators, formatters, ControlValueAccessor)
    if (settleMs > 0) await new Promise(r => setTimeout(r, settleMs));
    // Resolve element — index-based selectors use the same getEl() helper
    let liveEl;
    if (selector && selector.startsWith && selector.startsWith('form-field-')) {
      liveEl = getEl(selector);
    } else if (selector && selector.startsWith && selector.startsWith('ng-dropdown-')) {
      liveEl = null; // ng-dropdown verify handled by plugin's own verify
    } else {
      liveEl = document.querySelector(selector);
    }
    if (!liveEl) return { ok: false, actualValue: '', normExpected: '', normActual: '', reason: 'no-element-on-verify' };
    const tag = (liveEl.tagName || '').toLowerCase();
    // Checkbox: verify by .checked state, not .value
    if (liveEl.type === 'checkbox' || liveEl.type === 'radio') {
      const want = /^(true|yes|1|on|checked)$/i.test(String(expected));
      return { ok: liveEl.checked === want, actualValue: String(liveEl.checked), normExpected: String(want), normActual: String(liveEl.checked) };
    }
    if (tag === 'select') {
      // For selects: compare selected option's text or value
      const opt = liveEl.options[liveEl.selectedIndex];
      const actualVal = (opt ? (opt.text || opt.value) : '') || '';
      const normExp = String(expected || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normAct = actualVal.toLowerCase().replace(/[^a-z0-9]/g, '');
      return { ok: normExp.length > 0 && (normAct === normExp || normAct.includes(normExp) || normExp.includes(normAct)), actualValue: actualVal, normExpected: normExp, normActual: normAct };
    }
    const actual = liveEl.value || '';
    const expStr = String(expected || '');
    if (!expStr) return { ok: false, actualValue: actual, normExpected: '', normActual: actual, reason: 'empty-expected' };
    // Normalise: lowercase + strip non-alphanumeric (handles masked formatting and case)
    const normExp = expStr.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normAct = actual.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normExp === normAct) return { ok: true, actualValue: actual, normExpected: normExp, normActual: normAct };
    if (normAct.length > 0 && (normAct.startsWith(normExp.slice(0, Math.max(8, normExp.length - 2))) || normExp.startsWith(normAct.slice(0, 8)))) {
      return { ok: true, actualValue: actual, normExpected: normExp, normActual: normAct, partial: true };
    }
    // Masked-input pattern (UIDAI, banks): actual shows '********6597' but real value is full 12 digits.
    if (actual.length >= 8 && actual.length === expStr.length) {
      const tail = expStr.slice(-4).toLowerCase();
      if (actual.toLowerCase().endsWith(tail)) {
        return { ok: true, actualValue: actual, normExpected: normExp, normActual: normAct, masked: true };
      }
    }
    return { ok: false, actualValue: actual, normExpected: normExp, normActual: normAct, reason: actual === '' ? 'value-rejected-empty' : 'value-mismatch' };
  }

  // ── WaitEngine — state-based waits replacing fixed setTimeout delays ──────
  function waitForOptions(selector, minCount, timeout) {
    minCount = minCount || 1; timeout = timeout || 8000;
    return new Promise(function(resolve) {
      var deadline = Date.now() + timeout;
      var resolved = false;
      var poll, mo;
      function cleanup(val) {
        if (resolved) return;
        resolved = true;
        if (poll) clearInterval(poll);
        if (mo) mo.disconnect();
        resolve(val);
      }
      function check() {
        if (resolved) return;
        var el = document.querySelector(selector);
        var real = Array.from(el ? el.options || [] : []).filter(function(o) {
          return o.value && o.value !== '0' && o.value !== '' && o.value !== '-1';
        });
        if (real.length >= minCount) { cleanup(el); return; }
        if (Date.now() > deadline) { cleanup(null); return; }
      }
      mo = new MutationObserver(check);
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class'] });
      check();
      poll = setInterval(function() {
        if (Date.now() > deadline) cleanup(null);
        else check();
      }, 200);
    });
  }

  function waitForDOMQuiet(ms) {
    ms = ms || 300;
    return new Promise(function(resolve) {
      var last = Date.now();
      var mo = new MutationObserver(function() { last = Date.now(); });
      mo.observe(document.body, { childList: true, subtree: true });
      var check = setInterval(function() {
        if (Date.now() - last >= ms) { clearInterval(check); mo.disconnect(); resolve(); }
      }, 50);
      setTimeout(function() { clearInterval(check); mo.disconnect(); resolve(); }, 5000);
    });
  }

  /**
   * Resolve when the page network has been idle for `quietMs` consecutive
   * milliseconds. Delegates to shared/network-idle.js.
   */
  function waitForNetworkIdle(quietMs, maxMs) {
    return window.ccWaitForNetworkIdle(quietMs || 200, maxMs || 8000);
  }

  // Sort by DOM order (sequential top-to-bottom filling)
  const PRIORITY_KEYS = [
    'state', 'rajya', 'राज्य',
    'district', 'jila', 'जिला',
    'sub_division', 'subdivision', 'sub-division', 'अनुमंडल',
    'block', 'prakhand', 'प्रखंड',
    'panchayat', 'village_panchayat', 'पंचायत',
    'village', 'gram', 'ग्राम', 'mohalla', 'मोहल्ला',
    'tehsil', 'taluka', 'तहसील',
    'police_station', 'police-station', 'thana', 'थाना',
    'post_office', 'post-office', 'डाक घर',
    'pin_code', 'pincode', 'पिन',
    'municipal', 'नगर',
  ];
  const entries = Object.entries(mapping);
  // Sort by actual DOM position (compareDocumentPosition)
  function getEl(sel) {
    if (sel.startsWith('form-field-')) {
      const all = document.querySelectorAll('input[type=text],input[type=email],input[type=tel],input[type=number],input[type=date],input[type=radio],input[type=checkbox],input:not([type]),textarea,select');
      return all[parseInt(sel.split('-')[2])];
    }
    if (sel.startsWith('ng-dropdown-')) return document.querySelectorAll('div.ng-dropdown')[parseInt(sel.split('-')[2])];
    return document.querySelector(sel);
  }
  entries.sort(([sa], [sb]) => {
    const a = getEl(sa), b = getEl(sb);
    if (!a || !b) return 0;
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  let filled = 0;
  let delay = 0;

  function fillOne(selector, value, type) {
    let el; // declared outside try so catch block can access it
    try {
      if (selector.startsWith('form-field-')) {
        const all = document.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select');
        el = all[parseInt(selector.split('-')[2])];
      } else if (selector.startsWith('ng-dropdown-')) {
        el = document.querySelectorAll('div.ng-dropdown')[parseInt(selector.split('-')[2])];
      } else {
        el = document.querySelector(selector);
      }
      if (!el) return 0;
      // Detect type from DOM directly (more reliable than passed type)
      const tagName = el.tagName.toLowerCase();
      const elType = tagName === 'select' ? 'select'
        : tagName === 'ng-select' ? 'ng-dropdown'
        : tagName === 'mat-select' ? 'mat-select'
        : tagName === 'mat-checkbox' ? 'mat-checkbox'
        : tagName === 'mat-radio-button' ? 'mat-radio'
        : (el.classList && (el.classList.contains('ng-dropdown') || el.classList.contains('ng-select'))) ? 'ng-dropdown'
        : (tagName !== 'input' && (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'listbox')) ? 'ng-dropdown'
        : el.type || 'text';

      // Portal adapter replay for ng-dropdown and similar custom components
      if (elType === 'ng-dropdown' || type === 'ng-dropdown') {
        const rootClass = el.className ? el.className.trim().split(/\s+/)[0] : 'ng-dropdown';
        const adapter = portalAdapters[rootClass] || portalAdapters['ng-dropdown'];
        if (adapter) {
          const _label = filledBySource[selector]?.label || selector;
          const trigger = el.querySelector(adapter.triggerSelector) || el;

          // ── Session lifecycle ────────────────────────────────────────
          if (!window._ccReplaySessions) window._ccReplaySessions = new Map();
          // Cancel any existing session for this field
          if (window._ccReplaySessions.has(_label)) {
            const old = window._ccReplaySessions.get(_label);
            old.cancelled = true;
            clearInterval(old.pollTimer);
            old.timeoutIds.forEach(id => clearTimeout(id));
            if (old.observer) old.observer.disconnect();
            window._ccReplaySessions.delete(_label);
            console.log('[CC][session-cancel] id='+old.id+' label='+_label);
          }
          const session = {
            id: Math.random().toString(36).slice(2,8),
            fieldKey: _label,
            resolved: false,
            cancelled: false,
            pollTimer: null,
            timeoutIds: [],
            observer: null,
            startedAt: Date.now(),
          };
          window._ccReplaySessions.set(_label, session);
          console.log('[CC][session-start] id='+session.id+' label='+_label);

          function isVisible(node) {
            return window.ccDomUtils.isVisible(node);
          }

          function cleanupSession(result) {
            if (session.resolved && result !== session._result) return; // already resolved, don't overwrite
            session.resolved = true;
            session._result = result;
            clearInterval(session.pollTimer);
            session.timeoutIds.forEach(id => clearTimeout(id));
            if (session.observer) { session.observer.disconnect(); session.observer = null; }
            window._ccReplaySessions.delete(_label);
            _replayResults[_label] = result;
            sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults));
            // Record ng-dropdown fill in replay records
            const _isOk = result === 'ok';
            _ccRecords.push({ selector, value, type: 'ng-dropdown', result: _isOk ? 'filled' : 'skipped', failReason: _isOk ? null : result, strategy: 'ng-dropdown-click', durationMs: Date.now()-session.startedAt, ts: Date.now(), rv: RUNTIME_VERSION });
            _flushRecords();
            console.log('[CC][session-cleanup] id='+session.id+' label='+_label+' result='+result+' duration='+(Date.now()-session.startedAt)+'ms');
          }

          const OVERLAY_TAGS = ['app-dropdown','ul','ng-dropdown-panel','cdk-overlay-container',
                                '.dropdown-options','.options-list','.dropdown-menu','.ng-dropdown-panel'];
          const addedNodes = [];
          const _trace = { triggerLabel: _label, overlayFound: false, overlayTag: '', mutationCount: 0, optionCount: 0, matchedOption: '', clicked: false, verifyStatus: '', durationMs: 0 };

          trigger.click();

          // MutationObserver starts AFTER click — only captures mutations from THIS click
          const mo = new MutationObserver(mutations => {
            if (session.cancelled || session.resolved) return;
            for (const m of mutations) {
              m.addedNodes.forEach(n => { if (n.nodeType === 1) addedNodes.push(n); });
            }
          });
          session.observer = mo;
          mo.observe(document.body, { childList: true, subtree: true });

          // Wait for DOM to stabilize (~150ms quiet), max 1200ms
          let _lastMutation = Date.now();
          const _stabilizeMo = new MutationObserver(() => { _lastMutation = Date.now(); });
          _stabilizeMo.observe(document.body, { childList: true, subtree: true, attributes: true });

          function waitStable(cb) {
            const check = setInterval(() => {
              if (session.cancelled) { clearInterval(check); _stabilizeMo.disconnect(); return; }
              if (Date.now() - _lastMutation >= 150) { clearInterval(check); _stabilizeMo.disconnect(); cb(); }
            }, 50);
            const capId = setTimeout(() => { clearInterval(check); _stabilizeMo.disconnect(); if (!session.cancelled) cb(); }, 1200);
            session.timeoutIds.push(capId);
          }

          waitStable(() => {
            if (session.cancelled || session.resolved) return;
            mo.disconnect();
            session.observer = null;
            _trace.mutationCount = addedNodes.length;

            let activeOverlayRoot = null;
            const trigRect = trigger.getBoundingClientRect();

            // Priority 1: newly added node with visible options
            for (const node of addedNodes) {
              if (!isVisible(node)) continue;
              const _optQ = adapter.optionSelector || 'li,.ng-option,mat-option,.dropdown-item';
              const lis = Array.from(node.querySelectorAll(_optQ)).filter(o => isVisible(o));
              if (lis.length > 0) { activeOverlayRoot = node; break; }
            }
            // Priority 2: existing overlay nearest trigger with visible options
            if (!activeOverlayRoot) {
              let bestDist = Infinity;
              OVERLAY_TAGS.forEach(sel => {
                try {
                  document.querySelectorAll(sel).forEach(node => {
                    const lis = Array.from(node.querySelectorAll(_optQ)).filter(o => isVisible(o));
                    if (lis.length === 0) return;
                    const r = node.getBoundingClientRect();
                    const dist = Math.abs(r.left - trigRect.left) + Math.abs(r.top - trigRect.bottom);
                    if (dist < bestDist) { bestDist = dist; activeOverlayRoot = node; }
                  });
                } catch {}
              });
            }
            // Priority 3: adapter fallback
            if (!activeOverlayRoot && adapter.optionsContainer) {
              activeOverlayRoot = document.querySelector(adapter.optionsContainer) || null;
            }
            // Priority 4: options already in DOM inside the root component
            if (!activeOverlayRoot) {
              const rootLis = Array.from(root.querySelectorAll(_optQ)).filter(o => isVisible(o));
              if (rootLis.length > 0) activeOverlayRoot = root;
            }

            _trace.overlayFound = !!activeOverlayRoot;
            _trace.overlayTag = activeOverlayRoot ? activeOverlayRoot.tagName + '.' + activeOverlayRoot.className.slice(0,40) : 'NONE';
            console.log('[CC][overlay] id='+session.id+' label='+_label+' root='+_trace.overlayTag+' mutations='+addedNodes.length);

            // ── Poll for matching option ─────────────────────────────
            let attempts = 0;
            session.pollTimer = setInterval(() => {
              if (session.cancelled || session.resolved) { clearInterval(session.pollTimer); return; }
              attempts++;
              // Search in overlay root, then root component, then document
              const searchRoot = activeOverlayRoot || root;
              let opts = Array.from(searchRoot.querySelectorAll(_optQ)).filter(o => isVisible(o));
              // Fallback: if root has no visible options, try document
              if (opts.length === 0 && searchRoot !== document) {
                opts = Array.from(document.querySelectorAll(_optQ)).filter(o => isVisible(o) && root.contains(o) === false && o.closest('[class*="dropdown"],[class*="options"],[class*="list"]'));
              }
              const v = value.toLowerCase().trim();
              _trace.optionCount = opts.length;
              console.log('[CC][poll] id='+session.id+' attempt='+attempts+' opts='+opts.length+' v='+v);
              if (opts.length > 0 && attempts === 1) console.log('[CC][poll] sample:', opts.slice(0,3).map(o=>o.textContent.trim()));

              // ── Matching cascade: exact → contains → reverse-contains → token overlap → synonym
              function _matchScore(optText) {
                const ot = optText.toLowerCase().trim();
                if (ot === v) return 100;
                if (ot.includes(v)) return 80;
                if (v.includes(ot) && ot.length > 3) return 70;
                // Token overlap: split both into words, count matching tokens
                const vToks = v.split(/[\s()+,/\-]+/).filter(t=>t.length>2);
                const oToks = ot.split(/[\s()+,/\-]+/).filter(t=>t.length>2);
                const overlap = vToks.filter(t => oToks.some(o => o.includes(t) || t.includes(o))).length;
                if (overlap >= 2) return 60;
                if (overlap === 1 && (vToks.length <= 2 || oToks.length <= 2)) return 50;
                // Common education synonyms
                const eduSynonyms = [
                  ['intermediate','higher secondary','10+2','12th','hsc','senior secondary'],
                  ['matriculation','10th','sslc','secondary','high school','class 10','class x'],
                  ['graduation','graduate','degree','bachelor','ug'],
                  ['post graduation','post graduate','masters','pg','m.a','m.sc','m.com'],
                ];
                for (const group of eduSynonyms) {
                  const vIn = group.some(s => v.includes(s));
                  const oIn = group.some(s => ot.includes(s));
                  if (vIn && oIn) return 55;
                }
                return 0;
              }
              let bestOpt = null, bestScore = 0;
              for (const o of opts) {
                const score = _matchScore(o.textContent.trim());
                if (score > bestScore) { bestScore = score; bestOpt = o; }
              }
              const opt = bestScore >= 50 ? bestOpt : null;

              if (opt) {
                clearInterval(session.pollTimer);
                if (session.cancelled || session.resolved) return;
                _trace.matchedOption = opt.textContent.trim();
                _trace.clicked = true;
                console.log('[CC][poll] matched: '+_trace.matchedOption+' id='+session.id);
                ['pointerdown','mousedown','mouseup','click'].forEach(ev =>
                  opt.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }))
                );
                // Multi-stage verify
                const verifyStart = Date.now();
                const triggerInitialText = trigger.textContent.trim();
                const verifyPoll = setInterval(() => {
                  if (session.cancelled || session.resolved) { clearInterval(verifyPoll); return; }
                  const verifyEl = adapter.verifySelector ? el.querySelector(adapter.verifySelector) : null;
                  const displayed = verifyEl ? verifyEl.textContent.trim() : '';
                  const overlayGone = activeOverlayRoot ? !isVisible(activeOverlayRoot) : false;
                  const triggerChanged = trigger.textContent.trim() !== triggerInitialText;
                  const ariaSelected = opt.getAttribute('aria-selected') === 'true';
                  const ok = (displayed && !/^(select|choose|--)$/i.test(displayed)) || overlayGone || triggerChanged || ariaSelected;
                  if (ok || Date.now() - verifyStart >= 3000) {
                    clearInterval(verifyPoll);
                    if (session.resolved) return;
                    _trace.verifyStatus = ok ? 'ok' : 'verify-fail';
                    _trace.durationMs = Date.now() - session.startedAt;
                    console.log('[CC][session-resolve] id='+session.id+' label='+_label+' result='+_trace.verifyStatus+' duration='+_trace.durationMs+'ms');
                    cleanupSession(_trace.verifyStatus);
                  }
                }, 200);
                session.timeoutIds.push(setInterval(() => {}, 0)); // placeholder — verifyPoll managed separately

              } else if (attempts >= 10) {
                clearInterval(session.pollTimer);
                if (session.resolved) return;
                document.body.click();
                _trace.durationMs = Date.now() - session.startedAt;
                console.log('[CC][session-resolve] id='+session.id+' label='+_label+' result=no-option');
                cleanupSession('no-option');
              }
            }, 300);
          });

          return 1;
        }
        // No adapter yet
        const _noAdapterLabel = filledBySource[selector]?.label || selector;
        _replayResults[_noAdapterLabel] = 'no-adapter';
        sessionStorage.setItem('_cc_replay_results', JSON.stringify(_replayResults));
        return 0;
      }

      // Angular Material mat-select      // Angular Material mat-select: click trigger, wait for panel, click matching option
      if (elType === 'mat-select') {
        const trigger = el.querySelector('.mat-select-trigger,.mat-mdc-select-trigger') || el;
        trigger.click();
        setTimeout(() => {
          const v = value.toLowerCase().trim();
          const opts = Array.from(document.querySelectorAll('mat-option,.mat-option,.mat-mdc-option'));
          const opt = opts.find(o => o.textContent.trim().toLowerCase() === v) ||
                      opts.find(o => o.textContent.trim().toLowerCase().startsWith(v)) ||
                      opts.find(o => v.startsWith(o.textContent.trim().toLowerCase()) && o.textContent.trim().length > 2) ||
                      opts.find(o => o.textContent.trim().toLowerCase().includes(v));
          if (opt) opt.click(); else document.body.click();
        }, 400);
        return 1; // fire-and-forget, count as filled
      }

      // Angular Material mat-checkbox
      if (elType === 'mat-checkbox') {
        const shouldCheck = /yes|true|1|on|checked/i.test(value);
        const input = el.querySelector('input[type="checkbox"]');
        const isChecked = input ? input.checked : el.classList.contains('mat-checkbox-checked');
        if (shouldCheck !== isChecked) { (input || el).click(); }
        return 1;
      }

      // Angular Material mat-radio-button
      if (elType === 'mat-radio') {
        const v = value.toLowerCase().trim();
        const label = el.textContent.trim().toLowerCase();
        if (label === v || label.includes(v) || v.includes(label)) {
          const input = el.querySelector('input[type="radio"]') || el;
          input.click();
          return 1;
        }
        return 0;
      }

      console.log('[CC] fillOne:', selector, 'elType:', elType, 'value:', value);
      // radio-click: directly click this specific radio option (matched by label in fuzzyMatch)
      if (type === 'radio-click') {
        el.focus();
        el.checked = true;
        ['click','change'].forEach(ev => el.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true })));
        return 1;
      }
      if (elType === 'select') {
        const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const v = norm(value);
        const vWords = v.split(' ').filter(w => w.length > 1);
        const extraValues = [];
        if (mapping[selector]?.monthNum) { extraValues.push(mapping[selector].monthNum.toString()); if (mapping[selector].monthShort) extraValues.push(mapping[selector].monthShort.toLowerCase()); }

        function findOpt(options) {
          // shared/option-match.js is injected before executor.js runs
          return window.ccMatchOption(value, options, { extraValues: extraValues });
        }

        function applySelect(el, opt) {
          el.focus();
          el.dispatchEvent(new Event('focus', { bubbles: true }));

          // Step 1: Mark the option directly (most reliable for ASP.NET/NIC)
          Array.from(el.options).forEach(o => { o.selected = false; });
          opt.selected = true;
          el.selectedIndex = opt.index;

          // Step 2: Sync el.value via native setter
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
          if (nativeSetter) nativeSetter.set.call(el, opt.value);
          else el.value = opt.value;

          // Step 3: Fire full event sequence
          ['mousedown','mouseup','click','input','change'].forEach(ev =>
            el.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true }))
          );
          // Trigger ASP.NET onchange handler directly if present
          if (typeof el.onchange === 'function') { try { el.onchange.call(el, new Event('change')); } catch(e) { console.debug('[CC] onchange handler error:', e.message); } }
          // jQuery change trigger — needed for ServicePlus/DWR cascading selects
          if (typeof $ !== 'undefined') { try { $(el).trigger('change'); } catch(e) {} }
          // propertychange for old ASP.NET/IE compat (optional)
          try { el.dispatchEvent(new Event('propertychange', { bubbles: true })); } catch {}
          el.dispatchEvent(new Event('blur', { bubbles: true }));

          // Step 4: Verify persistence after events (framework may reset)
          setTimeout(() => {
            if (el.value !== opt.value || el.selectedIndex !== opt.index) {
              console.debug('[CC] select reset by framework, re-applying:', selector, opt.value);
              opt.selected = true;
              el.selectedIndex = opt.index;
              if (nativeSetter) nativeSetter.set.call(el, opt.value);
              else el.value = opt.value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            console.debug('[CC] select verify:', selector, 'value:', el.value, 'selectedIndex:', el.selectedIndex, 'expected:', opt.value, opt.index);
          }, 300);

          // Step 5: One more delayed change (no duplicate guard needed — only fires once)
          setTimeout(() => el.dispatchEvent(new Event('change', { bubbles: true })), 700);

          // Step 6: Re-apply after DWR cascade may reset the value (ServicePlus pattern)
          const _reapplyVal = opt.value; const _reapplyIdx = opt.index;
          setTimeout(() => {
            if (el.value !== _reapplyVal) {
              el.selectedIndex = _reapplyIdx; el.value = _reapplyVal;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              console.debug('[CC] re-applied after DWR reset:', selector, _reapplyVal);
            }
          }, 3500);

          console.debug('[CC] select applied:', selector, '->', opt.text.trim(), '(value:', opt.value, 'index:', opt.index, ')');
          return 1;
        }

        const allOptions = Array.from(el.options);
        const opt = findOpt(allOptions);
        console.debug('[CC] select attempt:', selector, 'value:', value, 'total opts:', allOptions.length, 'matched:', opt ? opt.text.trim() : 'NONE', 'sample:', allOptions.slice(0,3).map(o=>o.value+'='+o.text.trim()));
        if (opt) return applySelect(el, opt);

        // Options not ready yet (dependent dropdown) — schedule retry
        // The sequential loop already handles cascade timing via waitForNetworkIdle + waitForOptions.
        // This retry is a fallback for when fillOne is called directly (not through the cascade path).
        let attempts = 0;
        const interval = setInterval(() => {
          const allOpts = Array.from(el.options);
          const realOpts = allOpts.filter(o => {
            if (!o.value || o.value === '0' || o.value === '-1' || o.value === '') return false;
            const txt = o.text.toLowerCase();
            return !txt.includes('select') && !txt.includes('choose') && !txt.includes('loading') && txt !== '--';
          });
          if (realOpts.length === 0 && attempts < 10) { attempts++; return; }
          const opt2 = findOpt(allOpts);
          if (opt2) { clearInterval(interval); applySelect(el, opt2); return; }
          if (++attempts >= 15) {
            clearInterval(interval);
            // AI fallback — ask LLM to pick the best option
            const groqKey = window._cc_groq_key || (document.body.getAttribute('data-cc-llm-key') || '');
            if (groqKey && realOpts.length > 0) {
              const optTexts = realOpts.map(o => o.text.trim()).join('\n');
              window.ccLLM.call({
                apiKey: groqKey,
                baseUrl: document.body.getAttribute('data-cc-llm-url') || undefined,
                model: document.body.getAttribute('data-cc-llm-model') || undefined,
                userPrompt: 'From these dropdown options, which best matches "' + value + '"? Reply with ONLY the exact option text, nothing else.\n\nOptions:\n' + optTexts,
                maxTokens: 50,
              }).then(result => {
                const aiText = (result.text || '').trim();
                if (aiText) {
                  const aiOpt = realOpts.find(o => o.text.trim() === aiText) || realOpts.find(o => o.text.trim().toLowerCase().includes(aiText.toLowerCase()));
                  if (aiOpt) { console.debug('[CC] AI matched:', aiText, '->', aiOpt.text); applySelect(el, aiOpt); }
                }
              }).catch(() => {});
            }
            console.debug('[CC] select no match after wait:', selector, 'value:', value, 'opts:', realOpts.slice(0,5).map(o=>o.text.trim()));
          }
        }, 200);
        return 1; // counted as filled; actual value applied async

      } else if (elType === 'radio') {
        const normR = s => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        const vR = normR(value);
        const radios = document.querySelectorAll('input[type="radio"][name="' + el.name + '"]');
        const match = Array.from(radios).find(r => {
          if (normR(r.value) === vR) return true;
          const lbl = r.id ? document.querySelector('label[for="' + r.id + '"]') : null;
          const lblText = lbl ? normR(lbl.textContent) : '';
          return lblText === vR || lblText.startsWith(vR) || vR.startsWith(lblText);
        });
        if (match) {
          match.focus();
          match.checked = true;
          ['click','change'].forEach(ev => match.dispatchEvent(new Event(ev, { bubbles: true, cancelable: true })));
          match.dispatchEvent(new Event('blur', { bubbles: true }));
          return 1;
        }
      } else if (elType === 'checkbox') {
        // Only fill checkboxes with boolean-like values — never with names/numbers/IDs
        const booleanLike = ['yes','true','1','checked','on','no','false','0','off','unchecked'];
        if (!booleanLike.includes(value.toLowerCase())) { console.debug('[CC] skipped checkbox with non-boolean value:', value); return 0; }
        const truthy = ['yes','true','1','checked','on'].includes(value.toLowerCase());
        if (truthy !== el.checked) { el.checked = truthy; el.dispatchEvent(new Event('change', { bubbles: true })); return 1; }
      } else if (el.type === 'file') {
        // ── File input handling (sync path) ──────────────────────────────────
        // URL-based file fetch is handled in the async sequential loop.
        // This path handles: base64 data URIs, empty values, filename hints.
        if (!value) {
          el.click();
          console.debug('[CC] file: no value, clicked to open dialog:', selector);
          return 1;
        }
        if (value.startsWith('data:')) {
          // Base64 data URI
          try {
            const [meta, b64] = value.split(',');
            const mime = meta.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
            const ext = mime.split('/')[1] || 'bin';
            const fileName = (filledBySource[selector]?.label || 'file').replace(/[^a-z0-9]/gi, '_') + '.' + ext;
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const file = new File([bytes], fileName, { type: mime, lastModified: Date.now() });
            const dt = new DataTransfer();
            dt.items.add(file);
            el.files = dt.files;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            console.debug('[CC] file assigned (base64):', selector, fileName, file.size, 'bytes');
            return 1;
          } catch (e) {
            el.click();
            console.debug('[CC] file base64 error:', e.message, '— opened dialog');
            return 1;
          }
        }
        if (value.startsWith('http://') || value.startsWith('https://')) {
          // URL fetch handled in sequential loop — should not reach here
          console.debug('[CC] file URL should be handled in sequential loop:', selector);
          return 0; // Signal to sequential loop to handle async
        }
        // Filename hint — click to open dialog
        el.click();
        console.debug('[CC] file: filename hint, clicked dialog:', selector, value);
        return 1;
      } else if (el._flatpickr || el.classList.contains('flatpickr-input')) {
        // ── flatpickr datepicker ─────────────────────────────────────────────
        // flatpickr attaches _flatpickr instance to the input. Use its API.
        const fp = el._flatpickr;
        // Parse the date value: convert DD/MM/YYYY or DD-MM-YYYY to Date object
        let dateObj = null;
        const ddmmyyyy = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
        if (ddmmyyyy) { dateObj = new Date(+ddmmyyyy[3], +ddmmyyyy[2]-1, +ddmmyyyy[1]); }
        const yyyymmdd = value.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
        if (!dateObj && yyyymmdd) { dateObj = new Date(+yyyymmdd[1], +yyyymmdd[2]-1, +yyyymmdd[3]); }
        if (!dateObj) dateObj = new Date(value);

        if (fp && !isNaN(dateObj)) {
          fp.setDate(dateObj, true); // true = trigger onChange
        } else {
          // Fallback: set value directly + dispatch
          const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          el.focus();
          if (niv) niv.set.call(el, value); else el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
        }
        console.debug('[CC] flatpickr fill:', selector, 'value:', value, 'result:', el.value);
        return el.value ? 1 : 0;
      } else if (el.classList.contains('hasDatepicker') || (typeof $ !== 'undefined' && typeof $.fn !== 'undefined' && typeof $.fn.datepicker !== 'undefined' && $(el).data('datepicker'))) {
        // ── jQuery UI Datepicker ─────────────────────────────────────────────
        let dateObj = null;
        const ddmmyyyy = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
        if (ddmmyyyy) { dateObj = new Date(+ddmmyyyy[3], +ddmmyyyy[2]-1, +ddmmyyyy[1]); }
        const yyyymmdd = value.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
        if (!dateObj && yyyymmdd) { dateObj = new Date(+yyyymmdd[1], +yyyymmdd[2]-1, +yyyymmdd[3]); }
        if (!dateObj) dateObj = new Date(value);

        if (!isNaN(dateObj)) {
          $(el).datepicker('setDate', dateObj);
        } else {
          // Fallback: set value + trigger
          const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          el.focus();
          if (niv) niv.set.call(el, value); else el.value = value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        console.debug('[CC] jQuery datepicker fill:', selector, 'value:', value, 'result:', el.value);
        return el.value ? 1 : 0;
      } else if (el.getAttribute('matdatepicker') !== null || el.getAttribute('matInput') !== null && el.closest('mat-datepicker-toggle,mat-form-field') && (el.type === 'text' || el.type === 'date')) {
        // ── Angular Material mat-datepicker ──────────────────────────────────
        // mat-datepicker binds to a plain <input matInput [matDatepicker]="...">
        // Setting .value alone doesn't update the Angular FormControl.
        // We must: 1) set via native setter, 2) fire input+change, 3) fire a
        // synthetic MatDatepickerInputEvent so Angular's ControlValueAccessor picks it up.
        const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        el.focus();
        if (niv) niv.set.call(el, value); else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // Angular Material listens for 'dateChange' and 'dateInput' on the host element
        el.dispatchEvent(new CustomEvent('dateChange', { bubbles: true, detail: { value } }));
        el.dispatchEvent(new CustomEvent('dateInput', { bubbles: true, detail: { value } }));
        // Also try keyboard simulation — some Angular versions only update on keyup
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) || 'Enter' }));
        el.blur();
        return 1;
      } else if (el.type === 'date' || el.type === 'datetime-local' || el.type === 'month' || el.type === 'week') {
        // ── Native date/time inputs ──────────────────────────────────────────
        // These require ISO format: YYYY-MM-DD for date, YYYY-MM-DDTHH:MM for
        // datetime-local, YYYY-MM for month. Profile data is usually in Indian
        // format (DD/MM/YYYY or DD-MM-YYYY). Convert before setting.
        let isoValue = value;
        // Detect DD/MM/YYYY or DD-MM-YYYY and convert to YYYY-MM-DD
        const ddmmyyyy = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
        if (ddmmyyyy) {
          const [, day, month, year] = ddmmyyyy;
          if (el.type === 'month') {
            isoValue = `${year}-${month.padStart(2, '0')}`;
          } else {
            isoValue = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
        }
        // Detect YYYY/MM/DD or YYYY-MM-DD (already ISO-ish)
        const yyyymmdd = value.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
        if (yyyymmdd && !ddmmyyyy) {
          const [, year, month, day] = yyyymmdd;
          isoValue = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        // For datetime-local: if only date provided, append T00:00
        if (el.type === 'datetime-local' && !isoValue.includes('T')) {
          isoValue += 'T00:00';
        }
        // Set via native setter (keystroke doesn't work on date inputs)
        const niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        el.focus();
        if (niv) niv.set.call(el, isoValue); else el.value = isoValue;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
        console.debug('[CC] date fill:', selector, 'original:', value, 'iso:', isoValue, 'result:', el.value);
        return el.value ? 1 : 0;
      } else {
        // Angular/React compatible input filling
        const isTextarea = el.tagName === 'TEXTAREA';
        const niv = isTextarea
          ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
          : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');

        // PRIMARY PATH: keystroke-style fill — mimics real typing with full
        // keydown/beforeinput/input(insertText)/keypress/keyup event sequence.
        // Works on every site we've tested + is required by aadhaar/OTP/captcha
        // fields that reject value+dispatch. v5.67 made this the default.
        if (typeof window.keystrokeFillSync === 'function') {
          const ok = window.keystrokeFillSync(el, value);
          // ServicePlus / RTPS Bihar pattern: typing English into a name field
          // and pressing Tab should auto-fill the paired Hindi field via the
          // site's own transliteration. keystrokeFillSync now dispatches Tab
          // keydown after typing, which triggers RTPS's handler.
          // We add a safety net: 500ms later, check if Hindi sibling is still
          // empty, and if so call Google's transliteration API ourselves.
          if (el.getAttribute && el.getAttribute('data-type') === 'fullName') {
            const allInputs = Array.from(document.querySelectorAll('input[type="text"]'));
            const idx = allInputs.indexOf(el);
            const next = allInputs[idx + 1];
            if (next && next.getAttribute('data-type') === 'text') {
              setTimeout(() => {
                if (next.value && next.value.length > 0) return; // site filled it
                const fillHindi = (hindiVal) => {
                  if (typeof window.keystrokeFillSync === 'function') window.keystrokeFillSync(next, hindiVal);
                };
                fetch('https://inputtools.google.com/request?text='+encodeURIComponent(value)+'&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8')
                  .then(r=>r.json())
                  .then(d=>{ const hindi = d?.[1]?.[0]?.[1]?.[0]; fillHindi(hindi || value); })
                  .catch(()=>fillHindi(value));
              }, 500);
            }
          }
          return ok ? 1 : 0;
        }

        // Legacy fallback (only if keystroke plugin failed to load):
        // value-set + dispatch.
        el.focus();
        if (niv) niv.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: value.slice(-1) }));
        return 1;
      }
    } catch { /* skip */ }
    return 0;
  }

  // ── Sequential DOM-order filling with scroll ──────────────────────────────
  // Fill fields one-by-one in DOM order. Scroll to each field before filling.
  // This ensures strict-validation forms accept values (fields must be filled in order).
  async function fillSequential() {
    for (const [selector, fieldData] of entries) {
      const { value, type } = fieldData;
      let isNgDropdown = type === 'ng-dropdown' || selector.startsWith('ng-dropdown-');
      const fieldLabel = (filledBySource[selector]?.label || selector).toLowerCase();
      // Cascade treatment only applies to actual dropdowns (state→district→block
      // selects that load options via AJAX). A TEXT field labeled "district"
      // must NOT wait for <option>s it will never have.
      const _selectLike = /^(select|dropdown|ng-dropdown|mat-select)$/.test(type || '');
      const isDependent = _selectLike && PRIORITY_KEYS.some(k => fieldLabel.includes(k) || selector.toLowerCase().includes(k));

      // Resolve element
      let el;
      if (selector.startsWith('form-field-')) {
        const all = document.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select');
        el = all[parseInt(selector.split('-')[2])];
      } else if (selector.startsWith('ng-dropdown-')) {
        el = document.querySelectorAll('div.ng-dropdown')[parseInt(selector.split('-')[2])];
      } else {
        el = document.querySelector(selector);
      }

      // Detect ng-dropdown from DOM (mapping type may be wrong, e.g. 'mat-select' for ng-select)
      if (!isNgDropdown && el) {
        const _tag = el.tagName.toLowerCase();
        if (_tag === 'ng-select' || (el.classList && (el.classList.contains('ng-select') || el.classList.contains('ng-dropdown')))) {
          isNgDropdown = true;
        }
        // Any non-native element with role=combobox/listbox is a custom dropdown → use plugin
        if (!isNgDropdown && _tag !== 'select' && _tag !== 'input' && _tag !== 'mat-select') {
          const _role = el.getAttribute('role');
          if (_role === 'combobox' || _role === 'listbox') isNgDropdown = true;
        }
      }

      // Scroll into view
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 300));
      }

      const _t0 = Date.now();
      const _fieldCtx = { type, label: filledBySource[selector]?.label || selector, profileKey: filledBySource[selector]?.profileKey || '', selector };
      // Diagnostic: which path will this field take?
      const _selectLike2 = /^(select|dropdown|ng-dropdown|mat-select)$/.test(type || '');
      if (_selectLike2) console.log('[CC] route:', selector, 'type:', type, 'isNgDropdown:', isNgDropdown, 'isDependent:', isDependent, 'filled:', filled, 'elTag:', el?.tagName, 'elType:', el?.type);

      if (fieldData.type === 'button') {
        // Phase boundary: button-click plugin
        const _btnPlugin = (_CC_USE_PLUGINS && typeof findPlugin === 'function') ? findPlugin(el, _fieldCtx) : null;
        if (_btnPlugin) {
          const _pResult = _btnPlugin.fill(el, value, { attempt: 1 });
          const _preCount = document.querySelectorAll("input,select,textarea,div.ng-dropdown").length;
          // Wait for DOM to stabilize after transition
          await waitForDOMQuiet(800);
          // Re-extract visible fields after transition (graph rebuild)
          const newFields = document.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input[type="number"],input[type="date"],input[type="radio"],input[type="checkbox"],input:not([type]),textarea,select,div.ng-dropdown');
          const newFieldCount = newFields.length;
          _ccRecords.push({ selector, value, type: 'button', result: 'filled', strategy: 'plugin:button-click', plugin: 'button-click', role: fieldData.role || 'navigation', newFieldCount, transitionOutcome: newFieldCount > _preCount ? "transition_success" : newFieldCount === _preCount ? "transition_no_change" : "transition_partial", durationMs: Date.now()-_t0, ts: Date.now(), rv: RUNTIME_VERSION }); _flushRecords();
          console.debug('[CC][plugin] button-click', selector, 'newFields:', newFieldCount);
        } else {
          // Fallback: just click
          if (el) el.click();
          await waitForDOMQuiet(800);
        }
        await waitForNetworkIdle(100, 1500); // was setTimeout(500) � now exits early when AJAX done
      } else if (isNgDropdown) {
        // ng-dropdown: use plugin if available
        if (!el) { _ccRecords.push({ selector, value, type, result: 'skipped', failReason: 'no-element', strategy: 'ng-dropdown', ts: Date.now(), rv: RUNTIME_VERSION }); _flushRecords(); continue; }
        const _ngPlugin = (_CC_USE_PLUGINS && typeof findPlugin === 'function') ? findPlugin(el, _fieldCtx) : null;
        if (_ngPlugin) {
          try {
            const _ctx = { profileKey: _fieldCtx.profileKey, portalAdapters: portalAdapters || {}, attempt: 1 };
            const _pResult = await _ngPlugin.fill(el, value, _ctx);
            const _r = _pResult.success ? 1 : 0;
            filled += _r;
            _ccRecords.push({ selector, value, type, result: _r ? 'filled' : 'skipped', failReason: _r ? null : _pResult.reason, strategy: 'plugin:' + _ngPlugin.id, plugin: _ngPlugin.id, durationMs: Date.now()-_t0, ts: Date.now(), rv: RUNTIME_VERSION }); _flushRecords();
          } catch(e) {
            fillOne(selector, value, type);
          }
        } else {
          fillOne(selector, value, type);
        }
        await waitForNetworkIdle(100, 1500); // was setTimeout(500) � now exits early when AJAX done
      } else if (isDependent && filled > 0) {
        // Cascade: wait for parent's AJAX to actually complete (vs hardcoded delay).
        console.log('[CC] cascade-wait:', selector, 'label:', fieldLabel, 'waiting for network+options...');
        const _netRes = await waitForNetworkIdle(150, 6000);
        console.log('[CC] cascade-net:', selector, _netRes.idle ? 'idle' : 'timeout', 'waited:', _netRes.waitedMs + 'ms', _netRes.monitorMissing ? '(NO MONITOR)' : '');
        // After network idle, options should be populated; double-check with poll
        const waitedEl = await waitForOptions(selector, 1, 4000);
        if (!waitedEl) {
          const _el3 = document.querySelector(selector);
          const _optCount = _el3 ? Array.from(_el3.options || []).length : 0;
          const _optSample = _el3 ? Array.from(_el3.options || []).slice(0,3).map(o => o.value + '=' + o.text.trim()) : [];
          console.log('[CC] cascade-TIMEOUT:', selector, 'opts:', _optCount, 'disabled:', _el3?.disabled, 'sample:', _optSample);
          _ccRecords.push({ selector, value, type, result: 'skipped', failReason: 'wait-timeout', strategy: 'wait-engine', waitedMs: _netRes.waitedMs, networkIdle: _netRes.idle, optionCount: _optCount, ts: Date.now(), rv: RUNTIME_VERSION }); _flushRecords();
          continue;
        }
        console.log('[CC] cascade-ready:', selector, 'opts:', waitedEl.options.length, 'filling:', value);
        const _plugin = (_CC_USE_PLUGINS && typeof findPlugin === 'function') ? findPlugin(waitedEl, _fieldCtx) : null;
        if (_plugin) {
          const _pResult = _plugin.fill(waitedEl, value, { profileKey: _fieldCtx.profileKey, parentValues: {}, attempt: 1 });
          const _r = _pResult.success ? 1 : 0;
          filled += _r;
          const _deps = _plugin.meta.getDependsOn ? _plugin.meta.getDependsOn(_fieldCtx.profileKey) : [];
          _ccRecords.push({ selector, value, type, result: _r ? 'filled' : 'skipped', failReason: _r ? null : _pResult.reason, strategy: 'plugin:' + _plugin.id, plugin: _plugin.id, dependsOn: _deps, durationMs: Date.now()-_t0, ts: Date.now(), rv: RUNTIME_VERSION }); _flushRecords();
        } else {
          const _r = fillOne(selector, value, type) || 0;
          filled += _r;
          _ccRecords.push({ selector, value, type, result: _r ? 'filled' : 'skipped', failReason: _r ? null : 'no-option', strategy: 'wait-engine', durationMs: Date.now()-_t0, ts: Date.now(), rv: RUNTIME_VERSION }); _flushRecords();
        }
        await new Promise(r => setTimeout(r, 200));
      } else if (el && el.type === 'file' && value && (value.startsWith('http://') || value.startsWith('https://'))) {
        // ── File input with URL — async fetch and assign ─────────────────────
        try {
          const resp = await fetch(value);
          if (resp.ok) {
            const blob = await resp.blob();
            const fileName = value.split('/').pop().split('?')[0] || 'document';
            const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream', lastModified: Date.now() });
            const dt = new DataTransfer();
            dt.items.add(file);
            el.files = dt.files;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            filled += 1;
            console.debug('[CC] file URL assigned:', selector, fileName, file.size, 'bytes');
            _ccRecords.push({ selector, value, type: 'file', result: 'filled', strategy: 'file-url-fetch', fileName, fileSize: file.size, durationMs: Date.now()-_t0, ts: Date.now(), rv: RUNTIME_VERSION }); _flushRecords();
          } else {
            // Fetch failed — click to open dialog
            el.click();
            _ccRecords.push({ selector, value, type: 'file', result: 'waiting_human', failReason: 'fetch-' + resp.status, strategy: 'file-click', durationMs: Date.now()-_t0, ts: Date.now(), rv: RUNTIME_VERSION }); _flushRecords();
          }
        } catch (e) {
          el.click();
          _ccRecords.push({ selector, value, type: 'file', result: 'waiting_human', failReason: e.message, strategy: 'file-click', durationMs: Date.now()-_t0, ts: Date.now(), rv: RUNTIME_VERSION }); _flushRecords();
        }
        await new Promise(r => setTimeout(r, 200));
      } else {
        // Standard field: fill immediately
        try {
          const _r = fillOne(selector, value, type) || 0;
          const _el2 = el || document.querySelector(selector);
          const _strategy = detectStrategy(_el2, type);
          // Verify the value actually landed (catches frameworks that silently
          // clear, masked inputs that reformat, or async validators).
          const _ver = await verifyValue(selector, value, 120);
          const _trulyFilled = _r === 1 && _ver.ok;
          if (_trulyFilled) filled += 1;
          _ccRecords.push({
            selector, value, type,
            result: _trulyFilled ? 'filled' : 'skipped',
            failReason: _trulyFilled ? null : (_r ? (_ver.reason || 'value-rejected') : (_el2 ? 'no-option' : 'no-element')),
            actualValue: _ver.actualValue,
            verified: _ver.ok,
            strategy: _strategy,
            durationMs: Date.now() - _t0,
            ts: Date.now(), rv: RUNTIME_VERSION
          }); _flushRecords();
        } catch(e) {
          _ccRecords.push({ selector, value, type, result: 'error', error: e.message, ts: Date.now() }); _flushRecords();
        }
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }
  await fillSequential();


  // ── Operator Correction Observer ─────────────────────────────────────────
  // After runtime settles, snapshot filled values.
  // On form submit or page unload, capture final state and POST corrections.
  setTimeout(() => {
    const _ccBackendUrl = document.body.getAttribute('data-cc-backend') || '';
    const _ccFormKey = document.body.getAttribute('data-cc-formkey') || '';
    const snapshot = {};
    const fieldMeta = {};
    for (const [selector, fieldData] of entries) {
      let el = getEl(selector);
      if (!el) continue;
      const val = el.tagName === 'SELECT' ? (el.options[el.selectedIndex]?.text || el.value)
        : el.classList?.contains('ng-dropdown') ? (el.querySelector('.value-area .value,.select-type,.ng-value-label')?.textContent?.trim() || '')
        : el.value || '';
      snapshot[selector] = val;
      const rec = _ccRecords.find(r => r.selector === selector);
      fieldMeta[selector] = {
        label: filledBySource[selector]?.label || selector,
        semanticKey: filledBySource[selector]?.semanticKey || '',
        profileKey: filledBySource[selector]?.profileKey || '',
        plugin: rec?.plugin || null,
        strategy: rec?.strategy || '',
        originalResult: rec?.result || 'unknown',
        autofilledValue: fieldData.value
      };
    }

    // Also snapshot UNMAPPED fields the popup detected — so when operator fills them
    // manually, we capture them as 'completion' corrections (= teaching signal that
    // populates the profile next time)
    if (Array.isArray(allFields)) {
      for (const f of allFields) {
        if (snapshot[f.selector] !== undefined) continue; // already tracked as mapped
        const el = getEl(f.selector);
        if (!el) continue;
        const val = el.tagName === 'SELECT' ? (el.options[el.selectedIndex]?.text || el.value)
          : el.classList?.contains('ng-dropdown') ? (el.querySelector('.value-area .value,.select-type,.ng-value-label')?.textContent?.trim() || '')
          : el.value || '';
        snapshot[f.selector] = val;
        fieldMeta[f.selector] = {
          label: f.label || f.selector,
          semanticKey: '',
          profileKey: '',
          plugin: null,
          strategy: 'unmapped',
          originalResult: 'unmapped',
          autofilledValue: '',
        };
      }
    }

    function captureCorrections(trigger) {
      const corrections = [];
      for (const [selector, originalVal] of Object.entries(snapshot)) {
        let el = getEl(selector);
        if (!el) continue;
        const currentVal = el.tagName === 'SELECT' ? (el.options[el.selectedIndex]?.text || el.value)
          : el.classList?.contains('ng-dropdown') ? (el.querySelector('.value-area .value,.select-type,.ng-value-label')?.textContent?.trim() || '')
          : el.value || '';
        if (currentVal !== originalVal && currentVal !== '') {
          const meta = fieldMeta[selector] || {};
          corrections.push({
            selector, field: meta.label, semanticKey: meta.semanticKey, profileKey: meta.profileKey,
            autofilledValue: meta.autofilledValue, snapshotValue: originalVal, finalOperatorValue: currentVal,
            correctionType: (!originalVal || originalVal === '') ? 'completion' : 'override',
            originalResult: meta.originalResult, plugin: meta.plugin, strategy: meta.strategy,
            trigger, ts: Date.now()
          });
        }
      }
      return corrections;
    }

    function postCorrections(trigger) {
      const corrections = captureCorrections(trigger);
      if (corrections.length === 0) return;
      document.body.setAttribute('data-cc-corrections', JSON.stringify(corrections));
      if (_ccBackendUrl) {
        const _ccToken = document.body.getAttribute('data-cc-token') || '';
        const _ccProfileId = document.body.getAttribute('data-cc-profile-id') || '';
        const headers = { 'Content-Type': 'application/json' };
        if (_ccToken) headers['Authorization'] = 'Bearer ' + _ccToken;
        fetch(_ccBackendUrl + '/corrections', {
          method: 'POST',
          headers,
          body: JSON.stringify({ hostname: location.hostname, semanticFormKey: _ccFormKey, profileId: _ccProfileId, trigger, corrections })
        }).catch(() => {});
      }
    }

    // Detect submit button clicks
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button,input[type="submit"],[type="submit"],.btn-submit,.submit-btn');
      if (!btn) return;
      const txt = (btn.textContent || btn.value || '').toLowerCase();
      if (/submit|save|next|continue|proceed|finalize/i.test(txt) || btn.type === 'submit') {
        postCorrections('submit');
      }
    }, true);

    // Fallback: beforeunload
    window.addEventListener('beforeunload', () => postCorrections('unload'));
  }, 10000);

  // ── Confirm/Retype propagation pass ─────────────────────────────────────────
  // After primary fills settle, mirror DOM values into confirm/retype fields
  setTimeout(function() {
    var confirmPatterns = /^c(?=[a-z])|^confirm|^retype|^re_?type|^re_?enter|^verify/i;
    var allInputs = Array.from(document.querySelectorAll('input[type=text],input[type=email],input[type=tel],input[type=number]'));
    allInputs.forEach(function(el) {
      if (!el.id && !el.name) return;
      var id = (el.id || el.name || '').toLowerCase();
      var label = (function() { if(el.id){var l=document.querySelector('label[for="'+el.id+'"]');if(l)return l.textContent.toLowerCase();} return ''; })();
      var isConfirm = confirmPatterns.test(id) || /confirm|retype|re.type|re.enter|verify/i.test(label);
      if (!isConfirm) return;
      if (el.value) return; // already filled, skip
      // Find primary field by stripping confirm prefix from ID
      var baseId = id.replace(/^c(?=[a-z])/,'').replace(/^confirm_?/i,'').replace(/^retype_?/i,'').replace(/^re_?type_?/i,'').replace(/^re_?enter_?/i,'').replace(/^verify_?/i,'');
      var primary = document.getElementById(baseId) || document.querySelector('[id$="'+baseId+'"]') || document.querySelector('[name="'+baseId+'"]');
      // Also try matching by placeholder pattern (both DOB fields have DD/MM)
      if (!primary || !primary.value) {
        var ph = (el.placeholder || '').toLowerCase();
        if (ph.includes('dd/mm') || ph.includes('dd-mm')) {
          // Find any filled input with same placeholder pattern
          var allFilled = Array.from(document.querySelectorAll('input[type=text]')).filter(function(inp) {
            return inp !== el && inp.value && (inp.placeholder || '').toLowerCase().match(/dd.mm/);
          });
          if (allFilled.length > 0) primary = allFilled[0];
        }
      }
      if (!primary || !primary.value) return;
      // Propagate settled DOM value
      var niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (niv) niv.set.call(el, primary.value); else el.value = primary.value;
      ['input','change','blur'].forEach(function(ev) { el.dispatchEvent(new Event(ev, {bubbles:true})); });
      _ccRecords.push({ selector: '#'+(el.id||el.name), value: primary.value, type: 'text', result: 'filled', strategy: 'confirm-mirror', durationMs: 0, ts: Date.now(), rv: RUNTIME_VERSION });
      _flushRecords();
    });
  }, 4000);

  // ── Mirror Observer: sync derived fields when operator fills primary manually ──
  setTimeout(function() {
    var confirmPatterns = /^c(?=[a-z])|^confirm|^retype|^re_?type|^re_?enter|^verify/i;
    var allInputs = Array.from(document.querySelectorAll('input[type=text],input[type=email],input[type=tel]'));
    allInputs.forEach(function(el) {
      if (!el.id) return;
      if (el.value) return; // already filled — no need to observe
      var id = el.id.toLowerCase();
      // Find if this is a primary field with a derived confirm field
      var confirmId = null;
      allInputs.forEach(function(other) {
        if (!other.id || other === el) return;
        var oid = other.id.toLowerCase();
        if (confirmPatterns.test(oid)) {
          var baseId = oid.replace(/^c(?=[a-z])/,'').replace(/^confirm_?/i,'').replace(/^retype_?/i,'').replace(/^re_?type_?/i,'').replace(/^re_?enter_?/i,'').replace(/^verify_?/i,'');
          if (baseId === id || id.includes(baseId) || baseId.includes(id)) confirmId = other.id;
        }
      });
      if (!confirmId) return;
      // Attach listener: when primary changes, mirror to confirm
      var _mirrorTarget = document.getElementById(confirmId);
      var _mirroring = false;
      el.addEventListener('input', function() {
        if (_mirroring) return;
        _mirroring = true;
        var niv = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (niv) niv.set.call(_mirrorTarget, el.value); else _mirrorTarget.value = el.value;
        ['input','change'].forEach(function(ev) { _mirrorTarget.dispatchEvent(new Event(ev, {bubbles:true})); });
        _mirroring = false;
      });
    });
  }, 3000);

  // Final flush via DOM attribute (shared between all worlds and executeScript calls)
  try { document.body.setAttribute('data-cc-records', JSON.stringify(_ccRecords)); } catch {}
  return filled;
}
