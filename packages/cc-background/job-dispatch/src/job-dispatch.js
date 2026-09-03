/**
 * cc-background/job-dispatch — Job dispatch runner for the service worker.
 *
 * Depends on: ccKnowledgeSync, CC_TRUSTED_ONLY_TYPES, isLegacyClientFillAllowed,
 *             legacyClientFillDenied (from cc-background/auth)
 *
 * Public API (on globalThis):
 *   runJobDispatch(envelope, tabId) => Promise<void>
 */

// â”€â”€ Phase A: Job Dispatch Runner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Extension stays dumb: receives envelope, runs deterministic runtime, reports terminal result.
// No knowledge of jobs/customers/mappings/tenancy.
async function runJobDispatch(envelope, tabId) {
  // Defense in depth: even if a caller bypasses message handlers, refuse unless opted in.
  if (!(await isLegacyClientFillAllowed())) {
    const denied = legacyClientFillDenied('runJobDispatch');
    console.warn('[CC]', denied.error);
    return;
  }
  const { jobId, sessionId, payload } = envelope;
  const profile = payload?.profile || {};
  const { backendUrl, accessToken } = await chrome.storage.local.get(['backendUrl', 'accessToken']);
  if (!backendUrl || !accessToken) { console.error('[CC] DISPATCH_JOB: not authenticated'); return; }

  // Helper: report progress to backend
  async function reportProgress(body) {
    try {
      await fetch(backendUrl + '/jobs/' + jobId + '/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
        body: JSON.stringify({ sessionId, ...body }),
      });
    } catch (e) { console.warn('[CC] progress report failed:', e.message); }
  }

  // Inject runtime + run autofill pipeline (reuse existing executor)
  try {
    // Inject cached server field mappings into page for mapper.js to pick up
    if (typeof ccKnowledgeSync !== 'undefined') {
      const cachedMappings = await ccKnowledgeSync.getCachedFieldMappings();
      const cachedDerivRules = await ccKnowledgeSync.getCachedDerivationRules();
      if (cachedMappings.length > 0 || cachedDerivRules.length > 0) {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (mappings, derivRules) => {
            if (mappings.length) window._ccServerFieldMappings = mappings;
            if (derivRules.length) window._ccServerDerivationRules = derivRules;
          },
          args: [cachedMappings, cachedDerivRules],
        });
      }
    }
    await chrome.scripting.executeScript({ target: { tabId }, files: ['shared-bundle.js', 'autofill/plugins-bundle.js', 'drivers-bundle.js', 'autofill/extractor-bundle.js', 'autofill/mapper-bundle.js', 'autofill/executor-bundle.js'] });

    const result = await chrome.scripting.executeScript({
      target: { tabId },
      args: [profile, backendUrl, accessToken],
      func: async (prof, bUrl, aToken) => {
        const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + aToken };
        const { formFields, formKey, semanticFormKey } = extractFormFieldsWithFingerprint();
        if (!formFields.length) return { ok: false, error: 'no fields detected' };
        const pk = semanticFormKey || formKey;
        // Try saved mappings first
        let saved = null;
        try { const r = await fetch(bUrl + '/mappings/' + pk, { headers }); const d = await r.json(); if (d && typeof d === 'object' && Object.keys(d).length > 0) saved = d; } catch {}
        let mapping = {}, fbs = {};
        const gsk = l => (l || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
        // #302: never raw-dump compound atoms onto part-looking fields.
        const partish = (f) => {
          const lbl = String(f.label || '').trim();
          const blob = `${f.label || ''} ${f.name || ''} ${f.id || ''}`.toLowerCase();
          if (/^dd$|^day$|^mm$|^month$|^yyyy$|^year$/i.test(lbl)) return true;
          if (/last\s*4|last\s*digits|dob_?day|dob_?month|dob_?year/i.test(blob)) return true;
          const ml = Number(f.maxLength || f.maxlength || 0);
          return ml > 0 && ml <= 4;
        };
        const compound = (k) => /^(dob|phone|mobile|email|email_id|name|aadhaar_number)$/i.test(String(k || ''));
        const atomOf = (k) => {
          const e = prof[k];
          if (e == null) return null;
          const v = typeof e === 'object' && e && 'value' in e ? e.value : e;
          return v == null || String(v).trim() === '' ? null : String(v).trim();
        };
        if (saved) {
          for (const f of formFields) {
            const sk = gsk(f.label); const s = saved[sk];
            if (!s || !s.profileKey) continue;
            const atom = atomOf(s.profileKey);
            if (!atom) continue;
            const rel = s.relation && s.relation.kind ? s.relation : null;
            // Legacy / unknown on part fields → skip (fuzzyMatch will handle)
            if ((!rel || rel.kind === 'unknown') && partish(f) && compound(s.profileKey)) continue;
            if (rel && rel.kind === 'last_n' && rel.n) {
              mapping[f.selector] = { value: atom.slice(-Number(rel.n)), type: f.type, profileKey: s.profileKey, relation: rel };
            } else if (rel && rel.kind === 'first_n' && rel.n) {
              mapping[f.selector] = { value: atom.slice(0, Number(rel.n)), type: f.type, profileKey: s.profileKey, relation: rel };
            } else if (rel && rel.kind === 'date_part' && rel.part) {
              const m = String(atom).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/) || String(atom).match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
              if (!m) continue;
              const parts = m[1].length === 4
                ? { year: m[1], month: m[2].padStart(2, '0'), day: m[3].padStart(2, '0') }
                : { day: m[1].padStart(2, '0'), month: m[2].padStart(2, '0'), year: m[3] };
              mapping[f.selector] = { value: parts[rel.part], type: f.type, profileKey: s.profileKey, relation: rel };
            } else if (!rel || rel.kind === 'identity') {
              if (partish(f) && compound(s.profileKey)) continue;
              mapping[f.selector] = { value: atom, type: f.type, profileKey: s.profileKey, relation: rel || { kind: 'identity' } };
            } else {
              continue;
            }
            fbs[f.selector] = { label: f.label, semanticKey: sk, profileKey: s.profileKey, relation: mapping[f.selector].relation, source: 'saved' };
          }
        }
        // Fuzzy fill remaining
        const um = formFields.filter(f => !mapping[f.selector]);
        if (um.length > 0) {
          const fz = fuzzyMatch(um, prof);
          for (const [s, v] of Object.entries(fz)) { mapping[s] = v; const ff = formFields.find(x => x.selector === s); if (ff) fbs[s] = { label: ff.label, source: 'fuzzy' }; }
        }
        // Adapters
        let adp = {};
        try { const r = await fetch(bUrl + '/adapters/' + location.hostname, { headers }); adp = await r.json(); } catch {}
        // Run executor (returns total filled)
        const filled = await fillFormFieldsSequential(mapping, fbs, adp);
        const records = Array.isArray(window.__ccFillRecords) ? window.__ccFillRecords : [];
        const failed = records.filter(r => r.result === 'skipped' || r.result === 'failed' || r.result === 'reset').length;
        // Sync mappings â€” labels, types, order, options (same as popup path)
        try {
          const updates = {};
          for (let i = 0; i < formFields.length; i++) {
            const f = formFields[i];
            const sk = gsk(f.label);
            if (!sk || sk.length < 2) continue;
            const info = fbs[f.selector];
            const profileKey = info?.profileKey || mapping[f.selector]?.profileKey || (mapping[f.selector] ? Object.entries(prof).find(([,v]) => v === mapping[f.selector].value)?.[0] : null) || null;
            const wasFilled = records.some(r => r.selector === f.selector && r.result === 'filled');
            const relation = info?.relation || mapping[f.selector]?.relation || (profileKey ? { kind: partish(f) && compound(profileKey) ? 'unknown' : 'identity' } : { kind: 'unknown' });
            updates[sk] = { profileKey, relation, label: f.label, type: f.type, order: i, options: f.options || null, delta: { fills: wasFilled ? 1 : 0, corrections: 0 } };
          }
          if (Object.keys(updates).length > 0) {
            await fetch(bUrl + '/mappings/' + pk, {
              method: 'POST', headers,
              body: JSON.stringify({ updates, meta: { hostname: location.hostname, title: document.title.slice(0, 80), lastSeen: new Date().toISOString().slice(0, 10), syncVersion: 2 } }),
            });
          }
        } catch (e) { console.warn('[CC] bg mapping sync failed:', e.message); }
        return { ok: true, filled: filled || 0, failed, fields: Object.keys(mapping).length, records, primaryKey: pk };
      },
    });

    const r = result?.[0]?.result || { ok: false };
    if (r.ok) {
      // Report final state â€” runtime done, transition to needs_review
      await reportProgress({
        totalFilled: r.filled,
        totalFailed: r.failed,
        records: r.records || [],
        status: 'needs_review',
      });
      console.log('[CC] DISPATCH_JOB completed: filled=' + r.filled + ' failed=' + r.failed);
    } else {
      await reportProgress({ status: 'failed', failReason: r.error || 'execution failed' });
      console.error('[CC] DISPATCH_JOB failed:', r.error);
    }
  } catch (e) {
    await reportProgress({ status: 'failed', failReason: e.message });
    console.error('[CC] DISPATCH_JOB exception:', e);
  }
}






chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  // T4: (re)open WSS when credentials appear or rotate
  if (changes.accessToken || changes.backendUrl) {
    if (changes.accessToken?.newValue === undefined && changes.backendUrl?.newValue === undefined) {
      // both cleared
    }
    const tokenGone = changes.accessToken && changes.accessToken.newValue == null;
    if (tokenGone && typeof CcWssSession !== 'undefined') {
      CcWssSession.disconnectWss('logout');
    } else {
      ccEnsureWss('storage_credentials');
    }
  }
  if (!changes._cc_teach_job?.newValue) return;
  const job = changes._cc_teach_job.newValue;
  // Deduplicate: same timestamp = same job, ignore
  if (job.ts === _lastTeachTs) return;
  if (_teachRunning) return;
  _lastTeachTs = job.ts;
  console.log('[CC] SW teach job received:', job.hostname, job.fields?.length, 'fields, tabId:', job.tabId);
  chrome.storage.local.set({_cc_teach_debug: 'received:' + job.hostname + ':' + job.fields?.length + ':tab:' + job.tabId});
  // If tabId is missing, find the tab by hostname (resolved inside runTeachSession which is async)
  chrome.storage.local.remove('_cc_teach_job');
  runTeachSession(job).catch(console.error);
});

// Keep service worker alive during long teach sessions (SW dies after 30s idle)
function startKeepalive() {
  if (_keepaliveInterval) return;
  _keepaliveInterval = setInterval(() => chrome.storage.local.set({ _sw_ping: Date.now() }), 20000);
}
function stopKeepalive() {
  clearInterval(_keepaliveInterval);
  _keepaliveInterval = null;
}
