# Hardcoded Knowledge Audit Report

**Phase 2.5 — Issue #89**
**Date:** 2026-08-05
**Status:** Complete

## Summary

| Category | Items Found | Migrated | Retained (Runtime) |
|----------|:-----------:|:--------:|:-----------------:|
| Field Mappings (FIELD_ALIASES) | 33 profile keys × ~8 aliases | ✅ 33 records | Runtime fallback kept |
| Hindi Synonyms | 18 semantic keys | ✅ 18 records | — |
| Cascade Dependencies | 8 parent→child rules | ✅ 12 records | — |
| Derivation Rules | 15 rules in derive.js | ✅ 9 records | 6 retained (runtime logic) |
| Portal Definition (ServicePlus) | 1 portal | ✅ 1 record | — |
| Capability References | 15 actions | ✅ 15 records | — |
| **Total Migrated** | | **87 records** | |

## Detailed Audit

### 1. Field Aliases (extension/autofill/mapper.js:2-56)

**Classification:** Business knowledge → `field_mapping` records

The `FIELD_ALIASES` object contains 33 profile keys mapped to ~300 label patterns.
This is pure business knowledge — which form labels mean which profile fields.

**Migrated:** All 33 keys as `field_mapping` records with `match_patterns`.
**Scope:** Global (these aliases apply across all portals).
**Runtime retention:** Extension still uses `FIELD_ALIASES` as fallback until Phase 3
replaces the mapper with knowledge-store lookups.

### 2. Hindi/Regional Synonyms (mapper.js label matching)

**Classification:** Business knowledge → `synonym` records

18 Hindi equivalents embedded in alias arrays and label-matching logic.

**Migrated:** 18 `synonym` records with `language: 'hi'`, scope: `country=IN`.
**Runtime retention:** None needed — service provides via semantic aliases API.

### 3. Cascade Dependencies (extension/autofill/plugins/cascade-select.js:14-26)

**Classification:** Business knowledge → `fill_rule` records

`CASCADE_FIELDS` and `CASCADE_DEPENDENCIES` define which dropdowns depend on which
parent selections. This is form structure knowledge, not execution logic.

**Migrated:** 12 `fill_rule` records (one per parent→child dependency).
**Scope:** Country=IN (cascade patterns are India-specific).
**Runtime retention:** Plugin still uses hardcoded list until Phase 3 planner generates
ordered fill plans from knowledge.

### 4. Derivation Rules (extension/autofill/derive.js)

**Classification:** Mixed — some are business knowledge, some are runtime logic.

| Rule | Migrated? | Reason |
|------|:---------:|--------|
| highest_education_qualification | ✅ | Business rule |
| age from dob | ✅ | Business rule |
| name splitting (first/middle/last) | ✅ | Business rule |
| nationality = Indian | ✅ | Country default |
| permanent_address = address | ✅ | Alias rule |
| domicile_state = state | ✅ | Alias rule |
| is_graduate yes/no | ✅ | Business rule |
| roll_number fallback chain | ❌ | Runtime logic (priority ordering) |
| board_name fallback chain | ❌ | Runtime logic |
| year_of_passing fallback | ❌ | Runtime logic |
| is_pwd from disability_cert | ❌ | Runtime flag derivation |
| ex_serviceman from occupation | ❌ | Runtime flag derivation |
| is_reserved_category from category | ❌ | Runtime flag derivation |

**Retained runtime logic:** Fallback chains and boolean flag derivations are execution
logic that depends on profile data presence detection. These remain in `derive.js`
until the planner can express conditional derivation graphs.

### 5. Portal-Specific Behaviors (executor.js, keystroke-input.js)

**Classification:** Business knowledge → `portal_definition` records

| Behavior | Location | Migrated? |
|----------|----------|:---------:|
| ServicePlus uses DWR | executor.js:62-70 | ✅ |
| ServicePlus uses jQuery | executor.js:566 | ✅ |
| Bihar transliterates on Tab | keystroke-input.js:49,87 | ✅ |
| Cascade delay 3500ms | executor.js:588 | ✅ |
| Multi-hierarchy forms | cascade-select.js | ✅ |

**Migrated:** 1 `portal_definition` record for serviceonline.bihar.gov.in.
**Runtime retention:** Executor still reads portal adapters from service API.

### 6. Capability References (extension/capabilities/registry.js)

**Classification:** Documentation → `capability_reference` records

15 registered capabilities. These are reference docs for the planner, not runtime code.

**Migrated:** 15 `capability_reference` records.

### 7. PRIORITY_KEYS (executor.js:202-210)

**Classification:** Execution ordering → retained as runtime logic

Hindi/English cascade field labels used for fill ordering. This is execution
sequencing logic, not business knowledge. It determines which fields to fill
first (parents before children).

**NOT migrated.** Will be replaced by Phase 4 planner's dependency-aware ordering.

### 8. Skip Rules (mapper.js:77-107)

**Classification:** Execution heuristics → retained as runtime logic

- Skip retype/verify/confirm twin fields
- Skip yes/no question radio buttons
- Skip non-agreement checkboxes
- Skip Hindi auto-transliteration fields

These are fill-time execution guards, not domain knowledge. Retained.

## Intentionally Retained Runtime Logic

| Item | Location | Reason |
|------|----------|--------|
| PRIORITY_KEYS ordering | executor.js:202 | Execution sequencing (Phase 4) |
| Skip rules (retype, verify) | mapper.js:77-107 | Fill-time guards |
| waitForNetworkIdle logic | network-idle.js | Execution timing |
| DOM event dispatch sequences | executor.js, select-apply.js | Browser execution |
| Plugin detection (supports()) | All plugins | Runtime perception |
| Fallback derivation chains | derive.js:71-75 | Depends on Phase 4 planner |
| Option matching algorithm | option-match.js | Runtime matching logic |
| AI prompt construction | ai-resolve.js | Runtime AI integration |

## Migration Script

**Location:** `extension-service/seed-knowledge.js`
**Output:** 87 knowledge records in JSON format
**Run:** `node extension-service/seed-knowledge.js > seed-data.json`

The script generates records that can be POSTed to `/api/knowledge` to populate
the knowledge store with the current hardcoded knowledge as seed data.

## Next Steps (Not in scope for this issue)

1. **Phase 3:** Replace mapper.js `FIELD_ALIASES` lookup with knowledge-store query
2. **Phase 3:** Replace cascade-select.js dependency list with knowledge-store query
3. **Phase 4:** Replace PRIORITY_KEYS with planner-generated fill ordering
4. **Phase 5:** Learning engine creates new field_mapping records from fill experiences
