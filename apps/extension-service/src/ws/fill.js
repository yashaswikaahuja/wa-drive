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

function profileVal(profile, key) {
  if (!profile || key == null) return null;
  const entry = profile[key];
  if (entry == null) return null;
  const v = typeof entry === 'object' && entry && 'value' in entry ? entry.value : entry;
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
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
  const saved = (formKey && allMappings[formKey]) || {};
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

  // 1) Taught maps via profileKey + relation (#302).
  // Bare profileKey never raw-dumps: unknown / failed relation → leave for AI / split-dob.
  materializeSavedRelations(fields, profile, saved, mapping, filledBySource, 'wss-saved');
  // Choice widgets need resolveChoice — materialize only sets string values.
  for (const f of fields) {
    if (!f || !f.selector) continue;
    if (mapping[f.selector]) continue;
    const sk = gsk(f.label) || gsk(f.name);
    const taught = (sk && saved[sk]) || null;

    if (taught && taught.profileKey && isChoiceType(f.type)) {
      const relation = normalizeRelation(taught, f);
      const derived = applyRelation(relation, profile, taught.profileKey, f);
      if (derived != null) {
        const resolved = resolveChoice(f, derived, taught.profileKey);
        if (resolved) applyEntry({ ...resolved, source: 'wss-saved' });
        continue;
      }
    }
    if (taught && (taught.kind === 'conditional' || taught.class === 'CONDITIONAL') && taught.taughtValue) {
      const resolved = resolveChoice(f, taught.taughtValue, taught.profileKey);
      if (resolved) {
        applyEntry({ ...resolved, source: 'wss-saved-conditional' });
        continue;
      }
    }

    // 2) Conditional decisions for choice widgets
    if (isChoiceType(f.type)) {
      const decision = decideConditional(f, profile);
      if (decision) {
        const resolved = resolveChoice(f, decision, null);
        if (resolved) {
          applyEntry({ ...resolved, source: 'wss-conditional' });
          continue;
        }
      }
    }
  }

  // 3) Date splitter — DD / MM / YYYY (or Day/Month/Year) from profile.dob
  // Was present in legacy mapper post-pass but skipped on the WSS path.
  const beforeSplit = Object.keys(mapping).length;
  applySplitDob(fields, profile, mapping);
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

  return {
    formKey,
    hostname,
    workspaceId,
    mapping,
    filledBySource,
    adapters,
    savedMappings: saved,
    plannedCount: Object.keys(mapping).length,
    fieldCount: fields.length,
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
