/**
 * DOM radio / checkbox / file
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installFillOneChoiceDom = function (k) {
    const b = root.CcExecParts.bindKernelLocals(k);
    const {
      portalAdapters, filledBySource, mapping, _replayResults, _ccRecords,
      RUNTIME_VERSION, _CC_USE_PLUGINS, PRIORITY_KEYS, entries, getEl,
      _emitFillDebug, _flushRecords, _pushSelectRecord, settleAfterAct,
      waitForSelectOptionsSequential, waitForOptions, detectStrategy, verifyValue,
      _isPlaceholderOption, _realOptions, _sampleOptions, _readSelectActual,
      _selectLoadMode, _cascadeSemanticKey, _CASCADE_PARENTS, _cascadeSettled,
      _isPlaceholderPlanned, _selectIsActive, fillOne,
    } = b;

    k.fillOneHandlers = k.fillOneHandlers || [];
    k.fillOneHandlers.push({
      id: 'choice-dom',
      try(el, selector, value, type, elType) {
        if (elType === 'radio') {
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
                // ── File input (sync path) ───────────────────────────────────────────
                // Chrome: "File chooser dialog can only be shown with a user activation."
                // Never el.click() a file input during autofill — it throws and aborts fill.
                // URL fetch is handled in the async sequential loop. Here: base64 only,
                // otherwise return 0 so sequential marks waiting_human without dialog.
                if (!value) {
                  console.debug('[CC] file: no value — waiting_human (no dialog):', selector);
                  return 0;
                }
                if (value.startsWith('data:')) {
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
                    console.debug('[CC] file base64 error:', e.message, '— waiting_human (no dialog)');
                    return 0;
                  }
                }
                if (value.startsWith('http://') || value.startsWith('https://')) {
                  // URL fetch handled in sequential loop
                  console.debug('[CC] file URL deferred to sequential loop:', selector);
                  return 0;
                }
                // Filename hint only — cannot open OS dialog from automation
                console.debug('[CC] file: filename hint only — waiting_human (no dialog):', selector, value);
                return 0;
              } 
        return null;
      },
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
