# fuzzy-match — Label-Primary Alias Matching Loop

## Purpose
Main mapper orchestrator. Produces `{ selector: { value, type, profileKey } }` mapping.

## Public API (`globalThis.CcFuzzyMatch`)
- `fuzzyMatch(formFields, profile)` → `mapping`

## Pipeline
1. Derive name parts from `first_name` / `middle_name` / `last_name` / `name`
2. For each field → `labelPrimaryIdent`
3. `CcMatchSpecialFields.tryMatch` (twin / conditional / agreement / file / education)
4. Else `CcMatchProfileFields.tryMatch` (name / DOB / longest-alias)
5. `CcFuzzyPostPasses.applyAll` (conditional post / twin mirror / split DOB)

## Depends on
`CcFieldAliases`, `CcFieldIdent`, `CcResolveChoice`, `CcDecideConditional`,
`CcMatchSpecialFields`, `CcMatchProfileFields`, `CcFuzzyPostPasses`
