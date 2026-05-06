function teachOneField(field) {
  // Clear any previous result
  sessionStorage.removeItem('_cc_teach_result');
  sessionStorage.setItem('_cc_teach_active', '1');

  // Find component root - for unresolved fields, find by label text
  let root = null;
  if (field.selector && !field.selector.startsWith('form-field-')) {
    root = document.querySelector(field.selector);
  }
  // Fallback: find ng-dropdown by label text
  if (!root) {
    document.querySelectorAll('div.ng-dropdown, mat-select, [role="combobox"]').forEach(el => {
      const lbl = el.querySelector('.label, mat-label, label')?.textContent?.trim() || el.getAttribute('aria-label') || '';
      if (lbl && field.label && lbl.includes(field.label.replace(/[\n*]/g,'').trim().slice(0,15))) root = el;
    });
  }
  console.log('[CC] teachOneField: field=', JSON.stringify(field), 'root=', root ? root.className : 'NULL');
  if (!root) { sessionStorage.removeItem('_cc_teach_active'); return; }

  // Must have a verifyEl to detect state change — without it we can't know when selection completes
  const verifyElCheck = root.querySelector('.select-type') ||
                        root.querySelector('[class*="selected"]') ||
                        root.querySelector('[class*="value"]') ||
                        root.querySelector('.value-area');
  console.log('[CC] teachOneField: verifyEl=', verifyElCheck ? verifyElCheck.className : 'NULL', 'initialValue=', verifyElCheck?.textContent?.trim());
  if (!verifyElCheck) {
    sessionStorage.setItem('_cc_teach_result', JSON.stringify({ error: 'no-verify-el', componentClass: 'ng-dropdown' }));
    sessionStorage.removeItem('_cc_teach_active');
    return;
  }

  // Scroll root into view
  root.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Highlight root element
  const origOutline = root.style.outline;
  const origBoxShadow = root.style.boxShadow;
  root.style.outline = '2px solid #dc2626';
  root.style.boxShadow = '0 0 0 4px rgba(220,38,38,0.3)';

  // Inject floating badge (shadow DOM, fixed position relative to viewport)
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;top:0;left:0;';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const badge = document.createElement('div');
  badge.style.cssText = 'background:#dc2626;color:white;padding:5px 10px;border-radius:4px;font-size:12px;font-family:sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.5);';
  badge.textContent = '⚠ Click this dropdown to open it';
  shadow.appendChild(badge);

  function positionBadge() {
    const r = root.getBoundingClientRect();
    // Fixed positioning is relative to viewport — no scroll offset needed
    host.style.left = r.left + 'px';
    host.style.top = Math.max(4, r.top - 34) + 'px';
  }
  positionBadge();
  const posInterval = setInterval(positionBadge, 150);

  // Find the element that shows the selected value (to detect state change)
  // Try multiple selectors for the displayed value
  const verifyEl = root.querySelector('.select-type') ||
                   root.querySelector('[class*="selected"]') ||
                   root.querySelector('[class*="value"]') ||
                   root.querySelector('.value-area');
  const verifySel = verifyEl ? '.' + (verifyEl.className || '').trim().split(/\s+/)[0] : '';
  const initialValue = verifyEl ? verifyEl.textContent.trim() : '';

  let triggerSelector = '';
  let phase = 1; // 1=waiting for trigger click, 2=waiting for state change

  function cleanup() {
    clearInterval(posInterval);
    clearInterval(statePoller);
    document.removeEventListener('click', onTriggerClick, true);
    try { document.body.removeChild(host); } catch {}
    root.style.outline = origOutline;
    root.style.boxShadow = origBoxShadow;
    sessionStorage.removeItem('_cc_teach_active');
  }

  // Phase 1: capture trigger click (must be inside root)
  function onTriggerClick(e) {
    if (!root.contains(e.target)) return;
    const el = e.target;
    // Build a stable selector: prefer class, fall back to tag, always have a value
    const cls = (el.className || '').trim().split(/\s+/).filter(c => c && !c.startsWith('ng-') && !c.startsWith('_ng'))[0];
    triggerSelector = cls ? '.' + cls : (el.tagName.toLowerCase() + (el.getAttribute('role') ? `[role="${el.getAttribute('role')}"]` : ''));
    if (!triggerSelector) triggerSelector = '.value-area'; // SSC ng-dropdown fallback
    badge.textContent = '⚠ Select an option from the list';
    phase = 2;
    document.removeEventListener('click', onTriggerClick, true);
  }
  document.addEventListener('click', onTriggerClick, true);

  // Phase 2: poll for verifyEl text change only (innerHTML diff causes Angular false-positives)
  let statePoller = setInterval(() => {
    if (phase !== 2 || !verifyEl) return;
    const currentValue = verifyEl.textContent.trim();
    const placeholder = /^(select|choose|--|please|select option)/i;
    const valueChanged = currentValue && currentValue !== initialValue && !placeholder.test(currentValue);
    if (valueChanged) {
      clearInterval(statePoller);
      cleanup();

      // Infer option selector by finding visible option-like elements near the selected text
      // Walk DOM for any element whose text matches the selected value
      let optionSelector = 'li';
      let containerSel = '';
      document.querySelectorAll('li, [class*="option"], [class*="item"]').forEach(el => {
        if (el.textContent.trim() === currentValue) {
          optionSelector = el.tagName.toLowerCase() + (el.className ? '.' + el.className.trim().split(/\s+/)[0] : '');
          let c = el.parentElement;
          for (let i = 0; i < 5 && c && c !== document.body; i++) {
            const cls = c.className || '';
            if (cls.includes('list') || cls.includes('option') || cls.includes('dropdown') || cls.includes('panel') || cls.includes('menu')) {
              containerSel = c.tagName.toLowerCase() + (c.className ? '.' + c.className.trim().split(/\s+/)[0] : '');
              break;
            }
            c = c.parentElement;
          }
        }
      });

      const result = {
        componentClass: root.className.trim().split(/\s+/)[0] || 'ng-dropdown',
        triggerSelector,
        optionsContainer: containerSel,
        optionSelector,
        verifySelector: verifySel,
        learnedValue: currentValue,
      };
      sessionStorage.setItem('_cc_teach_result', JSON.stringify(result));
    }
  }, 200);

  // Timeout after 45s
  setTimeout(() => { cleanup(); }, 45000);
}

