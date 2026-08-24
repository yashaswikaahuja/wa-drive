/**
 * Mapper facade — thin public API over capability modules.
 */
import { fuzzyMatch as fuzzyMatchImpl } from './fuzzy-match.ts';
import { aiMatch as aiMatchImpl } from './ai-match.ts';
import { resolveChoiceToOption as resolveChoiceToOptionImpl } from './resolve-choice.ts';
import { decideConditionalChoice as decideConditionalChoiceImpl } from './decide-conditional.ts';
import type { FormField, Mapping, Profile } from './types.ts';

export function fuzzyMatch(formFields: FormField[], profile: Profile): Mapping {
  return fuzzyMatchImpl(formFields, profile);
}

export async function aiMatch(
  formFields: FormField[],
  profile: Profile,
  groqKey: string,
  llmBaseUrl: string,
  llmModel: string,
): Promise<Mapping> {
  return aiMatchImpl(formFields, profile, groqKey, llmBaseUrl, llmModel);
}

export function resolveChoiceToOption(
  field: FormField,
  plannedValue: string | null | undefined,
  profileKey: string | null,
) {
  return resolveChoiceToOptionImpl(field, plannedValue, profileKey);
}

export function decideConditionalChoice(field: FormField, profile: Profile) {
  return decideConditionalChoiceImpl(field, profile);
}
