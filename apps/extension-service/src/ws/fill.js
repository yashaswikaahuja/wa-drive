/**
 * WSS Stage C — fill plan + session over the live socket (not HTTPS).
 * Builds a sequential-kernel mapping from taught form maps + profile + conditionals.
 */
import { loadDoc, KEYS } from '../db/store.js';
import { pool } from '../db/db.js';
import { applySplitDob } from '@cc/mapper/split-dob';
import {
  normalizeRelation,
  applyRelation,
  materializeSavedRelations,
} from '@cc/mapper/mapping-relation';

function gsk(l) {
  return String(l || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dual normalization — agent/mappings used spaced punctuation; fill/corrections strip it. */
function labelKeys(label) {
  const raw = String(label || '')
    .toLowerCase()
    .trim();
  if (!raw) return [];
  const stripped = raw.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const spaced = raw.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const out = [];
  if (stripped) out.push(stripped);
  if (spaced && spaced !== stripped) out.push(spaced);
  return out;
}

function lookupTaught(saved, field) {
  if (!saved || !field) return null;
  const keys = [...labelKeys(field.label), ...labelKeys(field.name)];
  for (const k of keys) {
    if (saved[k]?.profileKey) return saved[k];
  }
  for (const k of keys) {
    if (saved[k]) return saved[k];
  }
  return null;
}

function countMapped(saved) {
  if (!saved || typeof saved !== 'object') return 0;
  let n = 0;
  for (const [k, v] of Object.entries(saved)) {
    if (k.startsWith('_')) continue;
    if (v && typeof v === 'object' && v.profileKey) n++;
  }
  return n;
}

/**
 * Resolve taught maps for this fill.
 * Prefer exact formKey; if empty (formKey drift), pick same-hostname map with
 * the most overlapping taught labels — restores GCP-style reuse of prior maps.
 */
function resolveSavedMappings(allMappings, formKey, hostname, fields) {
  const exact = (formKey && allMappings[formKey]) || {};
  const exactTaught = countMapped(exact);
  if (exactTaught > 0) {
    return {
      saved: exact,
      via: 'exact',
      resolvedFormKey: formKey,
      exactTaughtCount: exactTaught,
      // Exact formKey trained → fill from maps only (no AI cold-start).
      preferMapsOnly: true,
    };
  }

  const fieldKeySet = new Set();
  for (const f of fields || []) {
    for (const k of labelKeys(f?.label)) fieldKeySet.add(k);
    for (const k of labelKeys(f?.name)) fieldKeySet.add(k);
  }
  if (fieldKeySet.size === 0) {
    return {
      saved: exact,
      via: 'exact-empty',
      resolvedFormKey: formKey,
      exactTaughtCount: 0,
      preferMapsOnly: false,
    };
  }

  let best = null;
  let bestScore = 0;
  for (const [fk, entry] of Object.entries(allMappings || {})) {
    if (!entry || typeof entry !== 'object') continue;
    const metaHost = entry._meta?.hostname || '';
    if (hostname && metaHost && metaHost !== hostname) continue;
    let score = 0;
    for (const [lk, lv] of Object.entries(entry)) {
      if (lk.startsWith('_') || !lv?.profileKey) continue;
      if (fieldKeySet.has(lk)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = { fk, entry };
    }
  }
  if (best && bestScore > 0) {
    // Soft reuse from a sibling form on the same host — help planning, but still
    // allow AI for truly new fields (new page / new website section).
    return {
      saved: best.entry,
      via: `label-overlap:${best.fk}:${bestScore}`,
      resolvedFormKey: best.fk,
      exactTaughtCount: 0,
      preferMapsOnly: false,
    };
  }
  return {
    saved: exact,
    via: 'exact-empty',
    resolvedFormKey: formKey,
    exactTaughtCount: 0,
    preferMapsOnly: false,
  };
}

/** Profile key aliases when taught key ≠ profile atom key (mobile↔phone, etc.). */
const PROFILE_KEY_ALIASES = {
  mobile: ['phone', 'phone_number', 'mobile_number', 'mobile_no'],
  phone: ['mobile', 'mobile_number', 'phone_number', 'mobile_no'],
  name: ['full_name', 'applicant_name'],
  full_name: ['name'],
  dob: ['date_of_birth'],
  date_of_birth: ['dob'],
  gender: ['sex'],
  sex: ['gender'],
  email: ['email_id'],
  email_id: ['email'],
  father_name: ['fathers_name'],
  aadhaar_number: ['aadhaar', 'aadhar'],
};

function profileVal(profile, key) {
  if (!profile || key == null) return null;
  const entry = profile[key];
  if (entry == null) return null;
  const v = typeof entry === 'object' && entry && 'value' in entry ? entry.value : entry;
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function profileValWithAlias(profile, key) {
  const direct = profileVal(profile, key);
  if (direct != null) return { value: direct, key };
  const aliases = PROFILE_KEY_ALIASES[key] || [];
  for (const alt of aliases) {
    const v = profileVal(profile, alt);
    if (v != null) return { value: v, key: alt };
  }
  return null;
}

function normChoice(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function decideConditional(field, profile) {
  const label = String(field.label || '').toLowerCase();
  const nameId = `${field.name || ''} ${field.id || ''}`.toLowerCase();
  const blob = `${gsk(field.label)} ${label} ${nameId}`;

  if (/changed|new_name|name_change|whether.*name/.test(blob)) {
    return profileVal(profile, 'changed_name') ? 'Yes' : 'No';
  }
  if (/address.?same|same.?address|isaddresssame|correspondence.?same/.test(blob)) {
    const v = profileVal(profile, 'same_address');
    if (v != null) return /^(yes|true|1)$/i.test(v) ? 'Yes' : 'No';
    return 'Yes';
  }
  if (/disabilit|pwd|divyang|handicapped|is_pwd/.test(blob)) {
    const d = profileVal(profile, 'is_pwd') || profileVal(profile, 'disability') || profileVal(profile, 'pwd');
    if (d != null) return /^(yes|y|true|1)$/i.test(d) ? 'Yes' : 'No';
    return 'No';
  }
  if (/ex.?serviceman|ex.?service/.test(blob)) {
    const e = profileVal(profile, 'ex_serviceman');
    if (e != null) return /^(yes|y|true|1)$/i.test(e) ? 'Yes' : 'No';
    return 'No';
  }
  if (/aadhar.?declar|aadhaar.?declar|declaration|consent|i_agree|i agree|confirm.*information/.test(blob)) {
    return 'Yes';
  }
  if (/gender|sex|ling|पुरुष|महिला|male|female|तृतीय/.test(blob)) {
    return profileVal(profile, 'gender') || profileVal(profile, 'sex');
  }
  if (/marital|married|unmarried|विवाह/.test(blob)) {
    return profileVal(profile, 'marital_status') || profileVal(profile, 'marital');
  }
  return null;
}

function resolveChoice(field, planned, profileKey) {
  if (planned == null || String(planned).trim() === '') return null;
  const plannedStr = String(planned).trim();
  const plannedNorm = normChoice(plannedStr);
  const type = field.type || '';
  const opts = field.options || [];
  const sels = field.optionSelectors || [];

  const looksYesNo =
    opts.length > 0 &&
    opts.every((o) => {
      const n = normChoice(o);
      return !n || ['yes', 'no', 'y', 'n', 'haan', 'nahi', 'true', 'false', '1', '0'].includes(n);
    });

  if (looksYesNo && plannedNorm.length > 8 && !/^(yes|no|true|false|y|n)$/.test(plannedNorm)) return null;
  if (looksYesNo && /^\d{8,}$/.test(plannedNorm)) return null;

  if ((type === 'radio-group' || type === 'radio') && opts.length && sels.length) {
    let matchedIdx = opts.findIndex((o) => normChoice(o) === plannedNorm);
    if (matchedIdx < 0) {
      for (let i = 0; i < opts.length; i++) {
        const ot = normChoice(opts[i]);
        const shorter = ot.length < plannedNorm.length ? ot : plannedNorm;
        const longer = ot.length < plannedNorm.length ? plannedNorm : ot;
        if (shorter.length >= 2 && longer.includes(shorter) && shorter.length >= longer.length * 0.7) {
          matchedIdx = i;
          break;
        }
      }
    }
    if (matchedIdx < 0 && /male|female|other|third|पुरुष|महिला|स्त्री|तृतीय/i.test(plannedStr + opts.join(' '))) {
      const wantFemale = /female|f\b|woman|महिला|स्त्री/i.test(plannedStr);
      const wantMale = /male|m\b|man|पुरुष/i.test(plannedStr) && !wantFemale;
      const wantOther = /other|third|trans|तृतीय/i.test(plannedStr);
      for (let i = 0; i < opts.length; i++) {
        const ol = String(opts[i]).toLowerCase();
        if (wantFemale && /female|महिला|स्त्री/.test(ol)) {
          matchedIdx = i;
          break;
        }
        if (wantMale && /male|पुरुष/.test(ol) && !/female|third/.test(ol)) {
          matchedIdx = i;
          break;
        }
        if (wantOther && /other|third|trans|तृतीय/.test(ol)) {
          matchedIdx = i;
          break;
        }
      }
    }
    if (matchedIdx < 0 && looksYesNo) {
      const wantYes = /^(yes|y|true|1|haan|हां)$/i.test(plannedStr);
      const wantNo = /^(no|n|false|0|nahi|नहीं)$/i.test(plannedStr);
      for (let i = 0; i < opts.length; i++) {
        const yn = normChoice(opts[i]);
        if (wantYes && ['yes', 'y', 'true', '1', 'haan'].includes(yn)) {
          matchedIdx = i;
          break;
        }
        if (wantNo && ['no', 'n', 'false', '0', 'nahi'].includes(yn)) {
          matchedIdx = i;
          break;
        }
      }
    }
    if (matchedIdx < 0 || !sels[matchedIdx]) return null;
    return {
      selector: sels[matchedIdx],
      value: opts[matchedIdx],
      type: 'radio-click',
      label: field.label,
      profileKey: profileKey || null,
      source: 'wss-plan',
    };
  }

  if (type === 'checkbox' || type === 'mat-checkbox' || type === 'checkbox-agreement') {
    const truthy = /^(yes|y|true|1|checked|on|haan|हां)$/i.test(plannedStr);
    const falsy = /^(no|n|false|0|off|unchecked|nahi|नहीं)$/i.test(plannedStr);
    if (!truthy && !falsy) return null;
    return {
      selector: field.selector,
      value: truthy ? 'yes' : 'no',
      type: type === 'mat-checkbox' ? 'mat-checkbox' : 'checkbox',
      label: field.label,
      profileKey: profileKey || null,
      source: 'wss-plan',
    };
  }

  if (type === 'checkbox-group' && sels.length) {
    if (!/^(yes|no|y|n|true|false|1|0|on|off|checked)$/i.test(plannedStr) && plannedNorm.length > 6) {
      return null;
    }
    const wantCheck = /^(yes|y|true|1|on|checked|haan|हां)$/i.test(plannedStr);
    if (!wantCheck) return null;
    return {
      selector: sels[0],
      value: 'yes',
      type: 'checkbox',
      label: field.label,
      profileKey: profileKey || null,
      source: 'wss-plan',
    };
  }

  return null;
}

function isChoiceType(t) {
  return /radio|checkbox/i.test(String(t || ''));
}

/**
 * @param {object} msg — fill_request payload
 * @param {string} workspaceId
 */
export async function buildFillMapping(msg, workspaceId) {
  const formKey = msg.formKey || msg.semanticFormKey || null;
  const fields = Array.isArray(msg.fields) ? msg.fields : [];
  const profile = msg.profile && typeof msg.profile === 'object' ? msg.profile : {};
  const hostname = msg.hostname || '';

  const allMappings = await loadDoc(KEYS.MAPPINGS);
  const resolved = resolveSavedMappings(allMappings, formKey, hostname, fields);
  const saved = resolved.saved || {};
  const allAdapters = await loadDoc(KEYS.ADAPTERS);
  const adapters = (hostname && allAdapters[hostname]) || {};

  /** @type {Record<string, object>} */
  const mapping = {};
  /** @type {Record<string, object>} */
  const filledBySource = {};

  function applyEntry(entry) {
    if (!entry || !entry.selector) return;
    mapping[entry.selector] = {
      value: entry.value,
      type: entry.type,
      label: entry.label || null,
      profileKey: entry.profileKey || null,
      matchBy: entry.source || 'wss-plan',
    };
    filledBySource[entry.selector] = {
      label: entry.label || '',
      profileKey: entry.profileKey || null,
      source: entry.source || 'wss-plan',
    };
  }

  // Profile with aliases so taught mobile↔phone etc. still materialize.
  const profileForApply = { ...profile };
  for (const [canonical, aliases] of Object.entries(PROFILE_KEY_ALIASES)) {
    if (profileVal(profileForApply, canonical) != null) continue;
    for (const alt of aliases) {
      const v = profileVal(profile, alt);
      if (v != null) {
        profileForApply[canonical] = v;
        break;
      }
    }
  }

  // 1) Taught maps via profileKey + relation (#302).
  // Bare profileKey never raw-dumps: unknown / failed relation → leave for split-dob / fuzzy.
  materializeSavedRelations(fields, profileForApply, saved, mapping, filledBySource, 'wss-saved');
  // Choice widgets need resolveChoice — materialize only sets string values.
  for (const f of fields) {
    if (!f || !f.selector) continue;
    if (mapping[f.selector]) continue;
    const taught = lookupTaught(saved, f);

    if (taught && taught.profileKey && isChoiceType(f.type)) {
      const relation = normalizeRelation(taught, f);
      let derived = applyRelation(relation, profileForApply, taught.profileKey, f);
      if (derived == null) {
        const aliased = profileValWithAlias(profile, taught.profileKey);
        if (aliased) derived = applyRelation(relation, { [taught.profileKey]: aliased.value }, taught.profileKey, f);
      }
      if (derived != null) {
        const resolvedChoice = resolveChoice(f, derived, taught.profileKey);
        if (resolvedChoice) applyEntry({ ...resolvedChoice, source: 'wss-saved' });
        continue;
      }
    }
    if (taught && (taught.kind === 'conditional' || taught.class === 'CONDITIONAL') && taught.taughtValue) {
      const resolvedChoice = resolveChoice(f, taught.taughtValue, taught.profileKey);
      if (resolvedChoice) {
        applyEntry({ ...resolvedChoice, source: 'wss-saved-conditional' });
        continue;
      }
    }

    // 2) Conditional decisions for choice widgets
    if (isChoiceType(f.type)) {
      const decision = decideConditional(f, profileForApply);
      if (decision) {
        const resolvedChoice = resolveChoice(f, decision, null);
        if (resolvedChoice) {
          applyEntry({ ...resolvedChoice, source: 'wss-conditional' });
          continue;
        }
      }
    }
  }

  // 3) Date splitter — DD / MM / YYYY (or Day/Month/Year) from profile.dob
  // Was present in legacy mapper post-pass but skipped on the WSS path.
  const beforeSplit = Object.keys(mapping).length;
  applySplitDob(fields, profileForApply, mapping);
  for (const [sel, entry] of Object.entries(mapping)) {
    if (entry && entry.matchBy === 'split-dob' && !filledBySource[sel]) {
      filledBySource[sel] = {
        label: entry.label || '',
        profileKey: entry.profileKey || 'dob',
        source: 'wss-split-dob',
      };
    }
  }
  const splitAdded = Object.keys(mapping).length - beforeSplit;
  if (splitAdded > 0) {
    console.log(`[wss-fill] applySplitDob mapped ${splitAdded} date-part field(s)`);
  }

  // Scrub identity atoms that landed on travel/journey fields (#308).
  const travelRe = /\b(from|to|destination|origin|boarding|departure|arrival|journey|train|flight|airport|pnr|berth|quota|station)\b/i;
  const policeRe = /police[_\s-]?station|\bthana\b/i;
  const identityKeys = new Set([
    'dob', 'date_of_birth', 'dob__day', 'dob__month', 'dob__year',
    'name', 'first_name', 'last_name', 'middle_name', 'full_name',
    'father_name', 'mother_name', 'aadhaar', 'aadhaar_number', 'aadhar',
    'pan', 'pan_number', 'gender', 'sex', 'email', 'phone', 'mobile', 'mobile_number',
  ]);
  // Travel profile keys are allowed on travel fields (#312). Only scrub identity atoms.
  const travelProfileKeys = new Set([
    'departure', 'arrival', 'from_station', 'to_station', 'journey_date', 'return_date',
    'travel_class', 'quota', 'passenger_count',
  ]);
  const dateValRe = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;
  let scrubbed = 0;
  for (const f of fields) {
    if (!f?.selector || !mapping[f.selector]) continue;
    const blob = [f.label, f.name, f.id, f.placeholder].filter(Boolean).join(' ');
    if (!travelRe.test(blob) || policeRe.test(blob)) continue;
    const entry = mapping[f.selector];
    const pk = String(entry?.profileKey || (entry?.matchBy === 'split-dob' ? 'dob' : '') || '');
    if (travelProfileKeys.has(pk)) continue; // taught travel binding — keep
    const looksIdentity = identityKeys.has(pk)
      || entry?.matchBy === 'split-dob'
      || ((!pk || identityKeys.has(pk)) && dateValRe.test(String(entry?.value || '')));
    if (looksIdentity) {
      delete mapping[f.selector];
      delete filledBySource[f.selector];
      scrubbed++;
    }
  }
  if (scrubbed > 0) {
    console.log(`[wss-fill] scrubbed ${scrubbed} identity→travel mapping(s)`);
  }

  const plannedCount = Object.keys(mapping).length;
  const exactTaughtCount = resolved.exactTaughtCount || 0;
  const preferMapsOnly = !!resolved.preferMapsOnly;
  console.log(
    `[wss-fill] formKey=${formKey || '-'} via=${resolved.via} taught=${countMapped(saved)} exactTaught=${exactTaughtCount} mapsOnly=${preferMapsOnly} planned=${plannedCount}/${fields.length}`
  );

  return {
    formKey,
    resolvedFormKey: resolved.resolvedFormKey || formKey,
    mappingSource: resolved.via,
    preferMapsOnly,
    exactTaughtCount,
    hostname,
    workspaceId,
    mapping,
    filledBySource,
    adapters,
    savedMappings: saved,
    plannedCount,
    fieldCount: fields.length,
    taughtMappedCount: countMapped(saved),
    transport: 'wss',
  };
}

/**
 * Persist a fill session from WSS (same shape as POST /api/sessions).
 */
export async function persistFillSession(msg, workspaceId, userId) {
  const hostname = (msg.hostname && String(msg.hostname).trim()) || null;
  const records = Array.isArray(msg.records) ? msg.records : [];
  const filled = msg.totalFilled || 0;
  const failed = msg.totalFailed || 0;
  const enriched = {
    _metrics: {
      filled,
      failed,
      skipped: msg.totalSkipped ?? records.filter((r) => r?.result === 'skipped').length,
      unmapped: msg.totalUnmapped ?? 0,
      waiting_human: records.filter((r) => r?.result === 'waiting_human').length,
      transport: 'wss',
    },
    records,
  };

  const { rows } = await pool.query(
    `INSERT INTO sessions (workspace_id, user_id, hostname, semantic_form_key, runtime_version, schema_version, total_filled, total_failed, records)
     VALUES ($1,$2,$3,$4,$5,'1.0',$6,$7,$8) RETURNING id`,
    [
      workspaceId,
      userId || null,
      hostname,
      msg.semanticFormKey || msg.formKey || null,
      msg.runtimeVersion || null,
      filled,
      failed,
      JSON.stringify(enriched),
    ]
  );
  return { id: rows[0].id, hostname, transport: 'wss' };
}
