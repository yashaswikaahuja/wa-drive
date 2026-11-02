# field-aliases — FIELD_ALIASES Dict + Server Merge

## Purpose
Provides the canonical alias map (`profileKey → label patterns[]`) used by fuzzy matching. Merges server-synced field mappings on top of the hardcoded base.

## Public API (`globalThis.CcFieldAliases`)
- `FIELD_ALIASES` — base hardcoded dict (identity, address, education, RTPS local-body keys)
- Short aliases (`po`, `ps`) match whole tokens only so `police_station` cannot bind `post_office`
- `getFieldAliases(serverMappings?)` — returns merged alias object

## Server merge rules
- Server patterns augment existing keys (never replace entirely)
- Duplicate patterns are not added twice
- New server keys are created if not in base
