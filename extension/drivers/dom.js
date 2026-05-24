/**
 * DOM observation drivers — read-only primitives.
 *
 * Drivers:
 *   - dom.query   → find elements by selector or semantic query
 *   - dom.read    → read state of a single element
 *   - dom.snapshot → list visible interactive elements with metadata
 *
 * All sideEffect: 'observe'.
 */
;(function () {
  if (!window.cc || !window.cc.registerDriver) return;

  // ── Helpers ──────────────────────────────────────────────────────────────
  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
    return true;
  }

  function getLabelFor(el) {
    if (!el) return '';
    if (el.id) {
      const lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lbl) return (lbl.textContent || '').trim();
    }
    const wrap = el.closest('label');
    if (wrap) {
      const clone = wrap.cloneNode(true);
      clone.querySelectorAll('input,select,textarea,button').forEach(x => x.remove());
      return (clone.textContent || '').trim();
    }
    // Look for nearby label-like containers
    let p = el.parentElement;
    let hop = 0;
    while (p && hop < 4) {
      const lbl = p.querySelector(':scope > label, :scope > .label, :scope > .field-label, :scope > .control-label, :scope > .form-label, :scope > mat-label');
      if (lbl) return (lbl.textContent || '').trim();
      p = p.parentElement; hop++;
    }
    return '';
  }

  function selectorFor(el) {
    if (!el) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    if (el.name) return el.tagName.toLowerCase() + '[name="' + CSS.escape(el.name) + '"]';
    // Best-effort path
    const path = [];
    let cur = el;
    while (cur && cur.tagName && path.length < 5) {
      let part = cur.tagName.toLowerCase();
      if (cur.className && typeof cur.className === 'string') {
        const cls = cur.className.trim().split(/\s+/).filter(c => /^[a-z][\w-]*$/i.test(c)).slice(0, 2);
        if (cls.length) part += '.' + cls.join('.');
      }
      const parent = cur.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
      }
      path.unshift(part);
      cur = parent;
    }
    return path.join(' > ');
  }

  function summarizeEl(el, opts) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const cls = (el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '';
    // Semantic kind — what the LLM agent should pick the tool for.
    let kind = 'unknown';
    if (tag === 'select' || tag === 'ng-select' || tag === 'mat-select' || cls.includes('ng-select') || cls.includes('mat-select')) {
      kind = 'dropdown';
    } else if (tag === 'textarea') {
      kind = 'text';
    } else if (tag === 'input') {
      const t = (el.type || 'text').toLowerCase();
      if (t === 'radio') kind = 'radio';
      else if (t === 'checkbox') kind = 'checkbox';
      else if (t === 'submit' || t === 'button') kind = 'button';
      else if (t === 'file') kind = 'file';
      else kind = 'text';
    } else if (tag === 'button' || el.getAttribute('role') === 'button') {
      kind = 'button';
    } else if (tag === 'a') {
      kind = 'link';
    }
    const sum = {
      tag,
      kind,
      type: el.type || null,
      id: el.id || null,
      name: el.name || null,
      role: el.getAttribute('role') || null,
      placeholder: el.placeholder || null,
      value: 'value' in el ? (el.value || '') : null,
      label: getLabelFor(el),
      text: (el.textContent || '').trim().slice(0, 80),
      disabled: !!el.disabled,
      readOnly: !!el.readOnly,
      visible: isVisible(el),
      bounds: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      selector: selectorFor(el),
    };
    if (opts && opts.includeAttrs) {
      sum.attrs = {};
      for (const a of el.attributes) sum.attrs[a.name] = a.value;
    }
    return sum;
  }

  // ── dom.query ────────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'dom.query',
    description: 'Find DOM elements by CSS selector or by semantic kind+text. Returns up to `limit` element summaries (visible only by default).',
    sideEffect: 'observe',
    input: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector. Mutually exclusive with kind+text.' },
        kind: { type: 'string', enum: ['button', 'link', 'input', 'select', 'textarea', 'checkbox', 'radio', 'any'], description: 'Semantic kind' },
        text: { type: 'string', description: 'Substring match against element textContent (case-insensitive)' },
        limit: { type: 'integer', description: 'Max results (default 10)' },
        includeHidden: { type: 'boolean', description: 'Include non-visible elements (default false)' },
      },
    },
    output: {
      type: 'object',
      properties: {
        count: { type: 'integer' },
        elements: { type: 'array' },
      },
    },
    handler: async function (args) {
      const limit = args.limit || 10;
      let candidates = [];
      if (args.selector) {
        candidates = Array.from(document.querySelectorAll(args.selector));
      } else if (args.kind || args.text) {
        let sel = '';
        if (args.kind === 'button') sel = 'button, input[type="submit"], input[type="button"], [role="button"]';
        else if (args.kind === 'link') sel = 'a[href]';
        else if (args.kind === 'input') sel = 'input:not([type="hidden"]), textarea';
        else if (args.kind === 'select') sel = 'select, mat-select, .ng-select';
        else if (args.kind === 'textarea') sel = 'textarea';
        else if (args.kind === 'checkbox') sel = 'input[type="checkbox"], mat-checkbox';
        else if (args.kind === 'radio') sel = 'input[type="radio"], mat-radio-button';
        else sel = 'input, button, select, textarea, a, [role="button"]';
        candidates = Array.from(document.querySelectorAll(sel));
        if (args.text) {
          const re = new RegExp(args.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          candidates = candidates.filter(el => re.test((el.textContent || el.value || el.placeholder || '').trim()));
        }
      } else {
        return { count: 0, elements: [], error: 'must provide selector OR kind+text' };
      }
      if (!args.includeHidden) candidates = candidates.filter(isVisible);
      const elements = candidates.slice(0, limit).map(el => summarizeEl(el));
      return { count: candidates.length, elements };
    },
  });

  // ── dom.read ─────────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'dom.read',
    description: 'Read full state of a single element (label, value, attrs, bounds, visibility).',
    sideEffect: 'observe',
    input: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
      },
      required: ['selector'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const el = document.querySelector(args.selector);
      if (!el) return { found: false };
      return { found: true, ...summarizeEl(el, { includeAttrs: true }) };
    },
  });

  // ── dom.snapshot ─────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'dom.snapshot',
    description: 'List all visible interactive elements on the page (inputs, buttons, selects, links). Use this to give an AI agent context about what is on the page.',
    sideEffect: 'observe',
    input: {
      type: 'object',
      properties: {
        kinds: { type: 'array', items: { type: 'string' } },
        limit: { type: 'integer' },
      },
    },
    output: { type: 'object' },
    handler: async function (args) {
      const kinds = args.kinds || ['input', 'button', 'link', 'select'];
      const limit = args.limit || 100;
      let sels = [];
      if (kinds.includes('input')) sels.push('input:not([type="hidden"])', 'textarea');
      if (kinds.includes('button')) sels.push('button', 'input[type="submit"]', 'input[type="button"]', '[role="button"]');
      if (kinds.includes('link')) sels.push('a[href]');
      if (kinds.includes('select')) {
        // Native + Angular Material + ng-select. Common patterns:
        //   <select>
        //   <mat-select> wrapped in <mat-form-field>
        //   <ng-select> from @ng-select/ng-select
        //   <div class="ng-select">  some sites use plain divs styled as ng-select
        //   <div class="value-area">  custom dropdowns (SSC OTR pattern)
        sels.push('select', 'mat-select', 'ng-select', '.ng-select', '.mat-select-trigger', 'div.value-area', '.ng-select-container');
      }
      if (kinds.includes('checkbox')) sels.push('input[type="checkbox"]', 'mat-checkbox');
      if (kinds.includes('radio')) sels.push('input[type="radio"]', 'mat-radio-button');
      const els = Array.from(document.querySelectorAll(sels.join(',')))
        .filter(isVisible)
        .slice(0, limit);
      return {
        url: location.href,
        title: document.title,
        elementCount: els.length,
        elements: els.map(el => summarizeEl(el)),
      };
    },
  });
})();
