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

## Phase 2.8 Update — Runtime Knowledge Migration (Issue #92)

**Date:** 2026-08-05
**Status:** Complete

### Additional Records Migrated (Phase 2.8)

| Category | Items Found | Migrated | Notes |
|----------|:-----------:|:--------:|-------|
| English Semantic Aliases (background.js) | 12 canonical groups, ~25 variants | ✅ 12 records | `synonym` kind, lang=en |
| File Upload Mappings (mapper.js fileAliases) | 9 file categories | ✅ 9 records | `field_mapping` kind, field_type=file |
| Education Field Aliases (mapper.js eduAliases) | 16 edu field groups | ✅ 16 records | `field_mapping` kind, field_type=education |
| **Phase 2.8 Total** | | **37 records** | |
| **Grand Total (Phase 2.5 + 2.8)** | | **124 records** | |

### Extension Sync Client

**Location:** `extension/knowledge-sync.js`

The extension now fetches knowledge from the server via the sync protocol:
- `ccKnowledgeSync.bootstrap()` — full knowledge download on first run
- `ccKnowledgeSync.delta()` — incremental updates every 30 minutes
- Cached in `chrome.storage.local` under `_cc_knowledge_cache`

### Code Paths Updated to Consume Server Knowledge

| Module | Change | Fallback |
|--------|--------|----------|
| `mapper.js` | `_getFieldAliases()` merges server `field_mappings` with inline `FIELD_ALIASES` | Uses `FIELD_ALIASES` if cache is empty |
| `derive.js` | Applies server `derivation_rules` with `logic: 'lookup'` before hardcoded rules | Skips if no server rules cached |
| `background.js` | `getSemanticKeyResolved()` checks cached `semantic_aliases` first | Falls back to inline `SEMANTIC_ALIASES` |
| `popup.js` | Injects cached field_mappings and derivation_rules into page context | Proceeds without injection if cache empty |

### Intentionally Retained Runtime Logic (Final Classification)

The following remain in the extension as **execution/perception logic**, not business knowledge.
Per `architecture/constitution.yml`, perception, execution, and observation belong in the extension.

| Item | Location | Classification | Reason to Retain |
|------|----------|---------------|------------------|
| Skip rules (retype/verify/confirm detection) | mapper.js:77-107 | **Perception** | Detects duplicate fields by form structure — requires DOM context |
| Agreement checkbox detection | mapper.js:90-100 | **Perception** | Detects consent checkboxes by label — pattern matching on live DOM |
| Yes/no radio skip | mapper.js:86 | **Perception** | Detects question-type radios vs data radios |
| Hindi auto-transliteration skip | mapper.js:115 | **Execution guard** | Avoids filling fields that transform on Tab |
| Fallback derivation chains (roll_number, board_name, year_of_passing) | derive.js:71-75 | **Execution logic** | Priority ordering depends on profile data presence at fill time |
| Boolean flag derivations (is_pwd, ex_serviceman, is_reserved_category) | derive.js:85-95 | **Execution logic** | Runtime conditional evaluation requiring full profile context |
| Age calculation from DOB | derive.js:38-50 | **Execution logic** | Must run at fill time with current date |
| Name splitting (first/middle/last) | derive.js:97-102 | **Execution logic** | Splits profile.name into parts at fill time |
| Highest education level detection | derive.js:61-63 | **Execution logic** | Evaluates which education fields are populated |
| PRIORITY_KEYS ordering | executor.js:202 | **Execution sequencing** | Determines fill order (Phase 4 planner will replace) |
| DOM event dispatch sequences | executor.js, select-apply.js | **Execution** | Browser interaction mechanics |
| Plugin detection (supports()) | All plugins | **Perception** | Runtime component detection |
| Option matching algorithm | option-match.js | **Execution** | Runtime fuzzy matching of dropdown options |
| AI prompt construction | ai-resolve.js | **Execution** | Runtime LLM integration |
| waitForNetworkIdle logic | network-idle.js | **Execution timing** | Browser event handling |

### Design Decisions

1. **Hardcoded knowledge is retained as fallback** — Even after server migration, inline constants
   remain so the extension works offline or when the server is unreachable. Server knowledge
   augments but does not replace inline constants.

2. **Server knowledge wins on conflict** — When both server and local define the same semantic_key,
   `_getFieldAliases()` merges server patterns into the local set. For derivation rules, server
   `lookup` rules run first and `set()` respects the "never overwrite" rule.

3. **Only simple logic types are executed from server rules** — Complex computation
   (age_from_dob, name_split, highest_education, conditional) stays hardcoded because it
   requires profile data analysis that can't be expressed as a simple key→value lookup.

4. **Skip rules are perception, not knowledge** — Detecting retype fields, agreement checkboxes,
   and Hindi auto-transliteration fields requires DOM context and form structure analysis.
   These are not domain facts; they are runtime pattern detection.

## Next Steps

1. **Phase 4:** Replace PRIORITY_KEYS with planner-generated fill ordering
2. **Phase 5:** Learning engine creates new field_mapping records from fill experiences
3. **Future:** Remove inline fallback constants once sync protocol is proven reliable in production
