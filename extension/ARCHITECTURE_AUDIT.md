# Architecture Audit — CyberControl Extension

> **Issue**: #55 Phase 0.1  
> **Branch**: `issue-55/architecture-audit`  
> **Date**: 2026-08-03  
> **Version audited**: master @ 9ee9a13 (v5.91)

---

## 1. RUNTIME FLOW

Complete flow from page load to fill completion:

```
┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 1: LOAD                                                         │
├──────────────────────────────────────────────────────────────────────┤
│ manifest.json                                                         │
│  → registers background.js as service worker                          │
│  → declares content_scripts (extractor, keystroke-input, interface)   │
│                                                                       │
│ background.js                                                         │
│  → chrome.runtime.onInstalled (setup alarms, open onboarding)        │
│  → chrome.tabs.onUpdated (detect portal URLs → badge/state update)   │
│  → chrome.runtime.onMessage (auth validation, teach session mgmt)    │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 2: EXTRACTION (triggered by popup open or auto-detect)          │
├──────────────────────────────────────────────────────────────────────┤
│ popup.js                                                              │
│  → chrome.tabs.query({active:true})                                   │
│  → chrome.scripting.executeScript({func: extractFormFields})          │
│                                                                       │
│ extractor.js :: extractFormFields()                                    │
│  → scans DOM: input, select, textarea, [role=combobox], mat-select   │
│  → getLabel(el) resolves human-readable label per field               │
│  → detects type: text|select|radio|checkbox|file|date|custom          │
│  → extracts options[] for selects/radios                              │
│  → returns [{label, selector, type, value, options, domIndex}]        │
│                                                                       │
│ Result returned to popup.js via executeScript return value            │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 3: MAPPING                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ popup.js → mapper.js :: mapFieldsToProfile(fields, profile, cached)   │
│                                                                       │
│ Pipeline:                                                             │
│  1. normalizeLabel (strip numbers, asterisks, whitespace)             │
│  2. getSemanticKey (shared/label-utils.js — predefined aliases)       │
│  3. Check cached mappings (from backend or chrome.storage)            │
│  4. rule-engine.js :: findBestMatch (token scoring)                   │
│  5. AI fallback: mapper.js :: aiMatch (Groq LLM)                     │
│                                                                       │
│ Output: {fieldLabel → profileKey, confidence, source}                 │
│                                                                       │
│ derive.js :: deriveValues(profile)                                     │
│  → computes age, full_name, highest_education, etc.                   │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 4: PLANNING                                                     │
├──────────────────────────────────────────────────────────────────────┤
│ popup.js (INLINE — planner.js exists but is UNUSED)                   │
│  → constructs fill plan: [{selector, value, type, strategy}]          │
│  → determines fill order (text first, then selects, then cascades)   │
│  → marks dependent fields (state→district→block)                      │
│                                                                       │
│ Alternative: AI agent path                                            │
│  → popup.js sends DOM snapshot to LLM                                 │
│  → LLM returns action sequence                                        │
│  → actions dispatched via drivers/dispatch.js                         │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 5: EXECUTION                                                    │
├──────────────────────────────────────────────────────────────────────┤
│ popup.js → chrome.scripting.executeScript({func: executeFillPlan})    │
│                                                                       │
│ executor.js :: executeFillPlan(plan)                                   │
│  Per field:                                                           │
│  ├─ TEXT → keystrokeFillSync() + verifyValue()                        │
│  ├─ NATIVE SELECT → applySelect() → findOpt() option matching        │
│  ├─ CUSTOM DROPDOWN → findPlugin() → ng-dropdown/cascade plugin       │
│  │   └─ fallback: AI select (Groq) if plugin fails                   │
│  ├─ DATE → fillDate() with format detection                           │
│  ├─ RADIO/CHECKBOX → findOpt() + click dispatch                      │
│  └─ CASCADE → fill parent + waitForNetworkIdle + waitForOptions       │
│                                                                       │
│ Post-fill: injects MutationObserver on filled fields                  │
│  → captures operator corrections                                      │
│  → captures enrichments (fields operator fills that extension didn't) │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ PHASE 6: SESSION RECORDING                                            │
├──────────────────────────────────────────────────────────────────────┤
│ executor.js post-fill observer → on submit/unload:                    │
│  → POSTs corrections to backend: /mappings/{formKey}                  │
│  → POSTs session results to backend: /sessions                        │
│                                                                       │
│ popup.js records session metadata:                                     │
│  → fields attempted, fields filled, fields failed                     │
│  → timing, AI calls made, plugins used                                │
└──────────────────────────────────────────────────────────────────────┘
```

### Message Passing Architecture

| From → To | Mechanism | Used For |
|-----------|-----------|----------|
| popup → content script | `chrome.scripting.executeScript` | Injection (NOT message passing) |
| popup → background | `chrome.runtime.sendMessage` | Auth validation, teach session |
| background → content | `chrome.scripting.executeScript` | Teach injection |
| background → content | `chrome.tabs.sendMessage` | State updates |
| content → background | `chrome.runtime.sendMessage` | Correction data, teach results |
| drivers → popup | `document.body.dataset.ccTraces` | DOM-based data channel |

---

## 2. DUPLICATE LOGIC

### Critical Duplicates (fix immediately)

| # | Logic | Locations | Impact |
|---|-------|-----------|--------|
| 1 | **Option matching** (exact→CI→contains→fuzzy) | `rule-engine.js::findBestMatch`, `executor.js::findOpt`, `ng-dropdown.js::findOption`, `cascade-select.js::pickOption`, `drivers/select.js::pickNativeOption` | **5 copies**. Bugs fixed in one don't propagate. This is the #1 maintenance hazard. |
| 2 | **Label resolution** | `extractor.js::getLabel`, `drivers/dom.js::getLabelFor`, `correction-runtime.js` (inline) | **3 copies**. Incorrect labels → wrong mappings. extractor.js is most complete. |
| 3 | **calcConfidence** | `shared/label-utils.js`: `fills/(fills+corrections*3)` vs `background.js`: `(fills-corrections*2)/max(1,fills+corrections)` | **Active BUG** — different formulas produce different confidence for the same data. |

### Medium Duplicates (consolidate in Phase 0)

| # | Logic | Locations | Impact |
|---|-------|-----------|--------|
| 4 | **isVisible(el)** | `executor.js`, `ng-dropdown.js`, `teach-runtime.js`, `drivers/dom.js`, `drivers/interaction.js` | 5 copies with minor variations (some skip opacity check). |
| 5 | **Network idle wait** | `executor.js::waitForNetworkIdle`, `drivers/interaction.js::wait.networkIdle`, `drivers/select.js::select.cascade` | 3 copies with different default timeouts (3s, configurable, 6s). |
| 6 | **LLM call pattern** | `mapper.js::aiMatch`, `ai-resolve.js`, `executor.js` AI select, `background.js::groqAutoTeach` | 4 places construct Groq requests. No shared client. |
| 7 | **Auth/token refresh** | `shared/apiClient.js::refresh`, `background.js::validateAuth`, `popup.js` inline | 3 implementations. apiClient.js is the proper one but unused. |

### Low Duplicates (track but not urgent)

| # | Logic | Locations |
|---|-------|-----------|
| 8 | **Select event dispatch** | `executor.js::applySelect`, `cascade-select.js::dispatchSelectEvents` |
| 9 | **Name splitting** | `mapper.js::splitName`, `derive.js::splitName` |
| 10 | **normalizeFieldLabel** | `shared/label-utils.js`, `background.js` |
| 11 | **Confirm/twin field detection** | `mapper.js::detectConfirmFields`, `executor.js` inline |

---

## 3. DEAD CODE & OVERLAPPING RESPONSIBILITIES

### Dead Files (safe to delete)

| File | Size | Evidence |
|------|------|----------|
| `autofill/planner.js` | 8.6KB | Never imported. popup.js plans inline. |
| `shared/apiClient.js` | 3.5KB | Never called. All API calls are manual fetch. |
| `runtime/teach-runtime.js` | 6.8KB | Superseded by background.js inline teachOneField. |
| `runtime/correction-runtime.js` | 4.9KB | Duplicated in extractor.js; executor.js has superior version. |

### Dead Functions

| Function | File | Evidence |
|----------|------|----------|
| `window.keystrokeFill` (async) | keystroke-input.js | Only `keystrokeFillSync` is called |
| `window.shouldUseKeystroke` | keystroke-input.js | Declared, never invoked |
| `_CC_LEGACY_COMPARE` | executor.js | Unused constant |
| `STRATEGY_VERSION` | executor.js | Declared, never read |
| `WAIT_ENGINE_VERSION` | executor.js | Declared, never read |

### Dead Directory: `scripts/fixes/`

Contains 16 Python fix scripts. These are one-time migration/patch scripts. They reference old code patterns and should be archived (moved to a `_legacy/` directory or deleted).

### Overlapping Responsibilities

| Overlap | Assessment |
|---------|------------|
| **Two execution architectures**: executor.js (monolithic) vs drivers/ (modular, traced) | Both fill forms. executor.js is production; drivers/ is AI-agent path. Maintaining two parallel systems is unsustainable. |
| **Two dropdown systems**: interface.js plugins vs drivers/select.js auto-detect | Can conflict at runtime. |
| **Three correction observers**: correction-runtime.js, extractor.js, executor.js | executor.js is canonical. Others are vestigial. |
| **Two teach implementations**: teach-runtime.js vs background.js inline | background.js is canonical. |

---

## 4. KNOWLEDGE STORAGE LOCATIONS

### chrome.storage.local (persistent, per-installation)

| Key | Purpose | Read by | Written by |
|-----|---------|---------|------------|
| `accessToken` | JWT auth | popup, background, apiClient | popup login, background refresh |
| `refreshToken` | JWT refresh | background, apiClient | popup login |
| `user` | User object | popup | popup login |
| `backendUrl` | API base URL | popup, background, executor | popup settings |
| `groqApiKey` | LLM API key | popup, background, mapper | popup settings |
| `mappings` / per-form | Cached field→profileKey rules | mapper, popup | mapper, correction observers |
| `profile` | Autofill profile data | popup, mapper | popup profile editor |
| `adapters` | Learned dropdown interaction patterns | background | background teachOneField |
| `settings` | Extension preferences | popup, background | popup |

### Backend (PostgreSQL via API)

| Table/Endpoint | Purpose | Called by |
|----------------|---------|-----------|
| `ext_kv_store` key `form_mappings` | Per-form field→profileKey rules, fillModes, conditions | mapper GET, correction POST |
| `ext_kv_store` key `adapters` | Per-hostname component interaction recipes | background GET/POST |
| `sessions` | Fill session records (per-field results) | popup POST |
| `corrections` | Operator edits to filled values | executor POST |
| `profiles` | Profile CRUD | popup GET/POST |

### In-Memory (ephemeral, page context)

| Variable | File | Purpose |
|----------|------|---------|
| `window._ccTraces` | drivers/dispatch.js | Action trace log (max 100) |
| `window._ccPlugins` | interface.js | Registered dropdown plugins |
| `window.cc` | drivers/dispatch.js | Driver registry + dispatcher |
| `document.body.dataset.ccAjaxActive` | network-monitor.js | Active XHR/fetch count |
| `document.body.dataset.ccAjaxLastActivity` | network-monitor.js | Last network timestamp |
| `document.body.dataset.ccTraces` | drivers/dispatch.js | Last 25 traces as JSON |
| `_ccReplaySessions` | background.js | Active teach sessions by tabId |

### sessionStorage (page context, tab-scoped)

| Key | Purpose |
|-----|---------|
| `_cc_teach_result` | Teach session result (adapter definition) |
| `_cc_teach_active` | Teach session in-progress flag |
| `_cc_corrections` | Accumulated corrections this session |
| `_cc_enrichments` | Unfilled fields operator completed manually |

---

## 5. CAPABILITY BOUNDARIES

### extractor.js — Perception Module
| CAN | CANNOT |
|-----|--------|
| Scan DOM for form fields | Fill fields |
| Resolve labels (most complete implementation) | Interact with dropdowns |
| Detect field types | Call backend APIs |
| Extract dropdown options | Manage auth |
| Detect radio/checkbox groups | Plan fill order |
| **VIOLATION**: Contains `injectCorrectionObserver` (execution-phase concern) | |

### executor.js — Action Module (monolithic)
| CAN | CANNOT |
|-----|--------|
| Fill text inputs (keystroke simulation) | Extract form fields |
| Select native/custom dropdown options | Map fields to profile |
| Handle date fields with format detection | Manage auth |
| Wait for network idle / DOM changes | Communicate back to popup |
| Verify fill success | Plan (just executes a plan) |
| Observe corrections post-fill | |
| Call AI fallback for ambiguous selects | |
| **VIOLATIONS**: Contains label resolution (should use extractor's), option matching (should share with rule-engine), direct Groq API calls (should use shared LLM client) | |

### mapper.js — Reasoning Module
| CAN | CANNOT |
|-----|--------|
| Map fields to profile keys | Access DOM |
| Use rules + fuzzy + AI matching | Fill fields |
| Cache mappings | Manage sessions |
| Detect confirm/twin fields | |
| Clean boundary — no violations | |

### popup.js — Orchestrator (GOD OBJECT)
| CAN | CANNOT |
|-----|--------|
| Orchestrate extract→map→plan→execute | Directly manipulate page DOM |
| Manage auth UI | |
| Inject scripts | |
| Manage settings | |
| Run AI agent flow | |
| **VIOLATIONS**: Contains inline planning (planner.js exists), inline fill orchestration, too many responsibilities (auth + UI + orchestration + settings + teach) | |

### background.js — Service Worker
| CAN | CANNOT |
|-----|--------|
| Listen to tab events | Access page DOM directly |
| Validate auth / refresh tokens | |
| Manage teach sessions | |
| Auto-detect portal pages | |
| Call Groq for auto-teach | |
| **VIOLATIONS**: Contains full teachOneField inline, duplicate getSemanticKey/calcConfidence/normalizeFieldLabel, own auth refresh logic | |

### drivers/ — Low-Level Action Layer (cleanest module)
| CAN | CANNOT |
|-----|--------|
| Validated DOM operations | Orchestrate multi-step fills |
| Keystroke text input | Access chrome.storage |
| Select options (native + Angular) | Communicate with background |
| Click elements | Call backend APIs |
| Wait for conditions | |
| Snapshot page state | |
| Trace all actions | |
| No violations — properly scoped | |

### rule-engine.js — Matching Engine
| CAN | CANNOT |
|-----|--------|
| Score label→profileKey matches | Access DOM |
| Normalized string comparison | Call AI |
| No violations | Handle custom components |

### Plugins (ng-dropdown, cascade-select, keystroke-input)
| CAN | CANNOT |
|-----|--------|
| Interact with specific component types | Handle other component types |
| **cascade-select VIOLATION**: Duplicates event dispatch from executor.js | |

---

## 6. PORTAL-SPECIFIC LOGIC

### Hardcoded Portal References

| Location | Portal | What's Hardcoded |
|----------|--------|------------------|
| executor.js | SSC OTR | `.value-area` selector for custom dropdowns |
| executor.js | DWR portals | `dwr.engine._execute` framework re-apply |
| executor.js | jQuery portals | `.trigger('change')` jQuery event dispatch |
| drivers/dom.js | SSC OTR | `div.value-area` in snapshot selectors |
| teach-runtime.js | SSC OTR | Default `triggerSelector = '.value-area'` |
| ng-dropdown.js | Angular portals | `.ng-select-container`, `div.ng-dropdown` |
| drivers/select.js | Angular portals | ng-select vs mat-select auto-detection |
| interface.js | ng-dropdown | Plugin registration hardcoded |
| executor.js | Angular portals | `mat-select`, `ng-select` detection in applyCustomSelect |
| drivers/input.js | UIDAI | Masked input verification (last-4 digits) |
| executor.js | UIDAI | Masked input `verifyValue()` last-4 check |
| shared/label-utils.js | Indian forms | `"fathers name"`, `"mothers name"`, `"pin code"` aliases |
| cascade-select.js | Indian portals | State→District→Taluka cascade assumption |
| background.js | Multiple | URL patterns in tabs.onUpdated for portal detection |

### What Should Be Generalized

1. **Component detection** → should be adapter registry, not inline selectors
2. **Event dispatch quirks** → should be per-portal config (DWR, jQuery, Angular)
3. **Cascade hierarchy** → should be configurable (not hardcoded State→District→Block)
4. **Masked input verification** → should be per-field config
5. **URL detection patterns** → should be in portal catalog (backend-served)

---

## 7. SUMMARY STATISTICS

| Metric | Value |
|--------|-------|
| Total JS files | 26 |
| Total code size | ~310KB |
| Dead files | 4 (24KB) |
| Duplicate logic instances | 13 patterns across 30+ locations |
| Active bugs from duplication | 1 (calcConfidence divergence) |
| Portal-specific hardcoded references | 14+ |
| Boundary violations | 7 modules with at least one |
| God objects | 2 (popup.js 50KB, executor.js 62KB) |

---

## 8. FOLLOW-UP ISSUES (Proposed for Phase 0)

### HIGH Priority

| # | Title | Severity | Effort |
|---|-------|----------|--------|
| 1 | **Unify option matching into shared/option-match.js** | HIGH | 3-4h |
| 2 | **Fix calcConfidence formula divergence** (active bug) | HIGH | 1h |
| 3 | **Consolidate label resolution into shared/dom-utils.js** | HIGH | 2-3h |

### MEDIUM Priority

| # | Title | Severity | Effort |
|---|-------|----------|--------|
| 4 | **Delete dead files** (planner.js, apiClient.js, teach-runtime.js, correction-runtime.js) | MEDIUM | 1-2h |
| 5 | **Extract isVisible into shared utility** | MEDIUM | 2h |
| 6 | **Consolidate API calls through shared auth client** | MEDIUM | 4-5h |
| 7 | **Create shared LLM client** (single Groq caller) | MEDIUM | 3-4h |
| 8 | **Consolidate network idle detection** | MEDIUM | 1-2h |

### LOW Priority (Architecture Planning)

| # | Title | Severity | Effort |
|---|-------|----------|--------|
| 9 | **Extract portal-specific logic into adapter config registry** | MEDIUM | 6-8h |
| 10 | **Document and plan executor.js → drivers/ migration** | LOW | 2h doc, 2-3d migration |
| 11 | **Archive scripts/fixes/ directory** | LOW | 30min |
| 12 | **Break popup.js god object into modules** | MEDIUM | 8-10h |

### Total Estimated Effort: ~35-45 hours for complete Phase 0 cleanup

---

## 9. ARCHITECTURAL OBSERVATIONS

### The Good
- **drivers/** directory has the cleanest architecture: validated, traced, schema-checked operations with no boundary violations
- **rule-engine.js** and **mapper.js** are well-scoped with clean interfaces
- **derive.js** is a pure function module with no violations
- The plugin system (interface.js) is a sound concept for extensible component handling

### The Bad
- **popup.js** (50KB) is a god object: auth + UI + orchestration + settings + teach management
- **executor.js** (62KB) is monolithic: option matching + execution + verification + correction observation + AI fallback
- **Two parallel execution architectures** that can never fully replace each other without unified planning

### The Ugly
- **5 implementations of option matching** that will diverge further with every bug fix
- **Active calcConfidence bug** causing inconsistent mapping quality assessment
- **No shared utilities** actually used — label-utils.js and apiClient.js exist but are partially or fully ignored
- **16 Python fix scripts** in scripts/fixes/ that reference old code patterns — archaeological artifacts

---

*Audit complete. No code changes made. This document serves as the baseline for Phase 0 refactoring.*
