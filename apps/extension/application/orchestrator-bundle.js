/**
 * AUTO-GENERATED — do not edit.
 * Source: @cc/orchestrator
 * Rebuild: pnpm --filter cybercontrol-extension build
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

/* ==== mapping-relation.js ==== */
/**
 * mapping-relation — browser/SW copy of @cc/mapper/mapping-relation (#302).
 * Keep behavior aligned with packages/cc-mapper/src/mapping-relation.js
 */
(function (root) {
  'use strict';

  var MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function parseDobParts(dob) {
    if (dob == null) return null;
    var dobStr = String(dob).trim();
    if (!dobStr) return null;
    var m1 = dobStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    var m2 = dobStr.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (m1) return { day: m1[1].padStart(2, '0'), month: m1[2].padStart(2, '0'), year: m1[3] };
    if (m2) return { day: m2[3].padStart(2, '0'), month: m2[2].padStart(2, '0'), year: m2[1] };
    return null;
  }

  function profileAtom(profile, key) {
    if (!profile || key == null) return null;
    var entry = profile[key];
    if (entry == null) return null;
    var v = typeof entry === 'object' && entry && 'value' in entry ? entry.value : entry;
    if (v == null) return null;
    var s = String(v).trim();
    return s === '' ? null : s;
  }

  function normLoose(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function fieldBlob(field) {
    if (!field || typeof field !== 'object') return '';
    return (field.label || '') + ' ' + (field.name || '') + ' ' + (field.id || '') + ' ' + (field.placeholder || '');
  }

  function isCompoundAtom(profileKey) {
    return /^(dob|date_of_birth|phone|mobile|email|email_id|name|full_name|aadhaar_number|aadhaar|pan_number)$/i.test(String(profileKey || ''));
  }

  function looksLikePartField(field) {
    var blob = fieldBlob(field).toLowerCase();
    var label = String(field && field.label || '').trim();
    if (/^dd$|^day$|^mm$|^month$|^yyyy$|^yyy$|^year$/i.test(label)) return true;
    if (/\b(dob_?day|birth_?day|day_of_birth|ddl_?day)\b/.test(blob)) return true;
    if (/\b(dob_?month|birth_?month|month_of_birth|ddl_?month)\b/.test(blob)) return true;
    if (/\b(dob_?year|birth_?year|year_of_birth|ddl_?year)\b/.test(blob)) return true;
    if (/last\s*4|last\s*four|last\s*6|first\s*4|first\s*3|last\s*digits|otp|suffix/i.test(blob)) return true;
    if (/email\s*(user|id|name)|username|local.?part/i.test(blob)) return true;
    return false;
  }

  function shapeCompatible(field, value) {
    if (value == null) return false;
    var s = String(value);
    var maxLen = Number(field && (field.maxLength || field.maxlength) || 0);
    if (maxLen > 0 && s.length > maxLen) return false;
    return true;
  }

  function normalizeRelation(entry, field) {
    if (entry && entry.relation && entry.relation.kind) return Object.assign({}, entry.relation);
    var pk = entry && entry.profileKey;
    if (!pk) return { kind: 'unknown' };
    if (looksLikePartField(field) && isCompoundAtom(pk)) return { kind: 'unknown' };
    return { kind: 'identity' };
  }

  function applyDatePart(atom, part, field) {
    var dp = parseDobParts(atom);
    if (!dp) return null;
    var monthNum = parseInt(dp.month, 10) || 0;
    if (part === 'day') {
      var preferPadded = /^dd$/i.test(String(field && field.label || '')) || /^dd$/i.test(String(field && field.placeholder || '')) || (field && field.type || '') === 'text';
      return preferPadded ? dp.day : String(parseInt(dp.day, 10));
    }
    if (part === 'month') {
      var t = String(field && field.type || '').toLowerCase();
      if (t === 'select' || t === 'dropdown' || t === 'mat-select' || t === 'ng-dropdown') return MONTH_NAMES[monthNum] || dp.month;
      return dp.month;
    }
    if (part === 'year') return dp.year;
    return null;
  }

  function applyRelation(relation, profile, profileKey, field) {
    var kind = (relation && relation.kind) || 'unknown';
    if (kind === 'unknown') return null;
    var atom = profileAtom(profile, profileKey);
    if (atom == null) return null;
    var value = null;
    if (kind === 'identity') value = atom;
    else if (kind === 'last_n') {
      var n1 = Math.max(1, Number(relation.n) || 0);
      if (!n1 || atom.length < n1) return null;
      value = atom.slice(-n1);
    } else if (kind === 'first_n') {
      var n2 = Math.max(1, Number(relation.n) || 0);
      if (!n2 || atom.length < n2) return null;
      value = atom.slice(0, n2);
    } else if (kind === 'date_part') value = applyDatePart(atom, relation.part, field);
    else if (kind === 'email_local') {
      var at = atom.indexOf('@');
      if (at <= 0) return null;
      value = atom.slice(0, at);
    } else if (kind === 'name_part') {
      var parts = atom.split(/\s+/).filter(Boolean);
      if (!parts.length) return null;
      if (relation.part === 'first') value = parts[0];
      else if (relation.part === 'last') value = parts[parts.length - 1];
      else if (relation.part === 'middle') value = parts.length >= 3 ? parts.slice(1, -1).join(' ') : '';
      else return null;
    } else return null;
    if (value == null || String(value).trim() === '') return null;
    if (!shapeCompatible(field, value)) return null;
    return String(value);
  }

  function induceRelation(profile, profileKey, actualOrPlanned, field) {
    if (!profileKey) return { kind: 'unknown' };
    var atom = profileAtom(profile, profileKey);
    var sample = actualOrPlanned == null ? '' : String(actualOrPlanned).trim();
    if (!atom || !sample) {
      if (looksLikePartField(field) && isCompoundAtom(profileKey)) return { kind: 'unknown' };
      return profileKey ? { kind: 'identity' } : { kind: 'unknown' };
    }
    if (normLoose(sample) === normLoose(atom) && shapeCompatible(field, atom)) return { kind: 'identity' };
    var blob = fieldBlob(field);
    var partish = looksLikePartField(field);
    var dateish = partish || /\b(date|dob|birth|day|month|year|dd|mm|yyyy)\b/i.test(blob);
    var nameish = partish || /\b(name|first|middle|last|surname|fname|lname)\b/i.test(blob);
    var sliceish = partish || /last\s*\d|first\s*\d|last\s*digit|suffix|prefix/i.test(blob);
    var dp = parseDobParts(atom);
    if (dp && dateish) {
      var sn = normLoose(sample);
      var dayN = String(parseInt(dp.day, 10));
      var monthN = String(parseInt(dp.month, 10));
      if (sn === normLoose(dp.day) || sn === normLoose(dayN)) return { kind: 'date_part', part: 'day', pad: dp.day.indexOf('0') === 0 ? 2 : undefined };
      if (sn === normLoose(dp.month) || sn === normLoose(monthN) || sn === normLoose(MONTH_NAMES[parseInt(dp.month, 10)] || '')) return { kind: 'date_part', part: 'month' };
      if (sn === normLoose(dp.year)) return { kind: 'date_part', part: 'year' };
    }
    if (atom.indexOf('@') > 0 && (partish || /email|user|local/i.test(blob))) {
      var local = atom.slice(0, atom.indexOf('@'));
      if (normLoose(sample) === normLoose(local)) return { kind: 'email_local' };
    }
    if (sliceish) {
      if (atom.lastIndexOf(sample) === atom.length - sample.length && sample.length < atom.length && sample.length <= 8) return { kind: 'last_n', n: sample.length };
      if (atom.indexOf(sample) === 0 && sample.length < atom.length && sample.length <= 8) return { kind: 'first_n', n: sample.length };
    }
    if (nameish) {
      var nameParts = atom.split(/\s+/).filter(Boolean);
      if (nameParts.length >= 2) {
        if (normLoose(sample) === normLoose(nameParts[0])) return { kind: 'name_part', part: 'first' };
        if (normLoose(sample) === normLoose(nameParts[nameParts.length - 1])) return { kind: 'name_part', part: 'last' };
      }
    }
    return { kind: 'unknown' };
  }

  function gsk(l) {
    return String(l || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  function materializeSavedRelations(fields, profile, savedMap, mapping, filledBySource, sourceTag) {
    if (!savedMap || typeof savedMap !== 'object') return 0;
    var added = 0;
    var map = mapping || {};
    var fbs = filledBySource || {};
    for (var i = 0; i < (fields || []).length; i++) {
      var f = fields[i];
      if (!f || !f.selector || map[f.selector]) continue;
      if (/radio|checkbox/i.test(String(f.type || ''))) continue;
      var entry = savedMap[gsk(f.label)] || savedMap[gsk(f.name)] || null;
      if (!entry || !entry.profileKey) continue;
      var relation = normalizeRelation(entry, f);
      var value = applyRelation(relation, profile, entry.profileKey, f);
      if (value == null) continue;
      map[f.selector] = { value: value, type: f.type, label: f.label, profileKey: entry.profileKey, relation: relation, matchBy: sourceTag || 'saved-relation' };
      fbs[f.selector] = { label: f.label || '', profileKey: entry.profileKey, relation: relation, source: sourceTag || 'saved-relation' };
      added++;
    }
    return added;
  }

  root.CcMappingRelation = {
    profileAtom: profileAtom,
    normalizeRelation: normalizeRelation,
    applyRelation: applyRelation,
    induceRelation: induceRelation,
    looksLikePartField: looksLikePartField,
    isCompoundAtom: isCompoundAtom,
    materializeSavedRelations: materializeSavedRelations,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).CcMappingRelation;

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

    // Prefer human-readable field labels over semantic DOM node ids.
    var nodesById = (pageSnapshot && pageSnapshot.nodes) || {};
    var humanLabelFor = function (step) {
      var target = (step && step.target) || {};
      var nodeId = target.node_id || null;
      var node = (nodeId && nodesById[nodeId]) || null;
      var observed = (node && node.observed) || {};
      var label = target.label
        || observed.accessible_name
        || node && (node.semantic_label || node.label)
        || target.semantic_key
        || null;
      // Never surface raw node_id / step_id as the primary Sessions UI label.
      if (label && label !== nodeId && label !== (step && step.step_id)) return label;
      if (target.semantic_key) return target.semantic_key;
      return label || 'Field';
    };
    var records = (plan.steps || []).map(function (step) {
      var result = resultByStep.get(step.step_id);
      var planned = (step.action && step.action.value != null) ? step.action.value : ((step.action && step.action.text != null) ? step.action.text : '');
      var actual = (result && result.observed_value_state) || (result && result.actual_value) || (result && result.actualValue) || null;
      var target = (step && step.target) || {};
      return {
        label: humanLabelFor(step),
        selector: target.node_id || null,
        nodeId: target.node_id || null,
        semanticKey: target.semantic_key || null,
        result: result && result.status === 'succeeded' ? 'filled' : ((result && result.status) || 'skipped'),
        value: planned,
        plannedValue: planned,
        actualValue: actual,
        failReason: (result && result.failure_code) || null,
        source: 'server-plan',
        fillMode: 'sequential-ape',
        hostname: hostFromSnap,
        verified: result && result.postcondition_met === true,
      };
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
