/**
 * fuzzy-match — Label-primary alias matching loop (orchestrator)
 */
import { getFieldAliases } from './field-aliases.ts';
import { labelPrimaryIdent, normalizeIdent } from './field-ident.ts';
import { resolveChoiceToOption } from './resolve-choice.ts';
import { decideConditionalChoice } from './decide-conditional.ts';
import { tryMatch as tryMatchSpecial } from './match-special-fields.ts';
import { tryMatch as tryMatchProfile } from './match-profile-fields.ts';
import { applyAll } from './fuzzy-post-passes.ts';
import type { FormField, Mapping, MatchHelpers, Profile } from './types.ts';

export function fuzzyMatch(formFields: FormField[], profile: Profile): Mapping {
  const fieldAliases = getFieldAliases();
  const helpers: MatchHelpers = {
    fieldAliases,
    normalizeIdent,
    resolveChoiceToOption,
    decideConditionalChoice,
  };

  const mapping: Mapping = {};

  let firstName = String(profile.first_name || '');
  let middleName = String(profile.middle_name || '');
  let lastName = String(profile.last_name || '');
  if (!firstName && profile.name) {
    const nameParts = String(profile.name || '').trim().split(/\s+/);
    firstName = nameParts[0] || '';
    lastName = nameParts.length >= 2 ? nameParts[nameParts.length - 1] : '';
    middleName = nameParts.length >= 3 ? nameParts.slice(1, -1).join(' ') : '';
  }
  const names = { firstName, middleName, lastName };

  for (let fi = 0; fi < formFields.length; fi++) {
    const field = formFields[fi];
    const { ident, matchBy } = labelPrimaryIdent(field);

    if (tryMatchSpecial(field, ident, matchBy, profile, helpers, mapping)) continue;
    tryMatchProfile(field, ident, matchBy, profile, names, helpers, mapping);
  }

  applyAll(formFields, profile, helpers, mapping);
  return mapping;
}

export const CcFuzzyMatch = { fuzzyMatch };
