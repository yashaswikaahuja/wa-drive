// @ts-nocheck
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

  function labelKeys(label) {
    var raw = String(label || '').toLowerCase().trim();
    if (!raw) return [];
    var stripped = raw.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    var spaced = raw.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    var out = [];
    if (stripped) out.push(stripped);
    if (spaced && spaced !== stripped) out.push(spaced);
    return out;
  }

  function lookupSavedEntry(savedMap, field) {
    if (!savedMap || !field) return null;
    var keys = labelKeys(field.label).concat(labelKeys(field.name));
    var i;
    for (i = 0; i < keys.length; i++) {
      if (savedMap[keys[i]] && savedMap[keys[i]].profileKey) return savedMap[keys[i]];
    }
    for (i = 0; i < keys.length; i++) {
      if (savedMap[keys[i]]) return savedMap[keys[i]];
    }
    return null;
  }

  function isTravelJourneyField(field) {
    var raw = [field && field.label, field && field.name, field && field.id, field && field.placeholder, field && field.selector]
      .filter(Boolean).join(' ').toLowerCase();
    if (!raw.trim()) return false;
    if (/police[_\s-]?station|\bthana\b/.test(raw)) return false;
    return /\b(from|to|destination|origin|boarding|departure|arrival|journey|train|flight|airport|pnr|berth|quota)\b/.test(raw)
      || /\b(from|to)[_\s-]?station\b/.test(raw)
      || /\bstation\b/.test(raw);
  }
  var IDENTITY_PROFILE_KEYS = {
    dob: 1, date_of_birth: 1, dob__day: 1, dob__month: 1, dob__year: 1,
    name: 1, first_name: 1, last_name: 1, middle_name: 1, full_name: 1,
    father_name: 1, mother_name: 1, aadhaar: 1, aadhaar_number: 1, aadhar: 1,
    pan: 1, pan_number: 1, gender: 1, sex: 1, email: 1, phone: 1, mobile: 1, mobile_number: 1,
  };

  function materializeSavedRelations(fields, profile, savedMap, mapping, filledBySource, sourceTag) {
    if (!savedMap || typeof savedMap !== 'object') return 0;
    var added = 0;
    var map = mapping || {};
    var fbs = filledBySource || {};
    for (var i = 0; i < (fields || []).length; i++) {
      var f = fields[i];
      if (!f || !f.selector || map[f.selector]) continue;
      if (/radio|checkbox/i.test(String(f.type || ''))) continue;
      var entry = lookupSavedEntry(savedMap, f);
      if (!entry || !entry.profileKey) continue;
      // Never materialize dob/name/IDs into From/To/station (#308).
      if (isTravelJourneyField(f) && IDENTITY_PROFILE_KEYS[String(entry.profileKey)]) continue;
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
