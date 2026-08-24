/**
 * fuzzy-post-passes — Post-loop mapping passes
 */
import type { FormField, Mapping, MatchHelpers, Profile } from './types.ts';

const TWIN_PREFIX_RE = /^(?:[a-z]\.|\d+\.|\(\w\)|[i-x]+\.)?\s*(?:verify|re[\s_-]*type|re[\s_-]*enter|confirm|repeat)\b[\s:_-]*/i;

function choiceAlreadyMapped(mapping: Mapping, f: FormField): boolean {
  if (mapping[f.selector]) return true;
  if (f.optionSelectors) {
    for (let si = 0; si < f.optionSelectors.length; si++) {
      if (mapping[f.optionSelectors[si]]) return true;
    }
  }
  return false;
}

export function applyConditionalPost(
  formFields: FormField[],
  profile: Profile,
  helpers: MatchHelpers,
  mapping: Mapping,
): void {
  const decideConditionalChoice = helpers.decideConditionalChoice || (() => null);
  const resolveChoiceToOption = helpers.resolveChoiceToOption || (() => null);
  for (let pi = 0; pi < formFields.length; pi++) {
    const pf = formFields[pi];
    if (!(pf.type === 'radio' || pf.type === 'radio-group' || pf.type === 'checkbox-group' || pf.type === 'checkbox' || pf.type === 'mat-checkbox' || pf.type === 'checkbox-agreement')) continue;
    if (choiceAlreadyMapped(mapping, pf)) continue;
    const decision = decideConditionalChoice(pf, profile);
    if (!decision) continue;
    const resolvedPost = resolveChoiceToOption(pf, decision, null);
    if (resolvedPost) {
      resolvedPost.entry.matchBy = 'conditional-post';
      mapping[resolvedPost.selector] = resolvedPost.entry;
    }
  }
}

function normLabel(s: string): string {
  return (s || '').toLowerCase()
    .replace(/^\s*(?:\d+\.|[a-z]\.|\([a-z0-9]+\)|[ixv]+\.)\s*/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function applyTwinMirror(formFields: FormField[], mapping: Mapping): void {
  for (let ti = 0; ti < formFields.length; ti++) {
    const tf = formFields[ti];
    if (mapping[tf.selector]) continue;
    const rawLabel = (tf.label || '').trim();
    if (!rawLabel || !TWIN_PREFIX_RE.test(rawLabel)) continue;
    const primaryLabel = rawLabel.replace(TWIN_PREFIX_RE, '').trim();
    const primaryNorm = normLabel(primaryLabel);
    if (!primaryNorm) continue;
    let primaryField = formFields.find((f) => {
      return mapping[f.selector] && f.selector !== tf.selector && normLabel(f.label || '') === primaryNorm;
    });
    if (!primaryField) {
      primaryField = formFields.find((f) => {
        if (!mapping[f.selector] || f.selector === tf.selector) return false;
        const fNorm = normLabel(f.label || '');
        return !!(fNorm && primaryNorm && (fNorm.includes(primaryNorm) || primaryNorm.includes(fNorm)));
      });
    }
    if (primaryField) {
      mapping[tf.selector] = { value: mapping[primaryField.selector].value, type: tf.type || '' };
    }
  }
}

export function applySplitDob(formFields: FormField[], profile: Profile, mapping: Mapping): void {
  if (!profile.dob) return;
  const dobStr = String(profile.dob).trim();
  const m1 = dobStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  const m2 = dobStr.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  let dp: { day: string; month: string; year: string } | null = null;
  if (m1) dp = { day: m1[1].padStart(2,'0'), month: m1[2].padStart(2,'0'), year: m1[3] };
  else if (m2) dp = { day: m2[3].padStart(2,'0'), month: m2[2].padStart(2,'0'), year: m2[1] };
  if (!dp) return;
  for (let di = 0; di < formFields.length; di++) {
    const df = formFields[di];
    if (mapping[df.selector]) continue;
    const lbl = (df.label||'').trim(), idn = (df.id||df.name||'').toLowerCase(), ph = (df.placeholder||'').trim();
    const isDay   = /^dd$|^day$|day_of_birth|dob_day|birth_day/i.test(lbl) || /^dd$|^day$/i.test(ph) || /(?:^|[^a-z])(dob_?day|birth_?day|day_of_birth)(?:[^a-z]|$)/.test(idn);
    const isMonth = /^mm$|^month$|month_of_birth|dob_month|birth_month/i.test(lbl) || /^mm$|^month$/i.test(ph) || /(?:^|[^a-z])(dob_?month|birth_?month|month_of_birth)(?:[^a-z]|$)/.test(idn);
    const isYear  = /^yyyy$|^year$|year_of_birth|dob_year|birth_year/i.test(lbl) || /^yyyy$|^year$/i.test(ph) || /(?:^|[^a-z])(dob_?year|birth_?year|year_of_birth)(?:[^a-z]|$)/.test(idn);
    if (isDay)   mapping[df.selector] = { value: dp.day,   type: df.type || '', profileKey: 'dob' };
    else if (isMonth) mapping[df.selector] = { value: dp.month, type: df.type || '', profileKey: 'dob' };
    else if (isYear)  mapping[df.selector] = { value: dp.year,  type: df.type || '', profileKey: 'dob' };
  }
}

export function applyAll(
  formFields: FormField[],
  profile: Profile,
  helpers: MatchHelpers,
  mapping: Mapping,
): void {
  applyConditionalPost(formFields, profile, helpers, mapping);
  applyTwinMirror(formFields, mapping);
  applySplitDob(formFields, profile, mapping);
}

export const CcFuzzyPostPasses = {
  applyAll,
  applyConditionalPost,
  applyTwinMirror,
  applySplitDob,
};
