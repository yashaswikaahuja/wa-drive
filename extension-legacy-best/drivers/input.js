/**
 * Input drivers — keystroke-style typing, clearing, focusing.
 * Wraps window.keystrokeFillSync from autofill/plugins/keystroke-input.js.
 *
 * Drivers:
 *   - input.type  → type a value via real keystroke event sequence
 *   - input.clear → clear an input field
 *   - input.focus → focus an element
 */
;(function () {
  if (!window.cc || !window.cc.registerDriver) return;

  function findEl(args) {
    if (!args.target) return null;
    return document.querySelector(args.target);
  }

  function readActual(el) {
    if (!el) return '';
    if (el.tagName === 'SELECT') {
      const o = el.options[el.selectedIndex];
      return o ? (o.text || o.value) : '';
    }
    return el.value || '';
  }

  // ── input.type ───────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'input.type',
    description: 'Type a value into a text/email/tel/textarea field via real keystroke events. Triggers framework validators (Aadhaar, OTP, masked inputs work). Dispatches Tab+focusout at the end so site Tab-handlers run (RTPS Hindi transliteration, ASP postback, etc).',
    sideEffect: 'mutate',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'CSS selector for the field' },
        value: { type: 'string', description: 'String to type' },
        clearFirst: { type: 'boolean', description: 'Clear existing value before typing (default true)' },
      },
      required: ['target', 'value'],
    },
    output: {
      type: 'object',
      properties: {
        actualValue: { type: 'string', description: 'Element value after typing (may differ from input due to masking/formatting)' },
        verified: { type: 'boolean', description: 'Whether actualValue matches expected (alphanum-stripped compare)' },
      },
    },
    handler: async function (args) {
      const el = findEl(args);
      if (!el) throw new Error('element-not-found: ' + args.target);
      if (typeof window.keystrokeFillSync !== 'function') {
        throw new Error('keystroke-input plugin not loaded');
      }
      const before = readActual(el);
      window.keystrokeFillSync(el, String(args.value));
      // Settle for framework reaction
      await new Promise(r => setTimeout(r, 120));
      const after = readActual(el);
      const expectedNorm = String(args.value).toLowerCase().replace(/[^a-z0-9]/g, '');
      const actualNorm = after.toLowerCase().replace(/[^a-z0-9]/g, '');
      let verified = expectedNorm === actualNorm
        || (actualNorm.length > 0 && actualNorm.startsWith(expectedNorm.slice(0, Math.max(8, expectedNorm.length - 2))));
      // Masked input pattern (UIDAI etc): actual shows '********6597'; accept if length matches and last 4 match
      if (!verified && after.length === String(args.value).length && after.length >= 8) {
        const tail = String(args.value).slice(-4).toLowerCase();
        if (after.toLowerCase().endsWith(tail)) verified = true;
      }
      return { before, actualValue: after, verified };
    },
  });

  // ── input.clear ──────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'input.clear',
    description: 'Clear a text input/textarea via native value setter + input event sequence.',
    sideEffect: 'mutate',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string' },
      },
      required: ['target'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const el = findEl(args);
      if (!el) throw new Error('element-not-found: ' + args.target);
      const before = readActual(el);
      const isTextarea = el.tagName === 'TEXTAREA';
      const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      try { el.focus(); } catch (e) {}
      try { el.select(); } catch (e) {}
      if (desc) desc.set.call(el, ''); else el.value = '';
      try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' })); }
      catch (e) { el.dispatchEvent(new Event('input', { bubbles: true })); }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { before, actualValue: el.value };
    },
  });

  // ── input.focus ──────────────────────────────────────────────────────────
  window.cc.registerDriver({
    name: 'input.focus',
    description: 'Focus an element. Scrolls into view first.',
    sideEffect: 'mutate',
    input: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        scrollIntoView: { type: 'boolean' },
      },
      required: ['target'],
    },
    output: { type: 'object' },
    handler: async function (args) {
      const el = findEl(args);
      if (!el) throw new Error('element-not-found: ' + args.target);
      if (args.scrollIntoView !== false) {
        try { el.scrollIntoView({ block: 'center' }); } catch (e) {}
        await new Promise(r => setTimeout(r, 100));
      }
      try { el.focus(); } catch (e) {}
      return { focused: document.activeElement === el };
    },
  });
})();
