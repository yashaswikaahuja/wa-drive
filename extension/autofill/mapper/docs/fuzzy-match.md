# fuzzy-match — Label-Primary Alias Matching Loop

## Purpose
Main mapper engine. Produces `{ selector: { value, type, profileKey } }` mapping.

## Public API (`globalThis.CcFuzzyMatch`)
- `fuzzyMatch(formFields, profile)` → `mapping`

## Order of resolution
1. Skip twin fields (verify/retype/confirm)
2. Conditional radios
3. Agreement checkboxes (auto-check)
4. File inputs
5. Education rows (special alias set)
6. Granular name fields
7. DOB split fields
8. Longest-alias win

## Post-passes
1. Unmapped conditional choice groups
2. Twin field mirroring
3. Split DOB (DD/MM/YYYY short labels)
