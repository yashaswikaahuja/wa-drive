/**
 * resolve-choice — Map planned value onto radio/checkbox option selector
 */
import { normChoice } from './field-ident.ts';
import type { ChoiceResolved, FormField, MappingEntry } from './types.ts';

export { normChoice };

function looksLikeYesNo(opts: string[]): boolean {
  return opts.length > 0 && opts.every((o) => {
    const n = normChoice(o);
    return !n || n === 'yes' || n === 'no' || n === 'y' || n === 'n'
      || n === 'haan' || n === 'nahi' || n === 'true' || n === 'false'
      || n === '1' || n === '0';
  });
}

/** Map planned value onto radio/checkbox option selector. */
export function resolveChoiceToOption(
  field: FormField,
  plannedValue: string | null | undefined,
  profileKey: string | null,
): ChoiceResolved | null {
  if (!field || plannedValue == null || String(plannedValue).trim() === '') return null;
  const planned = String(plannedValue).trim();
  const plannedNorm = normChoice(planned);
  const type = field.type || '';
  const opts = field.options || [];
  const isYesNo = looksLikeYesNo(opts);

  // Reject free-text dumps on Yes/No style groups
  if (isYesNo && plannedNorm.length > 8 && !/^(yes|no|true|false|y|n)$/.test(plannedNorm)) return null;
  if (isYesNo && /^\d{8,}$/.test(plannedNorm)) return null;

  // ── radio-group ──
  if (type === 'radio-group' && field.options && field.optionSelectors) {
    let matchedIdx = -1;
    // Exact match
    for (let oi = 0; oi < opts.length; oi++) {
      if (normChoice(opts[oi]) === plannedNorm) { matchedIdx = oi; break; }
    }
    // Partial match (≥70% overlap)
    if (matchedIdx < 0) {
      for (let oi2 = 0; oi2 < opts.length; oi2++) {
        const optN = normChoice(opts[oi2]);
        const shorter = optN.length < plannedNorm.length ? optN : plannedNorm;
        const longer  = optN.length < plannedNorm.length ? plannedNorm : optN;
        if (shorter.length >= 2 && longer.includes(shorter) && shorter.length >= longer.length * 0.7) {
          matchedIdx = oi2; break;
        }
      }
    }
    // Gender synonyms
    if (matchedIdx < 0 && /male|female|other|third|पुरुष|महिला|स्त्री|तृतीय/i.test(planned + opts.join(' '))) {
      const wantFemale = /female|f\b|woman|महिला|स्त्री/.test(planned.toLowerCase());
      const wantMale   = /male|m\b|man|पुरुष/.test(planned.toLowerCase()) && !wantFemale;
      const wantOther  = /other|third|trans|तृतीय/.test(planned.toLowerCase());
      for (let gi = 0; gi < opts.length; gi++) {
        const ol = opts[gi].toLowerCase();
        if (wantFemale && /female|महिला|स्त्री|f\b/.test(ol))              { matchedIdx = gi; break; }
        if (wantMale   && /male|पुरुष|m\b/.test(ol) && !/female|third/.test(ol)) { matchedIdx = gi; break; }
        if (wantOther  && /other|third|trans|तृतीय/.test(ol))               { matchedIdx = gi; break; }
      }
    }
    // Yes/No synonyms
    if (matchedIdx < 0 && isYesNo) {
      const wantYes = /^(yes|y|true|1|haan|हां)$/i.test(planned);
      const wantNo  = /^(no|n|false|0|nahi|नहीं)$/i.test(planned);
      for (let yi = 0; yi < opts.length; yi++) {
        const yn = normChoice(opts[yi]);
        if (wantYes && (yn === 'yes' || yn === 'y' || yn === 'true' || yn === '1' || yn === 'haan')) { matchedIdx = yi; break; }
        if (wantNo  && (yn === 'no'  || yn === 'n' || yn === 'false' || yn === '0' || yn === 'nahi')) { matchedIdx = yi; break; }
      }
    }
    if (matchedIdx < 0 || !field.optionSelectors[matchedIdx]) return null;
    const entry: MappingEntry = {
      value: opts[matchedIdx],
      type: 'radio-click',
      profileKey: profileKey || null,
      label: field.label,
      matchBy: 'choice-resolve',
    };
    return {
      selector: field.optionSelectors[matchedIdx],
      entry,
    };
  }

  // ── radio (single) ──
  if (type === 'radio') {
    return {
      selector: field.selector,
      entry: {
        value: 'true',
        type: 'radio-click',
        profileKey: profileKey || null,
        label: field.label,
        matchBy: 'choice-resolve',
      },
    };
  }

  // ── checkbox / mat-checkbox / checkbox-agreement ──
  if (type === 'checkbox' || type === 'mat-checkbox' || type === 'checkbox-agreement') {
    const truthy = /^(yes|y|true|1|checked|on|haan|हां)$/i.test(planned);
    const falsy  = /^(no|n|false|0|off|unchecked|nahi|नहीं)$/i.test(planned);
    if (!truthy && !falsy) return null;
    return {
      selector: field.selector,
      entry: {
        value: truthy ? 'yes' : 'no',
        type: type === 'mat-checkbox' ? 'mat-checkbox' : 'checkbox',
        profileKey: profileKey || null,
        label: field.label,
        matchBy: 'choice-resolve',
      },
    };
  }

  // ── checkbox-group ──
  if (type === 'checkbox-group' && field.options && field.optionSelectors) {
    if (!/^(yes|no|y|n|true|false|1|0|on|off|checked)$/i.test(planned) && plannedNorm.length > 6) return null;
    const wantCheck = /^(yes|y|true|1|on|checked|haan|हां)$/i.test(planned);
    if (!wantCheck) return null;
    let cIdx = -1;
    for (let ci = 0; ci < opts.length; ci++) {
      if (normChoice(opts[ci]) === plannedNorm) { cIdx = ci; break; }
    }
    if (cIdx < 0 && field.optionSelectors.length >= 1) cIdx = 0;
    if (cIdx < 0) return null;
    return {
      selector: field.optionSelectors[cIdx],
      entry: {
        value: 'yes',
        type: 'checkbox',
        profileKey: profileKey || null,
        label: field.label,
        matchBy: 'choice-resolve',
      },
    };
  }

  return null;
}

export const CcResolveChoice = {
  resolveChoiceToOption,
};
