export type * from './types.ts';
export { FIELD_ALIASES, getFieldAliases, CcFieldAliases } from './field-aliases.ts';
export { normalizeIdent, labelPrimaryIdent, normChoice, CcFieldIdent } from './field-ident.ts';
export { resolveChoiceToOption, CcResolveChoice } from './resolve-choice.ts';
export { decideConditionalChoice, CcDecideConditional } from './decide-conditional.ts';
export { tryMatch as tryMatchSpecial, isTwinField, isEducationRow, CcMatchSpecialFields } from './match-special-fields.ts';
export { tryMatch as tryMatchProfile, tryMatchNameParts, tryMatchDob, CcMatchProfileFields } from './match-profile-fields.ts';
export { applyAll, applyConditionalPost, applyTwinMirror, applySplitDob, CcFuzzyPostPasses } from './fuzzy-post-passes.ts';
export { fuzzyMatch, CcFuzzyMatch } from './fuzzy-match.ts';
export { aiMatch, CcAiMatch } from './ai-match.ts';
export {
  fuzzyMatch as facadeFuzzyMatch,
  aiMatch as facadeAiMatch,
  resolveChoiceToOption as facadeResolveChoiceToOption,
  decideConditionalChoice as facadeDecideConditionalChoice,
} from './mapper-api.ts';
