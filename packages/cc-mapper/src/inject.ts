/**
 * Chrome inject entry — esbuild bundles this as an IIFE that installs
 * the same globalThis / window APIs the old concat bundle exposed.
 */
import { FIELD_ALIASES, getFieldAliases, CcFieldAliases } from './field-aliases.ts';
import { CcFieldIdent, labelPrimaryIdent, normalizeIdent, normChoice } from './field-ident.ts';
import { CcResolveChoice, resolveChoiceToOption } from './resolve-choice.ts';
import { CcDecideConditional, decideConditionalChoice } from './decide-conditional.ts';
import { CcMatchSpecialFields, tryMatch as tryMatchSpecial, isTwinField, isEducationRow } from './match-special-fields.ts';
import { CcMatchProfileFields, tryMatch as tryMatchProfile } from './match-profile-fields.ts';
import { CcFuzzyPostPasses, applyAll } from './fuzzy-post-passes.ts';
import { CcFuzzyMatch, fuzzyMatch } from './fuzzy-match.ts';
import { CcAiMatch, aiMatch } from './ai-match.ts';

const root = globalThis as typeof globalThis & Record<string, unknown>;

root.CcFieldAliases = CcFieldAliases;
root.CcFieldIdent = CcFieldIdent;
root.CcResolveChoice = CcResolveChoice;
root.CcDecideConditional = CcDecideConditional;
root.CcMatchSpecialFields = CcMatchSpecialFields;
root.CcMatchProfileFields = CcMatchProfileFields;
root.CcFuzzyPostPasses = CcFuzzyPostPasses;
root.CcFuzzyMatch = CcFuzzyMatch;
root.CcAiMatch = CcAiMatch;

// Legacy bare globals (mapper-api.js used to declare these at top level)
root.fuzzyMatch = fuzzyMatch;
root.aiMatch = aiMatch;
root.resolveChoiceToOption = resolveChoiceToOption;
root.decideConditionalChoice = decideConditionalChoice;

if (typeof window !== 'undefined') {
  window.ccResolveChoiceToOption = resolveChoiceToOption;
  window.ccDecideConditionalChoice = decideConditionalChoice;
}

// Keep named exports reachable for tree-shaking audits (side-effect entry)
void FIELD_ALIASES;
void getFieldAliases;
void labelPrimaryIdent;
void normalizeIdent;
void normChoice;
void tryMatchSpecial;
void tryMatchProfile;
void isTwinField;
void isEducationRow;
void applyAll;
void aiMatch;
