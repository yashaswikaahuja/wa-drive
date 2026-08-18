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