/**
 * sequential-kernel-fill — Sequential kernel fill path
 *
 * The default (legacy-best) fill path:
 *   1. Inject SEQUENTIAL_KERNEL_SCRIPTS into tab
 *   2. Extract form fields + derive profile
 *   3. Plan via WSS (30s timeout), HTTPS fallback
 *   4. Execute in page: apply WSS mapping + local fuzzyMatch residual
 *   5. Save session via WSS, HTTPS fallback
 *
 * Depends on: CcScriptManifests, CcFlattenProfile
 *
 * Public API (on globalThis.CcSequentialKernelFill):
 *   run(ctx) => Promise<result>
 *
 * ctx: { tabId, profile, backendUrl, accessToken, runtimeVersion, onProgress }
 *
 * See docs/sequential-kernel-fill.md for full documentation.
 */
(function (root) {
  'use strict';

  async function run(ctx) {
    var tabId          = ctx.tabId;
    var profile        = ctx.profile;
    var backendUrl     = ctx.backendUrl;
    var accessToken    = ctx.accessToken;
    var runtimeVersion = ctx.runtimeVersion;
    var onProgress     = ctx.onProgress;

    var progress = function (t, p) { if (typeof onProgress === 'function') onProgress(t, p); };
    var errors = (typeof globalThis !== 'undefined' && globalThis.CcRuntimeErrors) || null;
    var opMsg = function (code, detail) {
      return errors && errors.operatorMessageFor
        ? errors.operatorMessageFor(code, detail)
        : (detail || code || 'Something went wrong');
    };

    if (!tabId) {
      return { ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null, operatorMessage: opMsg('gateway_error', 'No active tab'), error: 'no_tab' };
    }

    var manifests = (root.CcScriptManifests) || {};
    var SCRIPTS = manifests.SEQUENTIAL_KERNEL_SCRIPTS || [];

    var _fp = root.CcFlattenProfile || {};
    var flat = _fp.flattenProfile ? _fp.flattenProfile(profile) : (profile && (profile.data || profile)) || {};

    // ── Stage 1: Inject + Extract ──────────────────────────────────────────────
    progress('Loading sequential fill kernel...', 25);
    await chrome.scripting.executeScript({ target: { tabId }, files: SCRIPTS.slice() });

    progress('Extracting fields...', 35);
    var extractResults = await chrome.scripting.executeScript({
      target: { tabId },
      args: [flat],
      func: function (prof) {
        if (typeof extractFormFieldsWithFingerprint !== 'function') return { ok: false, error: 'extractor_not_loaded' };
        if (typeof ccDeriveProfile === 'function') {
          try { var d = ccDeriveProfile(prof); if (d && typeof d === 'object') Object.assign(prof, d); } catch (e) {}
        }
        var extracted = extractFormFieldsWithFingerprint();
        var formFields = extracted.formFields, formKey = extracted.formKey, semanticFormKey = extracted.semanticFormKey;
        if (!formFields.length) return { ok: false, error: 'no fields detected' };
        var visible = formFields.filter(function (f) { return f.visible !== false && f.hidden !== true; });
        var fields = (visible.length ? visible : formFields).map(function (f) {
          return { selector: f.selector, id: f.id || '', name: f.name || '', label: f.label || '', type: f.type || 'text', options: f.options || null, optionSelectors: f.optionSelectors || null, placeholder: f.placeholder || '' };
        });
        return { ok: true, fields: fields, profile: prof, formKey: formKey, semanticFormKey: semanticFormKey || formKey, hostname: location.hostname, url: location.href };
      },
    });

    var extracted = extractResults && extractResults[0] && extractResults[0].result;
    if (!extracted || !extracted.ok) {
      return { ok: false, filled: 0, failed: 1, skipped: 0, records: [], observationError: null, operatorMessage: opMsg('gateway_error', (extracted && extracted.error) || 'Extract failed'), error: (extracted && extracted.error) || 'extract_failed' };
    }

    // ── Stage 2: WSS Plan (HTTPS fallback) ────────────────────────────────────
    progress('Planning over WSS...', 50);
    var transport = 'wss';
    var wssPlan = null;
    try {
      var planResp = await new Promise(function (resolve) {
        var timer = setTimeout(function () { resolve({ ok: false, error: 'wss_plan_timeout' }); }, 30000);
        chrome.runtime.sendMessage(
          { type: 'WSS_FILL_REQUEST', formKey: extracted.semanticFormKey || extracted.formKey, semanticFormKey: extracted.semanticFormKey || extracted.formKey, hostname: extracted.hostname, fields: extracted.fields, profile: extracted.profile, profileId: (profile && profile.id) || null },
          function (resp) {
            clearTimeout(timer);
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
            else resolve(resp || { ok: false, error: 'no_response' });
          }
        );
      });
      if (planResp && planResp.ok && planResp.plan) {
        wssPlan = planResp.plan; transport = 'wss';
      } else {
        throw new Error((planResp && planResp.error) || 'wss_plan_failed');
      }
    } catch (e) {
      console.warn('[CC] WSS fill plan failed, HTTPS fallback:', e.message);
      transport = 'https-fallback';
      progress('WSS unavailable — HTTPS fallback...', 52);
      try {
        var headers = { Authorization: 'Bearer ' + accessToken };
        var pk = extracted.semanticFormKey || extracted.formKey;
        var saved = {};
        var mr = await fetch(backendUrl + '/mappings/' + encodeURIComponent(pk), { headers: headers });
        if (mr.ok) saved = await mr.json();
        var adapters = {};
        try {
          var ar = await fetch(backendUrl + '/adapters/' + encodeURIComponent(extracted.hostname), { headers: headers });
          if (ar.ok) adapters = await ar.json();
        } catch (e2) {}
        wssPlan = { mapping: {}, filledBySource: {}, adapters: adapters, savedMappings: saved, transport: 'https-fallback' };
      } catch (e3) {
        return { ok: false, filled: 0, failed: 1, skipped: 0, records: [], observationError: null, operatorMessage: opMsg('gateway_error', 'Plan failed: ' + (e3.message || e.message)), error: 'plan_failed' };
      }
    }

    // Keep WSS hot for fill debug events
    try {
      await new Promise(function (resolve) {
        chrome.runtime.sendMessage({ type: 'ENSURE_WSS' }, function () { resolve(); });
        setTimeout(resolve, 1500);
      });
    } catch (e) {}

    // ── Stage 2a: Materialize taught relations (#302) ─────────────────────────
    // profileKey alone never covers a field. Only a successful relation→value does.
    var relApi = root.CcMappingRelation || {};
    try {
      if (!wssPlan.mapping) wssPlan.mapping = {};
      if (!wssPlan.filledBySource) wssPlan.filledBySource = {};
      if (typeof relApi.materializeSavedRelations === 'function') {
        relApi.materializeSavedRelations(
          extracted.fields,
          extracted.profile,
          wssPlan.savedMappings || {},
          wssPlan.mapping,
          wssPlan.filledBySource,
          'client-saved-relation'
        );
      }
    } catch (relErr) {
      console.warn('[CC] saved-relation materialize skipped:', relErr && relErr.message ? relErr.message : relErr);
    }

    // ── Stage 2b: Server AI for fields not covered by a real planned value ────
    // OpenRouter (extension-service /semantic-map). Mistral is OCR-only on hub.
    // #302: covered ONLY when planned[selector] exists — never because profileKey is saved.
    try {
      var planned = wssPlan.mapping || {};
      var covered = {};
      Object.keys(planned).forEach(function (sel) { covered[sel] = true; });
      var aiCandidates = extracted.fields.filter(function (f) { return !covered[f.selector]; });
      if (aiCandidates.length > 0 && backendUrl && accessToken) {
        progress('AI mapping ' + aiCandidates.length + ' unknown fields...', 58);
        var aiRes = await fetch(backendUrl + '/semantic-map', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: aiCandidates,
            hostname: extracted.hostname,
            formKey: extracted.semanticFormKey || extracted.formKey,
            pageContext: {
              page_url: extracted.url || '',
              page_title: '',
              portal_id: extracted.hostname,
              form_key: extracted.semanticFormKey || extracted.formKey,
            },
          }),
        });
        if (aiRes.ok) {
          var aiData = await aiRes.json();
          var aiMaps = (aiData && aiData.mappings) || [];
          var flatProf = extracted.profile || {};
          if (!wssPlan.mapping) wssPlan.mapping = {};
          if (!wssPlan.filledBySource) wssPlan.filledBySource = {};
          for (var ai = 0; ai < aiMaps.length; ai++) {
            var am = aiMaps[ai];
            if (!am || !am.selector || !am.profile_key) continue;
            if (am.disposition === 'reject') continue;
            if (wssPlan.mapping[am.selector]) continue;
            var fieldMeta = aiCandidates.find(function (f) { return f.selector === am.selector; }) || {};
            // #302: never raw-dump a compound atom onto a part-looking field.
            // Prefer explicit AI projection keys (dob__day) or induce identity only when safe.
            var aiKey = am.profile_key;
            var aiRelation = { kind: 'identity' };
            var pval = null;
            if (aiKey === 'dob__day' || aiKey === 'dob__month' || aiKey === 'dob__year') {
              aiRelation = { kind: 'date_part', part: aiKey.split('__')[1] };
              aiKey = 'dob';
              pval = typeof relApi.applyRelation === 'function'
                ? relApi.applyRelation(aiRelation, flatProf, aiKey, fieldMeta)
                : null;
            } else if (typeof relApi.looksLikePartField === 'function' && typeof relApi.isCompoundAtom === 'function'
              && relApi.looksLikePartField(fieldMeta) && relApi.isCompoundAtom(aiKey)) {
              // Try label-based date_part when AI returned compound dob for a day/month/year widget.
              var lbl = String(fieldMeta.label || '').trim();
              var guessed = null;
              if (/^(dob|date_of_birth)$/i.test(aiKey)) {
                if (/^dd$|^day$/i.test(lbl) || /dob_?day|birth_?day/i.test(lbl)) guessed = { kind: 'date_part', part: 'day' };
                else if (/^mm$|^month$/i.test(lbl) || /dob_?month|birth_?month/i.test(lbl)) guessed = { kind: 'date_part', part: 'month' };
                else if (/^yyyy$|^year$/i.test(lbl) || /dob_?year|birth_?year/i.test(lbl)) guessed = { kind: 'date_part', part: 'year' };
              }
              if (guessed && typeof relApi.applyRelation === 'function') {
                aiRelation = guessed;
                pval = relApi.applyRelation(guessed, flatProf, aiKey === 'date_of_birth' ? 'dob' : aiKey, fieldMeta);
                if (aiKey === 'date_of_birth') aiKey = 'dob';
              } else {
                // Leave for fuzzyMatch / applySplitDob — do not raw-dump
                continue;
              }
            } else {
              pval = flatProf[aiKey];
              if (pval != null && typeof pval === 'object' && 'value' in pval) pval = pval.value;
              if (pval == null || String(pval).trim() === '') continue;
              if (typeof relApi.applyRelation === 'function') {
                var shaped = relApi.applyRelation(aiRelation, flatProf, aiKey, fieldMeta);
                if (shaped == null) continue;
                pval = shaped;
              }
            }
            if (pval == null || String(pval).trim() === '') continue;
            wssPlan.mapping[am.selector] = {
              value: pval,
              type: fieldMeta.type || 'text',
              label: fieldMeta.label || '',
              profileKey: aiKey,
              relation: aiRelation,
            };
            wssPlan.filledBySource[am.selector] = {
              label: fieldMeta.label || '',
              profileKey: aiKey,
              relation: aiRelation,
              source: 'server-ai',
            };
          }
          console.log('[CC] semantic-map strategy=', aiData.strategy, 'applied=', Object.keys(wssPlan.filledBySource).filter(function (k) { return wssPlan.filledBySource[k].source === 'server-ai'; }).length);
        } else {
          console.warn('[CC] semantic-map HTTP', aiRes.status);
        }
      }
    } catch (aiErr) {
      console.warn('[CC] semantic-map skipped:', aiErr && aiErr.message ? aiErr.message : aiErr);
    }

    // ── Stage 3: Execute in page ───────────────────────────────────────────────
    progress('Filling form (sequential)...', 70);
    var execResults = await chrome.scripting.executeScript({
      target: { tabId },
      args: [extracted.profile, extracted.fields, wssPlan.mapping || {}, wssPlan.filledBySource || {}, wssPlan.adapters || {}, (profile && profile.id) || null, transport],
      func: async function (prof, fields, wssMapping, wssFbs, adapters, profileId, fillTransport) {
        if (typeof fillFormFieldsSequential !== 'function') return { ok: false, error: 'sequential_kernel_not_loaded' };
        try { window._ccProfileId = profileId; } catch (e) {}
        var mapping = Object.assign({}, wssMapping || {});
        var fbs = Object.assign({}, wssFbs || {});
        function choiceCovered(f) {
          if (mapping[f.selector]) return true;
          if (f.optionSelectors) { for (var i = 0; i < f.optionSelectors.length; i++) { if (mapping[f.optionSelectors[i]]) return true; } }
          return false;
        }
        // #302: taught relations are materialized on the SW before executeScript.
        // Residual unmapped fields fall through to fuzzyMatch / skip — never raw-dump saved keys here.
        var unmapped = fields.filter(function (f) { return !choiceCovered(f); });
        if (unmapped.length > 0 && typeof fuzzyMatch === 'function') {
          var fz = fuzzyMatch(unmapped, prof);
          for (var sel in (fz || {})) {
            if (mapping[sel]) continue;
            mapping[sel] = fz[sel];
            fbs[sel] = { label: (fz[sel] && fz[sel].label) || '', source: 'label-primary', profileKey: (fz[sel] && fz[sel].profileKey) || null };
          }
        }
        var filledCount = await fillFormFieldsSequential(mapping, fbs, adapters || {}, fields);
        var records = [];
        try { var raw = document.body.getAttribute('data-cc-records'); if (raw) records = JSON.parse(raw); } catch (e) {}
        if (!records.length && Array.isArray(window.__ccFillRecords)) records = window.__ccFillRecords;
        var failed  = records.filter(function (r) { return (r.result === 'failed' || r.result === 'error') || (r.failReason && r.result !== 'skipped' && r.result !== 'waiting_human' && r.result !== 'filled'); }).length;
        var skipped = records.filter(function (r) { return r.result === 'skipped' || r.result === 'waiting_human'; }).length;
        var filled  = records.filter(function (r) { return r.result === 'filled'; }).length || filledCount || 0;
        records = records.map(function (r) { return Object.assign({}, r, { hostname: r.hostname || location.hostname, plannedValue: r.plannedValue != null ? r.plannedValue : r.value, actualValue: r.actualValue != null ? r.actualValue : r.actual, transport: fillTransport }); });
        return { ok: true, filled: filled, failed: failed, skipped: skipped, fields: Object.keys(mapping).length, records: records, hostname: location.hostname, url: location.href, _mapping: mapping, _fbs: fbs, _fields: fields };
      },
    });

    var r = (execResults && execResults[0] && execResults[0].result) || { ok: false, error: 'no_result' };
    if (!r.ok) {
      return { ok: false, filled: 0, failed: 1, skipped: 0, records: [], observationError: null, operatorMessage: opMsg('gateway_error', r.error || 'Sequential fill failed'), error: r.error || 'sequential_failed' };
    }

    // ── Stage 3b: Sync mappings to backend ───────────────────────────────────
    // #302: learn profileKey + relation from successful fills (evidence → relation).
    // Do not persist literal actualValue long-term — only the reusable relationship.
    try {
      var pk = extracted.semanticFormKey || extracted.formKey;
      var syncMapping = r._mapping || {};
      var syncFbs     = r._fbs     || {};
      var syncFields  = r._fields  || [];
      var syncRecords = r.records  || [];
      var syncProfile = extracted.profile || {};
      var updates = {};
      var gsk2 = function (l) { return (l || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(); };
      for (var i = 0; i < syncFields.length; i++) {
        var f = syncFields[i];
        // Catalog key: prefer label, fall back to name/id so fields still appear in Admin Mappings.
        var sk = gsk2(f.label);
        if (!sk || sk.length < 2) sk = gsk2(f.name);
        if (!sk || sk.length < 2) sk = gsk2(f.id);
        if (!sk || sk.length < 2) continue;
        var info = syncFbs[f.selector];
        var mapEntry = syncMapping[f.selector];
        var profileKey = (info && info.profileKey) || (mapEntry && mapEntry.profileKey) || null;
        var filledRec = syncRecords.find(function (rec) { return rec.selector === f.selector && rec.result === 'filled'; });
        var wasFilled = !!filledRec;
        var evidence = null;
        if (filledRec) {
          evidence = filledRec.actualValue != null ? filledRec.actualValue : (filledRec.actual != null ? filledRec.actual : filledRec.plannedValue != null ? filledRec.plannedValue : filledRec.value);
        } else if (mapEntry && mapEntry.value != null) {
          evidence = mapEntry.value;
        }
        var relation = (info && info.relation) || (mapEntry && mapEntry.relation) || null;
        if ((!relation || !relation.kind || relation.kind === 'unknown') && profileKey && typeof relApi.induceRelation === 'function') {
          var induced = relApi.induceRelation(syncProfile, profileKey, evidence, f);
          if (induced && induced.kind && induced.kind !== 'unknown') relation = induced;
          else if (!relation || !relation.kind) relation = induced || { kind: 'unknown' };
        }
        if (!relation || !relation.kind) {
          relation = { kind: 'unknown' };
        }
        // Always seed catalog row (even with null profileKey) so Admin Mappings lists every seen field.
        updates[sk] = {
          profileKey: profileKey,
          relation: relation,
          label: f.label || f.name || f.id || sk,
          type: f.type,
          order: i,
          options: f.options || null,
          delta: { fills: wasFilled ? 1 : 0, corrections: 0 },
        };
      }
      if (Object.keys(updates).length > 0 && backendUrl && accessToken && pk) {
        await fetch(backendUrl + '/mappings/' + encodeURIComponent(pk), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
          body: JSON.stringify({ updates: updates, meta: { hostname: r.hostname || extracted.hostname, title: '', lastSeen: new Date().toISOString().slice(0, 10), syncVersion: 3 } }),
        });
      }
    } catch (e) { console.warn('[CC] mapping sync failed:', e.message); }

    // ── Stage 4: Save session ─────────────────────────────────────────────────
    progress('Saving session over WSS...', 92);
    var sessionId = null;
    var sessionPayload = {
      hostname: r.hostname || extracted.hostname,
      url: r.url || extracted.url,
      semanticFormKey: extracted.semanticFormKey || extracted.formKey,
      formKey: extracted.formKey,
      runtimeVersion: runtimeVersion || '',
      totalFilled: r.filled || 0,
      totalFailed: r.failed || 0,
      totalSkipped: r.skipped || 0,
      records: r.records || [],
    };
    try {
      var sessResp = await new Promise(function (resolve) {
        chrome.runtime.sendMessage(Object.assign({ type: 'WSS_FILL_SESSION' }, sessionPayload), function (resp) {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(resp || { ok: false });
        });
      });
      if (sessResp && sessResp.ok) {
        sessionId = sessResp.id || null;
      } else {
        throw new Error((sessResp && sessResp.error) || 'wss_session_failed');
      }
    } catch (e) {
      console.warn('[CC] WSS session failed, HTTPS fallback:', e.message);
      try {
        var sRes = await fetch(backendUrl + '/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
          body: JSON.stringify(sessionPayload),
        });
        if (sRes.ok) { var body = await sRes.json().catch(function () { return {}; }); sessionId = body.id || null; }
        transport = 'https-fallback';
      } catch (e2) { /* soft */ }
    }

    progress('Fill done (' + transport + '): ' + (r.filled || 0) + ' filled', 100);
    return {
      ok: (r.failed || 0) === 0,
      filled: r.filled || 0,
      failed: r.failed || 0,
      skipped: r.skipped || 0,
      records: r.records || [],
      observationError: null,
      operatorMessage: 'Fill complete: ' + (r.filled || 0) + ' ok, ' + (r.failed || 0) + ' failed, ' + (r.skipped || 0) + ' skipped (' + transport + ')',
      sessionId: sessionId,
      hostname: r.hostname || extracted.hostname || '',
      path: 'sequential-kernel',
      transport: transport,
    };
  }

  root.CcSequentialKernelFill = { run: run };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcSequentialKernelFill;
