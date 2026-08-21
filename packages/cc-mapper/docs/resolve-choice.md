# resolve-choice — Map Planned Value onto Radio/Checkbox Option

## Purpose
Given a field descriptor and a planned value, finds the matching option selector. Never dumps free-text onto choice widgets — returns null if no safe match.

## Public API (`globalThis.CcResolveChoice`)
- `resolveChoiceToOption(field, plannedValue, profileKey)` → `{ selector, entry } | null`

## Logic per type
- `radio-group`: exact → partial (≥70%) → gender synonyms → yes/no synonyms
- `radio`: always resolves to `value:'true'`, `type:'radio-click'`
- `checkbox`/`mat-checkbox`: truthy/falsy string detection
- `checkbox-group`: only for yes/wantCheck; defaults to first option

## Guards
- Yes/No groups reject free-text > 8 chars
- Yes/No groups reject numeric strings ≥ 8 digits (aadhaar, mobile)
