/**
 * match-profile-fields — Name parts, DOB split, longest-alias win
 */
import type { FormField, Mapping, MatchHelpers, NameParts, Profile } from './types.ts';
import { parseDobParts, refusesDobSplit, isFullDateWidget } from './split-dob.ts';
import { aliasHitsIdent, isTravelJourneyField, optionTexts, profileKeyAgreesWithField } from './field-ident.ts';
import { profileAtom } from './mapping-relation.ts';

/** Canonical keys that must not bind a different profile atom (panchayat≠village, circle≠sub_division). */
const LOCKED_CANONICAL = new Set([
  'panchayat', 'police_station', 'post_office', 'village', 'block', 'district', 'state',
  'sub_division', 'ward', 'gender', 'name', 'father_name', 'mother_name', 'husband_name',
  'pincode', 'mobile', 'email', 'aadhaar_number', 'photo', 'purpose', 'apply_to_office',
  'local_body_type', 'residence_type', 'supporting_document_type', 'circle',
  'dob', 'board_10th', 'board_12th', 'year_of_passing', 'highest_education_qualification', 'roll_number',
]);

export function tryMatchNameParts(
  field: FormField,
  ident: string,
  matchBy: string,
  nameParts: NameParts,
  mapping: Mapping,
): boolean {
  const isFatherMother = ident.includes('father') || ident.includes('mother') || ident.includes('pita') || ident.includes('mata');
  if (isFatherMother) return false;
  if (ident.includes('first_name') || ident.includes('firstname') || ident === 'fname') {
    if (nameParts.firstName) {
      mapping[field.selector] = { value: nameParts.firstName, type: field.type || '', matchBy: matchBy, profileKey: 'first_name' };
      return true;
    }
  }
  if (ident.includes('last_name') || ident.includes('lastname') || ident === 'lname' || ident.includes('surname')) {
    if (nameParts.lastName) {
      mapping[field.selector] = { value: nameParts.lastName, type: field.type || '', matchBy: matchBy, profileKey: 'last_name' };
      return true;
    }
  }
  if (ident.includes('middle_name') || ident.includes('middlename')) {
    mapping[field.selector] = { value: nameParts.middleName, type: field.type || '', matchBy: matchBy, profileKey: 'middle_name' };
    return true;
  }
  return false;
}

export function tryMatchDob(
  field: FormField,
  ident: string,
  matchBy: string,
  profile: Profile,
  mapping: Mapping,
): boolean {
  if (!profile.dob) return false;
  // Never dump DOB into From/To/station/journey fields (#308 IRCTC).
  if (isTravelJourneyField(field)) return false;
  if (!profileKeyAgreesWithField(field, 'dob')) return false;
  if (refusesDobSplit(field)) return false;
  // Support DD/MM/YYYY and YYYY-MM-DD (do not blindly split on '/')
  const dp = parseDobParts(profile.dob);
  if (!dp) return false;
  const dobDay = dp.day, dobMonth = dp.month, dobYear = dp.year;
  const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthShort = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthNum = parseInt(dobMonth, 10) || 0;
  const selLower = matchBy === 'dom-fallback' ? (field.selector || '').toLowerCase() : '';
  const t = (field.type || '').toLowerCase();
  const ph = String(field.placeholder || '');
  const lab = String(field.label || '');
  if (isFullDateWidget(field) || /dd[-/.]mm[-/.]yyyy/i.test(ph) || /dd[-/.]mm[-/.]yyyy/i.test(lab)) {
    const pattern = `${ph} ${lab}`;
    const sep = /dd-mm/i.test(pattern) ? '-' : /dd\.mm/i.test(pattern) ? '.' : '/';
    mapping[field.selector] = { value: `${dobDay}${sep}${dobMonth}${sep}${dobYear}`, type: field.type || '', matchBy: 'label', profileKey: 'dob' };
    return true;
  }
  if (ident.includes('day') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || ident.replace(/[_\s]/g,'') === 'day' || selLower.includes('ddl_day') || selLower.includes('_day'))) {
    mapping[field.selector] = { value: parseInt(dobDay, 10).toString(), type: field.type || '', matchBy: matchBy, profileKey: 'dob' };
    return true;
  }
  if (ident.includes('month') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || new Set(ident.split(/[_\s]+/).filter(Boolean)).size === 1 || selLower.includes('ddl_month') || selLower.includes('_month'))) {
    const monthVal = (t === 'select' || t === 'dropdown' || t === 'mat-select') ? monthNames[monthNum] : dobMonth;
    mapping[field.selector] = { value: monthVal, type: field.type || '', monthNum: monthNum, monthShort: monthShort[monthNum], matchBy: matchBy, profileKey: 'dob' };
    return true;
  }
  if (ident.includes('year') && (ident.includes('birth') || ident.includes('dob') || ident.includes('born') || new Set(ident.split(/[_\s]+/).filter(Boolean)).size === 1 || selLower.includes('ddl_year') || selLower.includes('_year'))) {
    mapping[field.selector] = { value: dobYear, type: field.type || '', matchBy: matchBy, profileKey: 'dob' };
    return true;
  }
  if ((field.placeholder === 'dd-mm-yyyy' || field.placeholder === 'DD-MM-YYYY' || /^dd[-/]mm[-/]yyyy$/i.test(field.label||''))) {
    mapping[field.selector] = { value: `${dobDay}-${dobMonth}-${dobYear}`, type: field.type || '', matchBy: 'label', profileKey: 'dob' };
    return true;
  }
  if (ident.includes('dob') || ident.includes('date_of_birth') || ident.includes('dateofbirth') || ident.includes('birth_date') || (ident.includes('date') && ident.includes('birth'))) {
    const sep = (field.placeholder || '').includes('-') ? '-' : '/';
    mapping[field.selector] = { value: dobDay + sep + dobMonth + sep + dobYear, type: field.type || '', matchBy: matchBy, profileKey: 'dob' };
    return true;
  }
  return false;
}

function identLooksLikePoliceStation(ident: string): boolean {
  return ident.includes('police_station') || ident.includes('thana') || /(?:^|_)ps(?:_|$)/.test(ident);
}

function tryMatchAlias(
  field: FormField,
  ident: string,
  matchBy: string,
  profile: Profile,
  helpers: MatchHelpers,
  mapping: Mapping,
): void {
  const fieldAliases = helpers.fieldAliases || {};
  const normalizeIdent = helpers.normalizeIdent || ((s: string) => String(s||'').toLowerCase().replace(/\W+/g,'_'));
  const resolveChoiceToOption = helpers.resolveChoiceToOption || (() => null);
  const isFatherMother = ident.includes('father') || ident.includes('mother') || ident.includes('pita') || ident.includes('mata');
  const isStateDistrict = ident.includes('state') || ident.includes('district') || ident.includes('rajya') || ident.includes('jila');
  const canonical = String(field.canonicalKey || '');

  let bestKey: string | null = null;
  let bestAliasLen = -1;
  for (const profileKey in fieldAliases) {
    const atom = profileAtom(profile, profileKey) || (field.constantValue && profileKey === canonical ? field.constantValue : null);
    if (!atom) continue;
    if (profileKey === 'name' && (isFatherMother || isStateDistrict)) continue;
    if (profileKey === 'name' && (ident.includes('first_name') || ident.includes('firstname') || ident.includes('last_name') || ident.includes('lastname') || ident.includes('surname') || ident.includes('middle_name') || ident.includes('middlename'))) continue;
    if (profileKey === 'father_name' && !isFatherMother && canonical !== 'father_name') continue;
    if (profileKey === 'mother_name' && !(ident.includes('mother') || ident.includes('mata')) && canonical !== 'mother_name') continue;
    if (profileKey === 'name' && (ident.includes('husband') || ident.includes('wife') || ident.includes('spouse') || ident.includes('guardian') || ident.includes('pati') || ident.includes('pita_pati'))) continue;
    if ((profileKey === 'post_office' || profileKey === 'village') && (ident.includes('purpose') || ident.includes('uddeshya') || (ident.includes('apply') && ident.includes('office')))) continue;
    if (profileKey === 'village' && (ident.includes('panchayat') || canonical === 'panchayat')) continue;
    if (canonical && LOCKED_CANONICAL.has(canonical) && profileKey !== canonical
      && profileKeyAgreesWithField(field, canonical)) continue;
    if (!profileKeyAgreesWithField(field, profileKey)) continue;
    if (profileKey === 'sub_division' && (ident === 'circle' || canonical === 'circle')) continue;
    if (profileKey === 'post_office' && identLooksLikePoliceStation(ident)) continue;
    if (profileKey === 'degree_name' && ident.includes('highest')) continue;

    if (field.type === 'radio' || field.type === 'radio-group') {
      const groupIdent = normalizeIdent([field.label, field.name, field.id, field.canonicalKey].filter(Boolean).join(' '));
      let groupMatches = canonical === profileKey
        || fieldAliases[profileKey].some((a) => aliasHitsIdent(groupIdent, a));
      if (!groupMatches && profileKey === 'gender' && field.options) {
        const optBlob = optionTexts(field.options).join(' ').toLowerCase();
        groupMatches = /gender|sex|ling|male|female|पुरुष|महिला|स्त्री|तृतीय/.test(groupIdent + ' ' + optBlob);
      }
      if (!groupMatches) continue;
      const resolved = resolveChoiceToOption(field, atom, profileKey);
      if (resolved) { resolved.entry.matchBy = matchBy; mapping[resolved.selector] = resolved.entry; }
      continue;
    }
    if (field.type === 'checkbox-group') continue;

    if (canonical === profileKey && canonical.length > bestAliasLen) {
      bestAliasLen = canonical.length;
      bestKey = profileKey;
      continue;
    }
    const aliases = fieldAliases[profileKey];
    for (let ai = 0; ai < aliases.length; ai++) {
      const alias = aliases[ai];
      if (!alias || alias.length < 2) continue;
      if (aliasHitsIdent(ident, alias) && alias.length > bestAliasLen) { bestAliasLen = alias.length; bestKey = profileKey; }
    }
  }
  if (bestKey) {
    const bestAtom = profileAtom(profile, bestKey) || field.constantValue || '';
    if (field.type === 'radio' || field.type === 'radio-group' || field.type === 'checkbox-group') {
      const bestResolved = resolveChoiceToOption(field, bestAtom, bestKey);
      if (bestResolved) { bestResolved.entry.matchBy = matchBy; mapping[bestResolved.selector] = bestResolved.entry; }
    } else {
      mapping[field.selector] = { value: bestAtom, type: field.type || '', matchBy: matchBy, profileKey: bestKey, label: field.label || null };
    }
  }
}

/** Always returns true — field consumed. */
export function tryMatch(
  field: FormField,
  ident: string,
  matchBy: string,
  profile: Profile,
  nameParts: NameParts,
  helpers: MatchHelpers,
  mapping: Mapping,
): boolean {
  // Travel/journey widgets: leave blank — never bind identity atoms (#308).
  if (isTravelJourneyField(field)) return true;
  if (field.fillMode === 'auto' || field.fillMode === 'skip') return true;
  if (field.humanGate === 'captcha' || field.humanGate === 'otp' || field.humanGate === 'submit' || field.humanGate === 'upload') return true;
  if (field.canonicalKey === 'purpose' || field.canonicalKey === 'apply_to_office' || field.canonicalKey === 'circle') return true;
  if (ident.includes('hindi') || ident.includes('_hindi') || (field.label||'').includes('हिंदी') || (field.label||'').includes('(Hindi)')) return true;
  const isChangedName = ident.includes('new_name') || ident.includes('changed_name') || ident.includes('newname') || ident.includes('changedname') || (field.label||'').toLowerCase().includes('new name') || (field.label||'').toLowerCase().includes('changed name');
  if (isChangedName && !profile.changed_name) return true;

  if (tryMatchNameParts(field, ident, matchBy, nameParts, mapping)) return true;
  if (tryMatchDob(field, ident, matchBy, profile, mapping)) return true;
  tryMatchAlias(field, ident, matchBy, profile, helpers, mapping);
  return true;
}

export const CcMatchProfileFields = {
  tryMatch,
  tryMatchNameParts,
  tryMatchDob,
};
