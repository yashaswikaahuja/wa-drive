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
