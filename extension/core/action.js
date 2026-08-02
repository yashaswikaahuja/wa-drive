// ═══════════════════════════════════════════════════════════════════════════
// ACTION — how to change the world. (Primitive 3 of 6)
// ═══════════════════════════════════════════════════════════════════════════
// Turns resolved Intents into concrete DOM interactions, delegating to the
// proven execution code (executor's fillFormFieldsSequential + plugins for
// text/dropdown/date, direct toggling for radio/checkbox). The core never
// knows widget internals — capabilities own that. Adding a widget = adding a
// capability, not editing this file.
// ───────────────────────────────────────────────────────────────────────────

(function () {
  if (window.CCAction) return;

  const grp = (t) => (typeof ccTypeGroup === 'function' ? ccTypeGroup(t) : 'text');
  const M = () => window.CCMemory;

  // Build the executor batch (mapping/fbs) + direct toggles from resolutions.
  // resolutions: [{ intent, resolution }]
  function buildPlan(resolutions) {
    const mapping = {};       // executor handles: text, date, native/ng/mat dropdowns
    const fbs = {};           // filledBySource metadata
    const directChecks = [];  // radio / checkbox toggles (executor doesn't set .checked)
    const skipped = [];       // {label, reason}
    const checkpoints = [];   // human-required intents

    for (const { intent, resolution } of resolutions) {
      const f = intent.field;
      if (resolution.status === 'checkpoint') { checkpoints.push({ label: f.label, reason: resolution.reason }); continue; }
      if (resolution.status === 'skip') { skipped.push({ label: f.label, reason: 'rule-skip' }); continue; }
      if (resolution.status !== 'resolved') { skipped.push({ label: f.label, reason: 'unresolved' }); continue; }

      const g = grp(f.type);
      const src = resolution.source || 'engine';

      if (resolution.kind === 'value') {
        mapping[f.selector] = { value: String(resolution.value), type: f.type };
        fbs[f.selector] = { label: f.label, semanticKey: f.id, source: src, confidence: resolution.confidence };

      } else if (resolution.kind === 'option') {
        const optText = resolution.option != null ? resolution.option : resolution.value;
        if (g === 'radio' && Array.isArray(f.optionSelectors)) {
          const optEl = M() ? M().matchOption(optText, f.options || [], { domain: null }) : null;
          const idx = optEl != null ? (f.options || []).indexOf(optEl) : (f.options || []).indexOf(optText);
          const sel = idx >= 0 ? f.optionSelectors[idx] : null;
          if (sel) directChecks.push({ selector: sel, check: true, label: f.label, semanticKey: f.id, source: src });
          else skipped.push({ label: f.label, reason: 'radio-option-not-found' });
        } else {
          // dropdown (native/ng/mat) — executor selects by option text (its plugin matches)
          mapping[f.selector] = { value: String(optText), type: f.type };
          fbs[f.selector] = { label: f.label, semanticKey: f.id, source: src, confidence: resolution.confidence };
        }

      } else if (resolution.kind === 'check') {
        directChecks.push({ selector: f.selector, check: !!resolution.check, label: f.label, semanticKey: f.id, source: src });

      } else if (resolution.kind === 'checkOptions') {
        const sels = f.optionSelectors || [];
        for (const optText of (resolution.options || [])) {
          const idx = (f.options || []).indexOf(optText);
          const sel = idx >= 0 ? sels[idx] : null;
          if (sel) directChecks.push({ selector: sel, check: true, label: f.label, semanticKey: f.id, source: src });
        }
      }
    }
    return { mapping, fbs, directChecks, skipped, checkpoints };
  }

  // Execute a plan: run the executor for value/dropdown fills, then apply the
  // direct radio/checkbox toggles. Returns { records, directRecords }.
  async function execute(plan, formFields, portalAdapters) {
    let records = [];
    if (Object.keys(plan.mapping).length > 0 && typeof fillFormFieldsSequential === 'function') {
      await fillFormFieldsSequential(plan.mapping, plan.fbs, portalAdapters || {}, formFields);
      try { records = JSON.parse(document.body.getAttribute('data-cc-records') || '[]'); } catch { records = []; }
    }
    const directRecords = [];
    for (const dc of plan.directChecks) {
      try {
        const el = document.querySelector(dc.selector);
        if (!el) { directRecords.push({ selector: dc.selector, type: 'toggle', result: 'skipped', failReason: 'not-found', label: dc.label, source: dc.source }); continue; }
        const want = !!dc.check;
        if (el.checked !== want) el.click();
        el.dispatchEvent(new Event('change', { bubbles: true }));
        directRecords.push({ selector: dc.selector, value: want ? 'checked' : 'unchecked', type: 'toggle', result: 'filled', label: dc.label, source: dc.source });
      } catch { /* skip */ }
    }
    return { records: records.concat(directRecords) };
  }

  window.CCAction = { buildPlan, execute };
})();
