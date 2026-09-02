# fuzzy-post-passes — Conditional / Twin / Split-DOB Cleanup

## Purpose
Post-loop cleanup for `fuzzyMatch` after every field has been visited once.

## Public API (`globalThis.CcFuzzyPostPasses`)
- `applyAll(formFields, profile, helpers, mapping)` — runs all three passes
- `applyConditionalPost(...)` — unmapped choice groups
- `applyTwinMirror(...)` — verify/confirm/retype mirrors primary
- `applySplitDob(...)` — DD / MM / YYYY short-label fields (root: `src/split-dob.js`, also used by WSS fill)

## Passes
1. Unmapped conditional choice groups (`matchBy: 'conditional-post'`)
2. Twin field mirroring (label prefix strip + fuzzy primary match)
3. Split DOB from `profile.dob` (`DD/MM/YYYY` or `YYYY-MM-DD`)
