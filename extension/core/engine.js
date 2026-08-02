// ═══════════════════════════════════════════════════════════════════════════
// ENGINE — the six-primitive orchestrator.
// ═══════════════════════════════════════════════════════════════════════════
//   WORLD (perceive) → GOAL (decompose) → MEMORY (recall) → JUDGMENT (decide)
//   → [escalate: fuzzy → AI → operator] → ACTION (execute) → OBSERVATION (learn)
//
// Single entry point for both popup and background. Reuses the proven code:
//   extractor, derive, rule-engine, mapper(fuzzy/aiMatch), ai-resolve,
//   executor + plugins. This file is orchestration only — no widget logic.
// ───────────────────────────────────────────────────────────────────────────

(function () {
  if (window.CCEngine) return;

  async function run(ctx) {
    // ctx: { profile, backendUrl, accessToken, groqKey, llmBaseUrl, llmModel }
    const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ctx.accessToken };
    const log = (...a) => console.log('[CCEngine]', ...a);

    // 1. WORLD — perceive customer + page
    const customer = window.CCWorld.describeCustomer(ctx.profile);
    const extracted = extractFormFieldsWithFingerprint();
    const page = window.CCWorld.describePage(extracted);
    const formFields = page.raw;
    if (!formFields.length) return { ok: false, error: 'No form fields detected' };
    log('perceived', formFields.length, 'fields; derived:', (customer.derived || []).join(',') || 'none');

    // 2. MEMORY — load knowledge for this form
    const memStats = await window.CCMemory.load(ctx.backendUrl, headers, page.interface.formKey);
    log('memory:', memStats);

    // 3. GOAL — decompose into intents
    const intents = window.CCGoal.deriveIntents(page);

    // 4. JUDGMENT — deterministic resolution per intent
    const resolutions = intents.map(intent => ({ intent, resolution: window.CCJudgment.resolve(intent, customer, window.CCMemory) }));

    // 5. ESCALATION — batch fuzzy → AI for the unresolved
    const unresolved = () => resolutions.filter(r => r.resolution.status === 'unresolved');

    // 5a. FUZZY (mapper.js) — operates on raw formFields, returns {selector:{value,type}}
    const uFields1 = unresolved().map(r => r.intent.field.raw || rawOf(r.intent.field, formFields)).filter(Boolean);
    if (uFields1.length && typeof fuzzyMatch === 'function') {
      try {
        const fz = fuzzyMatch(uFields1, customer.records) || {};
        applyBatch(fz, 'fuzzy');
        log('fuzzy resolved', Object.keys(fz).length);
      } catch (e) { log('fuzzy failed:', e.message); }
    }

    // 5b. AI RESOLVE (ai-resolve.js) — reasoning for still-unresolved
    const stillPending = unresolved().map(r => {
      const f = r.intent.field;
      return { selector: f.selector, label: f.label, type: f.type, options: f.options || null, placeholder: f.placeholder || '' };
    }).filter(p => !/captcha|otp|password|verification code/i.test(p.label));
    if (stillPending.length && ctx.groqKey && typeof ccAiResolveValues === 'function') {
      try {
        const rp = ccAiResolveValues(stillPending, customer.records, ctx.groqKey, ctx.llmBaseUrl, ctx.llmModel);
        const to = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000));
        const resolved = await Promise.race([rp, to]);
        const asBatch = {};
        for (const [sel, info] of Object.entries(resolved)) asBatch[sel] = { value: info.value, type: (info.kind === 'option' ? 'dropdown' : 'text') };
        applyBatch(asBatch, 'ai-resolve');
        log('ai-resolve resolved', Object.keys(resolved).length);
      } catch (e) { log('ai-resolve skipped:', e.message); }
    }

    // 6. ACTION — execute the resolved plan
    let adapters = {};
    try { const r = await fetch(ctx.backendUrl + '/adapters/' + location.hostname, { headers }); adapters = await r.json(); } catch {}
    const plan = window.CCAction.buildPlan(resolutions);
    const { records } = await window.CCAction.execute(plan, formFields, adapters);

    // 7. OBSERVATION — summarize + learning signals
    const summary = window.CCObservation.summarize(records, resolutions, plan);
    const mappingUpdates = window.CCObservation.buildMappingSync(resolutions, records);
    log('result:', summary.filled + '/' + summary.total, 'filled;', summary.checkpoints, 'checkpoints;', summary.unresolved, 'unresolved');

    return {
      ok: true,
      summary,
      records,
      syncUpdates: mappingUpdates,
      syncFormKey: page.interface.formKey,
      syncTitle: page.interface.title,
      syncHost: page.interface.hostname,
      checkpoints: plan.checkpoints,
    };

    // ── helpers ───────────────────────────────────────────────────────────
    function rawOf(field, all) { return all.find(f => f.selector === field.selector) || null; }
    function applyBatch(batch, source) {
      for (const [selector, val] of Object.entries(batch)) {
        const r = resolutions.find(x => x.intent.field.selector === selector && x.resolution.status === 'unresolved');
        if (!r) continue;
        const g = (typeof ccTypeGroup === 'function') ? ccTypeGroup(r.intent.field.type) : 'text';
        r.resolution = {
          status: 'resolved',
          kind: (g === 'dropdown' || g === 'radio') ? 'option' : 'value',
          value: val.value, option: val.value,
          source, confidence: 0.4,
        };
      }
    }
  }

  window.CCEngine = { run };
})();
