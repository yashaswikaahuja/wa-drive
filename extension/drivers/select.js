/**
 * Select drivers — pick options from native <select>, ng-select, mat-select,
 * and custom JS-driven dropdowns.
 *
 * Drivers:
 *   - select.option  → pick option by value/text/index
 *   - select.cascade → fill a dependent dropdown (waits for parent's options to populate)
 */
;(function () {
  if (!window.cc || !window.cc.registerDriver) return;

  function findEl(target) {
    if (!target) return null;
    return document.querySelector(target);
  }

  // Native <select>: find option by exact text, then case-insensitive contains
  function pickNativeOption(sel, value) {
    const v = String(value).trim();
    const vLower = v.toLowerCase();
    let opt = Array.from(sel.options).find(o => o.text.trim() === v || o.value === v);
    if (!opt) opt = Array.from(sel.options).find(o => o.text.trim().toLowerCase() === vLower);
    if (!opt) opt = Array.from(sel.options).find(o => o.text.toLowerCase().includes(vLower) || vLower.includes(o.text.toLowerCase().trim()));
    return opt;
  }

  function fillNativeSelect(sel, value) {
    const opt = pickNativeOption(sel, value);
    if (!opt) return { ok: false, reason: 'no-matching-option', options: Array.from(sel.options).slice(0, 20).map(o => o.text) };
    sel.value = opt.value;
    sel.selectedIndex = opt.index;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, selectedText: opt.text, selectedValue: opt.value };
  }

  // ── select.option ────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'select.option',
    description: 'Pick an option from a dropdown. Auto-detects native <select>, ng-select, mat-select. Match by text (case-insensitive contains).',
    sideEffect: 'mutate',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'CSS selector for the dropdown' },
        value: { type: 'string', description: 'Option text or value to select' },
      },
      required: ['target', 'value'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const el = findEl(args.target);
      if (!el) throw new Error('element-not-found: ' + args.target);

      // Route by element kind
      const tag = el.tagName.toLowerCase();
      const cls = (el.className || '').toLowerCase();
      const isNg = tag === 'ng-select' || cls.includes('ng-select') || el.closest('.ng-select');
      const isMat = tag === 'mat-select' || cls.includes('mat-select') || el.closest('mat-select');
      const isCustom = isNg || isMat;

      if (tag === 'select' && !isCustom) {
        const r = fillNativeSelect(el, args.value);
        if (!r.ok) return r;
        return { strategy: 'native-select', ...r };
      }

      // ng-select / mat-select / cascade — delegate to plugins if present
      if (typeof window.findPlugin === 'function') {
        const plugin = window.findPlugin(el, { profileKey: '', label: '' });
        if (plugin) {
          const result = plugin.fill(el, args.value, { profileKey: '', parentValues: {}, attempt: 1 });
          await new Promise(r => setTimeout(r, 200));
          return { strategy: 'plugin:' + plugin.id, ...result };
        }
      }

      // Last-ditch: try opening + clicking option
      try { el.click(); } catch (e) {}
      await new Promise(r => setTimeout(r, 300));
      const v = String(args.value).toLowerCase();
      const opts = Array.from(document.querySelectorAll('.ng-option, .mat-option, [role="option"]'))
        .filter(o => (o.textContent || '').trim().toLowerCase().includes(v));
      if (opts[0]) {
        opts[0].click();
        return { strategy: 'click-option', selectedText: opts[0].textContent.trim() };
      }
      return { ok: false, reason: 'no-matching-option', strategy: 'unknown' };
    },
  });

  // ── select.cascade ───────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'select.cascade',
    description: 'Fill a dependent <select> that gets populated after parent selection. Waits for AJAX network idle (parent populated this dropdown via XHR/fetch), then picks the option. Use for state→district→block chains.',
    sideEffect: 'mutate',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        value: { type: 'string' },
        waitMs: { type: 'integer', description: 'Max wait for options (default 6000)' },
      },
      required: ['target', 'value'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const maxWait = args.waitMs || 6000;
      const deadline = Date.now() + maxWait;

      // Wait for network idle (parent's AJAX) + options to populate
      while (Date.now() < deadline) {
        const el = findEl(args.target);
        if (el) {
          const tag = el.tagName.toLowerCase();
          if (tag === 'select' && el.options.length > 1) break;
          if ((tag === 'ng-select' || tag === 'mat-select') && el.querySelectorAll('.ng-option, .mat-option').length > 0) break;
        }
        // Check ccAjaxActive from network monitor
        const active = parseInt(document.body.dataset.ccAjaxActive || '0', 10);
        if (active === 0) {
          const lastActivity = parseInt(document.body.dataset.ccAjaxLastActivity || '0', 10);
          if (Date.now() - lastActivity > 200) break;
        }
        await new Promise(r => setTimeout(r, 100));
      }

      const el = findEl(args.target);
      if (!el) throw new Error('element-not-found: ' + args.target);

      // Now select via the standard select.option driver
      return await window.cc.do({ name: 'select.option', args: { target: args.target, value: args.value } }).then(r => r.result || r);
    },
  });
})();
