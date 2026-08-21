# derive-profile — Deterministic Profile Enrichment

## Purpose
Computes profile keys implied by existing data before the AI pass. Deterministic and free — derived values never overwrite real data.

## Public API (`globalThis.CcDeriveProfile`)
- `deriveProfile(profile, serverRules?)` → enriched profile copy with `_derived[]`

## What gets derived
- `highest_education_qualification` — from education data evidence
- `is_graduate`, `qualification_status`
- `roll_number`, `board_name`, `year_of_passing`, `percentage`, `division`, `school_name` — aliases
- `age` — from `dob`
- `is_pwd`, `ex_serviceman`, `is_reserved_category` — eligibility flags
- `first_name`, `last_name`, `middle_name` — split from `name`
- `permanent_address`, `domicile_state`, `city` — address aliases
- `nationality` — defaults to `'Indian'`
