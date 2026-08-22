/**
 * AUTO-GENERATED — do not edit.
 * Source: application/orchestrator/capabilities/*.js + fill-orchestrator.js (facade)
 * Rebuild: node extension/application/build-orchestrator-bundle.mjs
 */

/* ==== script-manifests.js ==== */
/**
 * script-manifests — Injection script lists for the sequential fill path
 *
 * SEQUENTIAL_KERNEL_SCRIPTS — scripts injected into the page for autofill
 *
 * Public API (on globalThis.CcScriptManifests):
 *   SEQUENTIAL_KERNEL_SCRIPTS
 */
(function (root) {
  'use strict';

  var SEQUENTIAL_KERNEL_SCRIPTS = Object.freeze([
    'shared-bundle.js',           // @cc/shared — dom-utils, option-match, network-idle
    'autofill/plugins-bundle.js', // @cc/plugins — interface, cascade-select, ng-dropdown, keystroke
    'drivers-bundle.js',          // @cc/drivers — dispatch, dom, input, select, interaction
    'autofill/extractor-bundle.js', // @cc/extractor
    'autofill/mapper-bundle.js',    // @cc/mapper
    'autofill/executor-bundle.js',  // @cc/executor
  ]);

  root.CcScriptManifests = {
    SEQUENTIAL_KERNEL_SCRIPTS: SEQUENTIAL_KERNEL_SCRIPTS,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcScriptManifests;

/* ==== flatten-profile.js ==== */
/**
 * flatten-profile — Profile data flattener
 *
 * Converts a nested profile (profile.data or profile) where values may be
 * { value: ... } objects into a flat { key: value } map for use by the
 * sequential fill kernel.
 *
 * Public API (on globalThis.CcFlattenProfile):
 *   flattenProfile(profile) => flat object
 *
 * See docs/flatten-profile.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * @param {object} profile — raw profile, may have .data or { value } wrappers
   * @returns {object} flat key→value map
   */
  function flattenProfile(profile) {
    var flat = {};
    var raw = (profile && (profile.data || profile)) || {};
    for (var k in raw) {
      var v = raw[k];
      flat[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
    }
    if (profile && profile.name) flat.name = flat.name || profile.name;
    return flat;
  }

  root.CcFlattenProfile = { flattenProfile: flattenProfile };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcFlattenProfile;

/* ==== sequential-kernel-fill.js ==== */
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

    // ── Stage 3: Execute in page ───────────────────────────────────────────────
    progress('Filling form (sequential)...', 70);
    var execResults = await chrome.scripting.executeScript({
      target: { tabId },
      args: [extracted.profile, extracted.fields, wssPlan.mapping || {}, wssPlan.filledBySource || {}, wssPlan.adapters || {}, wssPlan.savedMappings || {}, (profile && profile.id) || null, transport],
      func: async function (prof, fields, wssMapping, wssFbs, adapters, saved, profileId, fillTransport) {
        if (typeof fillFormFieldsSequential !== 'function') return { ok: false, error: 'sequential_kernel_not_loaded' };
        try { window._ccProfileId = profileId; } catch (e) {}
        var mapping = Object.assign({}, wssMapping || {});
        var fbs = Object.assign({}, wssFbs || {});
        var gsk = function (l) { return (l || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(); };
        var isChoiceType = function (t) { return /radio|checkbox/i.test(String(t || '')); };
        function choiceCovered(f) {
          if (mapping[f.selector]) return true;
          if (f.optionSelectors) { for (var i = 0; i < f.optionSelectors.length; i++) { if (mapping[f.optionSelectors[i]]) return true; } }
          return false;
        }
        if (saved && Object.keys(mapping).length === 0) {
          for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            var sk = gsk(f.label);
            var s = saved[sk] || saved[gsk(f.name)] || null;
            if (!s) continue;
            if (s.profileKey && prof[s.profileKey] != null && String(prof[s.profileKey]).trim() !== '') {
              if (isChoiceType(f.type) && typeof resolveChoiceToOption === 'function') {
                var resolved = resolveChoiceToOption(f, prof[s.profileKey], s.profileKey);
                if (resolved) { mapping[resolved.selector] = resolved.entry; fbs[resolved.selector] = { label: f.label, profileKey: s.profileKey, source: 'https-saved' }; }
              } else {
                mapping[f.selector] = { value: prof[s.profileKey], type: f.type, label: f.label, profileKey: s.profileKey };
                fbs[f.selector] = { label: f.label, profileKey: s.profileKey, source: 'https-saved' };
              }
            }
          }
        }
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
    // Post form field metadata + profileKey mappings so the backend learns
    // new forms. This is what makes new forms appear in the mapping portal.
    try {
      var pk = extracted.semanticFormKey || extracted.formKey;
      var syncMapping = r._mapping || {};
      var syncFbs     = r._fbs     || {};
      var syncFields  = r._fields  || [];
      var syncRecords = r.records  || [];
      var updates = {};
      var gsk2 = function (l) { return (l || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(); };
      for (var i = 0; i < syncFields.length; i++) {
        var f = syncFields[i];
        var sk = gsk2(f.label);
        if (!sk || sk.length < 2) continue;
        var info = syncFbs[f.selector];
        var profileKey = (info && info.profileKey) || (syncMapping[f.selector] && syncMapping[f.selector].profileKey) || null;
        var wasFilled = syncRecords.some(function (rec) { return rec.selector === f.selector && rec.result === 'filled'; });
        updates[sk] = { profileKey: profileKey, label: f.label, type: f.type, order: i, options: f.options || null, delta: { fills: wasFilled ? 1 : 0, corrections: 0 } };
      }
      if (Object.keys(updates).length > 0 && backendUrl && accessToken && pk) {
        await fetch(backendUrl + '/mappings/' + encodeURIComponent(pk), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
          body: JSON.stringify({ updates: updates, meta: { hostname: r.hostname || extracted.hostname, title: '', lastSeen: new Date().toISOString().slice(0, 10), syncVersion: 2 } }),
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

/* ==== action-plan-fill.js ==== */
/**
 * action-plan-fill — ActionPlan (APE) fill path
 *
 * Product DYNAMIC fill path:
 *   1. Inject PRODUCT_PATH_SCRIPTS if not already loaded
 *   2. Seed navigation origin allowlist
 *   3. Perceive page via CcPerception
 *   4. POST /fill-plan → get ActionPlan
 *   5. Execute via CcActionPlanExecutor (+ DOM evidence)
 *   6. POST /fill-observation
 *   7. POST /sessions
 *
 * Depends on: CcScriptManifests, CcFlattenProfile
 *
 * Public API (on globalThis.CcActionPlanFill):
 *   run(ctx) => Promise<result>
 *
 * See docs/action-plan-fill.md for full documentation.
 */
(function (root) {
  'use strict';

  async function run(ctx) {
    var tabId              = ctx.tabId;
    var profile            = ctx.profile;
    var backendUrl         = ctx.backendUrl;
    var accessToken        = ctx.accessToken;
    var runtimeVersion     = ctx.runtimeVersion;
    var executionPreference = ctx.executionPreference;
    var onProgress         = ctx.onProgress;

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

    var manifests = root.CcScriptManifests || {};
    var PRODUCT_SCRIPTS = manifests.PRODUCT_PATH_SCRIPTS || [];

    var _fp = root.CcFlattenProfile || {};
    var flatProfile = _fp.flattenProfile ? _fp.flattenProfile(profile) : (profile && (profile.data || profile)) || {};

    progress('Perceiving page structure...', 30);

    // Inject product scripts if not already loaded
    var loadedCheck = await chrome.scripting.executeScript({
      target: { tabId },
      func: function () {
        return !!(globalThis.CcDomGateway && globalThis.CcBindingRegistry && globalThis.CcPerception && globalThis.CcActionPlanExecutor);
      },
    });
    if (!loadedCheck[0].result) {
      await chrome.scripting.executeScript({ target: { tabId }, files: PRODUCT_SCRIPTS.slice() });
    }

    // Seed navigation origin allowlist
    try {
      var allowStore = await chrome.storage.local.get('navigationOriginAllowlist');
      var originAllowlist = Array.isArray(allowStore.navigationOriginAllowlist)
        ? allowStore.navigationOriginAllowlist.filter(function (x) { return typeof x === 'string' && x.length > 0; })
        : [];
      await chrome.scripting.executeScript({
        target: { tabId },
        func: function (list) {
          if (globalThis.CcNavigationContract && globalThis.CcNavigationContract.setOriginAllowlist) {
            globalThis.CcNavigationContract.setOriginAllowlist(list);
          } else {
            globalThis.__ccNavigationOriginAllowlist = Array.isArray(list) ? list : [];
          }
        },
        args: [originAllowlist],
      });
    } catch (e) {
      console.warn('[CC] navigation origin allowlist seed failed:', e.message);
    }

    // Perceive
    var percResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: async function () {
        try {
          if (typeof CcPerception === 'undefined') return { error: 'CcPerception not loaded' };
          if (typeof CcDomGateway === 'undefined') return { error: 'CcDomGateway not loaded' };
          if (typeof CcContextDiscovery !== 'undefined' && CcContextDiscovery.resetContextCounter) CcContextDiscovery.resetContextCounter();
          if (typeof CcNodeFactory !== 'undefined' && CcNodeFactory.resetNodeCounter) CcNodeFactory.resetNodeCounter();
          await CcPerception.initPerception({
            gateway: CcDomGateway,
            bindingRegistry: new CcBindingRegistry(),
            revisionManager: new CcRevisionManager(),
            privacyFilter: CcPrivacyFilter,
            widgetClassifier: CcWidgetClassifier,
            contextDiscovery: CcContextDiscovery,
            nodeFactory: CcNodeFactory,
            edgeFactory: CcEdgeFactory,
            canonicalHash: CcCanonicalHash,
            snapshotBuilder: CcSnapshotBuilder,
            validator: CcValidator,
            validatorOptions: { schema: null },
          });
          if (CcValidator && !CcValidator.isInitialized()) await CcValidator.initValidator({ schema: null });
          return await CcPerception.perceivePage({ mode: 'snapshot', includeGeometry: true });
        } catch (err) {
          return { error: err.message, stack: (err.stack || '').slice(0, 300) };
        }
      },
    });

    var pageSnapshot = percResults && percResults[0] && percResults[0].result;
    if (!pageSnapshot || pageSnapshot.kind !== 'page_snapshot') {
      return { ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null, operatorMessage: opMsg('gateway_error', 'Perception failed'), error: String((pageSnapshot && pageSnapshot.error) || 'perception_failed').slice(0, 120) };
    }

    // Plan
    progress('Server planning fill...', 55);
    var planResponse = await fetch(backendUrl + '/fill-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify({ snapshot: pageSnapshot, profileId: profile.id, operator_execution_preference: executionPreference || 'AUTO', profile: flatProfile }),
    });
    if (!planResponse.ok) {
      return { ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null, operatorMessage: opMsg('gateway_error', 'Server plan failed'), error: 'plan_http_' + planResponse.status, pageSnapshot: pageSnapshot };
    }
    var planBody = await planResponse.json();
    var plan = planBody.plan || planBody.action_plan || planBody;
    if (!plan || !plan.steps || plan.steps.length === 0) {
      return { ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null, operatorMessage: 'No fields could be mapped for this form.', error: 'empty_plan', pageSnapshot: pageSnapshot };
    }

    // Execute
    progress('Executing ' + plan.steps.length + ' steps...', 70);
    var execResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: async function (actionPlan) {
        if (!globalThis.CcActionPlanExecutor || !globalThis.CcActionPlanExecutor.execute) throw new Error('ActionPlan executor not loaded');
        if (typeof globalThis.ccExecutor === 'function' || globalThis.__ccLegacyFillActive) throw new Error('Legacy fill path must not run with ActionPlan v3');
        if (globalThis.CcDomEvidence && globalThis.CcDomEvidence.startObserving) {
          var registry = globalThis.CcPerception && globalThis.CcPerception.getBindingRegistry && globalThis.CcPerception.getBindingRegistry();
          globalThis.CcDomEvidence.startObserving(actionPlan, registry);
        }
        var observation;
        try {
          observation = await globalThis.CcActionPlanExecutor.execute(actionPlan);
        } finally {
          if (globalThis.CcDomEvidence && globalThis.CcDomEvidence.stopObserving) {
            globalThis.CcDomEvidence.stopObserving();
            var evidence = (globalThis.CcDomEvidence.getEvidence && globalThis.CcDomEvidence.getEvidence()) || [];
            if (evidence.length > 0 && observation) observation.dom_evidence = evidence;
          }
        }
        return observation;
      },
      args: [plan],
    });

    var executionObservation = execResults && execResults[0] && execResults[0].result;
    if (!executionObservation || executionObservation.kind !== 'execution_observation') {
      return { ok: false, filled: 0, failed: 0, skipped: 0, records: [], observationError: null, operatorMessage: opMsg('gateway_error', 'Execution failed'), error: 'invalid_observation', pageSnapshot: pageSnapshot, plan: plan };
    }

    // Report observation
    var observationError = null;
    try {
      var query = new URLSearchParams({ plan_id: plan.plan_id || '', correlation_id: plan.correlation_id || '', runtimeVersion: runtimeVersion || '' });
      var reportResponse = await fetch(backendUrl + '/fill-observation?' + query.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify(executionObservation),
      });
      if (!reportResponse.ok) observationError = 'HTTP ' + reportResponse.status;
    } catch (e) { observationError = e.message; }

    var stepResults = executionObservation.steps || [];
    var filled  = stepResults.filter(function (r) { return r.status === 'succeeded'; }).length;
    var failed  = stepResults.filter(function (r) { return r.status === 'failed'; }).length;
    var skipped = stepResults.filter(function (r) { return r.status === 'skipped'; }).length;

    var resultByStep = new Map(stepResults.map(function (r) { return [r.step_id, r]; }));
    var hostFromSnap = (function () {
      try { var origin = (pageSnapshot.page && pageSnapshot.page.origin) || (pageSnapshot.page && pageSnapshot.page.url) || ''; return origin ? new URL(origin).hostname : ''; } catch (e) { return ''; }
    }());

    var records = (plan.steps || []).map(function (step) {
      var result = resultByStep.get(step.step_id);
      var planned = (step.action && step.action.value != null) ? step.action.value : ((step.action && step.action.text != null) ? step.action.text : '');
      var actual = (result && result.observed_value_state) || (result && result.actual_value) || (result && result.actualValue) || null;
      return { label: step.target && step.target.node_id || step.step_id, result: result && result.status === 'succeeded' ? 'filled' : ((result && result.status) || 'skipped'), value: planned, plannedValue: planned, actualValue: actual, failReason: (result && result.failure_code) || null, source: 'server-plan', fillMode: 'sequential-ape', hostname: hostFromSnap, verified: result && result.postcondition_met === true };
    });

    // Session
    var sessionId = null;
    try {
      var sessRes = await fetch(backendUrl + '/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
        body: JSON.stringify({ hostname: hostFromSnap, url: (pageSnapshot.page && pageSnapshot.page.url) || (pageSnapshot.page && pageSnapshot.page.origin) || '', semanticFormKey: (pageSnapshot.page && pageSnapshot.page.route_key) || null, runtimeVersion: runtimeVersion || '', totalFilled: filled, totalFailed: failed, totalSkipped: skipped, records: records }),
      });
      if (sessRes.ok) { var sb = await sessRes.json().catch(function () { return {}; }); sessionId = sb.id || null; }
    } catch (e) { console.warn('[CC] session post failed:', e.message); }

    var operatorMessage = null;
    if (executionObservation.outcome === 'rejected' || executionObservation.outcome === 'aborted') {
      operatorMessage = opMsg(executionObservation.rejection_reason || 'plan rejected', null);
    } else if (observationError) {
      operatorMessage = 'Fields changed, but session evidence was not saved.';
    } else {
      operatorMessage = 'Fill complete: ' + filled + ' ok, ' + failed + ' failed, ' + skipped + ' skipped';
    }

    return {
      ok: failed === 0 && executionObservation.outcome !== 'aborted' && executionObservation.outcome !== 'rejected',
      pageSnapshot: pageSnapshot, plan: plan, executionObservation: executionObservation,
      filled: filled, failed: failed, skipped: skipped, records: records,
      observationError: observationError, operatorMessage: operatorMessage,
      sessionId: sessionId, hostname: hostFromSnap,
    };
  }

  root.CcActionPlanFill = { run: run };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcActionPlanFill;

/* ==== fill-orchestrator.js (facade) ==== */
