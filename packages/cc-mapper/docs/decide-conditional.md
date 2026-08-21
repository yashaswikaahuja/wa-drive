# decide-conditional — Decide Yes/No for Conditional Fields

## Purpose
Inspects field label/identity against known conditional patterns and returns a decision string based on profile flags.

## Public API (`globalThis.CcDecideConditional`)
- `decideConditionalChoice(field, profile)` → `'Yes' | 'No' | string | null`

## Patterns handled
| Pattern | Default |
|---------|---------|
| Changed name | `No` (unless `profile.changed_name`) |
| Same address | `Yes` |
| Disability / PwD | `No` |
| Ex-serviceman | `No` |
| Aadhaar declaration | `Yes` always |
| Gender / Marital | from profile |
| Reserved category | `No` |
