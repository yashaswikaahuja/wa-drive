# CyberControl AutoFill — Extension Design Document

**Version:** 3.63 | **Manifest:** MV3 | **Target:** Indian government forms (SSC OTR, NIC, Railway, etc.)

---

## Overview

A Chrome extension that auto-fills government exam registration forms from student profiles stored on a backend. It handles both standard HTML inputs and custom Angular component dropdowns (`div.ng-dropdown`) via a learned adapter system.

---

## File Structure

```
extension/
├── manifest.json                  — MV3, service_worker, permissions
├── background.js                  — Service worker: owns teach session lifecycle
├── popup.html / popup.js          — UI orchestrator (Steps 1–7)
├── content.js                     — Minimal: ping handler only
├── shared/
│   └── label-utils.js             — normalizeLabel, getSemanticKey, calcConfidence
├── autofill/
│   ├── extractor.js               — extractFormFieldsWithFingerprint
│   ├── mapper.js                  — fuzzyMatch, aiMatch (Groq)
│   └── executor.js                — fillFormFieldsSequential
└── runtime/
    ├── teach-runtime.js           — Legacy (not used by background.js)
    └── correction-runtime.js      — injectCorrectionObserver
```

---

## Autofill Pipeline (popup.js Steps 1–7)

### Step 1 — Extract Form Fields
`extractFormFieldsWithFingerprint()` injected via `executeScript` into the active tab.

Captures:
- Standard inputs: `input`, `textarea`, `select`
- Angular Material: `mat-select`, `mat-checkbox`, `mat-radio-button`
- ARIA comboboxes: `[role="combobox"]`, `[role="listbox"]`
- **Does NOT capture** `div.ng-dropdown` — those are handled separately in Step 5c

Returns `{ formFields[], formKey }` where `formKey` is a stable hash of `hostname + page title + top-10 labels`.

Label resolution priority:
1. `<label for="id">`
2. Previous `<td>` sibling
3. Parent container's `label` / `mat-label`
4. `placeholder`
5. `aria-label`

### Step 2 — Load Saved Mappings
`GET /mappings/:formKey` → `{ [semanticKey]: { profileKey, fills, corrections } }`

Confidence formula: `fills / (fills + corrections * 3)`. Threshold: `>= 0.4` to apply.

### Step 3 — Apply Saved Mappings
High-confidence saved mappings applied first.

### Step 4 — Fuzzy Match (mapper.js)
`fuzzyMatch(unmappedFields, profile)` — rule-based matching using `FIELD_ALIASES`.

Key behaviors:
- Identifier built from: `label + label + placeholder + id + name` (label weighted 2×)
- DOB split: detects separate day/month/year dropdowns
- First/last/middle name split
- Education table fields matched via `eduAliases` (board, roll, year, marks)
- Skips Hindi transliteration fields
- Skips "changed name" fields unless `profile.changed_name` exists
- Radio buttons: matched by group name + option label containing profile value

### Step 5 — Groq AI Match
`aiMatch(unmappedFields, profile, groqKey)` — sends field metadata + profile to Groq (`llama-4-scout-17b`), parses JSON response mapping field index → profile key.

### Step 5b — Load Portal Adapters
`GET /adapters/:hostname` → `{ [componentClass]: adapterObj }`

Adapter shape:
```json
{
  "triggerSelector": ".value-area",
  "optionSelector": "li",
  "verifySelector": ".select-type",
  "optionsContainer": ""
}
```

### Step 5c — Map ng-dropdown Fields
Scans `div.ng-dropdown` elements on the page. For each unfilled one:
- Skips labels matching `/verify|confirm/i` or `/^(-+select-+|--|please)/i`
- Looks up profile key via explicit `LABEL_MAP` first, then fuzzy key match
- Adds to `mapping` as `ng-dropdown-{domIndex}` with `type: 'ng-dropdown'`

```js
const LABEL_MAP = {
  'gender': 'gender',
  'state/ut': 'state', 'state': 'state',
  'district': 'district',
  'year of passing': 'year_of_passing',
  'matriculation (10th class) year of passing': 'passing_year_10th',
  'matriculation (10th class) education board': 'board_10th',
  'your highest level of educational qualification': 'course_name',
  'nationality': 'nationality',
  'religion': 'religion',
};
```

### Step 6 — Execute Fill (executor.js)
`fillFormFieldsSequential(mapping, filledBySource, portalAdapters)` injected into page.

**Sort order:** state → district → block → panchayat (dependent dropdowns filled first)

**Per-field scheduling:**
| Type | Delay |
|------|-------|
| `mat-select` / `mat-radio` | +800ms each |
| `ng-dropdown` | +2000ms each |
| Dependent text fields | +600ms |
| Other text/select | Synchronous |

**ng-dropdown replay sequence:**
1. `trigger.click()` (using `adapter.triggerSelector`)
2. Wait 400ms for Angular to render options panel
3. Poll every 300ms (max 10 attempts = 3s):
   - Search root: `adapter.optionsContainer` → `app-dropdown .options/ul` → `document`
   - Filter: `offsetParent !== null` (visible only)
   - Match: exact text → includes text
4. On match: `opt.click()`, then after 1000ms verify via `adapter.verifySelector`
5. Write result to `sessionStorage._cc_replay_results`: `'ok' | 'verify-fail' | 'no-option' | 'no-adapter'`

**`<select>` fill strategy:**
- Exact value → exact text → starts-with → contains → word overlap
- Fires: `mousedown, mouseup, click, input, change` + native setter
- Retry loop (15 attempts × 200ms) for dependent dropdowns not yet populated
- Calls `el.onchange` directly for ASP.NET compatibility

**Verify/confirm field auto-fill:**
After filling a field, scans for sibling inputs whose label contains `re-enter|confirm|verify` + base label word, and fills them with the same value. Validates sensitive fields (Aadhaar=12 digits, mobile=10 digits, email format, PAN format) before filling.

### Step 7 — Correction Observer
`injectCorrectionObserver()` watches autofilled fields for user corrections. On `change`:
- Identifies new profile key from corrected value
- Batches corrections (1.5s debounce)
- `POST /mappings/:formKey` with `{ corrections: 1 }` delta

Also watches unfilled fields for profile enrichment (new values typed by user → stored in `sessionStorage._cc_enrichments`).

---

## Assisted Learning Mode (Teach Mode)

Triggered when autofill finds unresolved interactive fields (`ng-dropdown`, `mat-select`, `mat-radio`, `select`).

### Flow

```
popup.js                    background.js (SW)              Page
   |                               |                          |
   |-- write _cc_teach_job ------->|                          |
   |   { tabId, fields,            |                          |
   |     backendUrl, hostname,     |                          |
   |     ts }                      |                          |
   |                               |-- clear _cc_teach_active |
   |                               |-- clear _cc_teach_result |
   |                               |-- inject teachOneField -->|
   |                               |                          | (shows red badge)
   |                               |                          | (user clicks dropdown)
   |                               |                          | (user selects option)
   |                               |                          | (writes _cc_teach_result)
   |                               |<-- poll sessionStorage --|
   |                               |-- POST /adapters/:host   |
   |<-- _cc_teach_progress --------|                          |
```

### SW Lifecycle
- `_teachRunning` flag + `_lastTeachTs` dedup prevent re-entrant sessions
- Keepalive: `setInterval(() => chrome.storage.local.set({ _sw_ping: Date.now() }), 20000)` — prevents SW death during 45s teach window
- Page-level lock: `sessionStorage._cc_teach_active === '1'` prevents double injection

### teachOneField (injected into page)
1. Finds root `div.ng-dropdown` by `field.domIndex` (precise, handles duplicate labels)
2. Highlights root with red outline + shadow DOM badge overlay
3. Captures trigger click: accepts clicks within 20px of root bounds
4. State poller (200ms): re-queries `.select-type` fresh each tick (Angular replaces DOM nodes)
5. On value change (not placeholder): infers `optionSelector` and `optionsContainer` from visible `li` elements matching the selected value
6. Writes result to `sessionStorage._cc_teach_result`:
```json
{
  "componentClass": "ng-dropdown",
  "triggerSelector": ".value-area",
  "optionsContainer": "app-dropdown.ng-dropdown-panel",
  "optionSelector": "li",
  "verifySelector": ".select-type",
  "learnedValue": "Female"
}
```

---

## Backend API

Base: `https://<tunnel>/api`

| Method | Path | Purpose | Auth | Storage |
|--------|------|---------|------|---------|
| GET | `/profiles` | **List profiles for the JWT's workspace** (used by extension popup picker) | Bearer JWT | DB `profiles` table, scoped by `workspace_id` |
| GET | `/profiles/:id` | Full profile (incl. `data` jsonb) for autofill | Bearer JWT | DB `profiles` |
| POST | `/customers/persons` | Create a new person/profile | Bearer JWT | DB `profiles` |
| PATCH | `/customers/persons/:id` | Update fields on a person (autofill confirmations) | Bearer JWT | DB `profiles` |
| GET | `/customers/households` | List households grouped by phone | Bearer JWT | DB `profiles` |
| GET | `/adapters/:hostname` | Get all adapters for a site | service-secret | DB `adapters` |
| POST | `/adapters/:hostname` | Save/merge adapter (requires `componentClass`) | service-secret | DB `adapters` |
| PATCH | `/adapters/:hostname/:componentClass` | Partial adapter update | service-secret | DB `adapters` |
| GET | `/mappings/:formKey` | Get saved field→profileKey mappings | Bearer JWT | DB `mappings` |
| POST | `/mappings/:formKey` | Update mapping confidence scores | Bearer JWT | DB `mappings` |
| GET | `/extension/version` | `{ version, download_url }` | none | static |
| GET | `/extension/download` | Download extension zip | none | static |

> **Important:** Profile endpoints are workspace-scoped via JWT. Each operator only sees profiles belonging to their workspace. The legacy file-based store at `backend/data/profiles.json` is deprecated — do NOT add new code that reads from it.

---

## Known Issues (v3.63)

### `⚠ option not found` for Gender, Education Board, Year of Passing

**Symptom:** Trigger click opens the dropdown, but `li` elements are not found during polling.

**Root cause (suspected):** The options panel for these specific SSC dropdowns may render outside `app-dropdown` scope, or the `offsetParent !== null` visibility filter is too strict. The saved adapter has `optionsContainer: ""` (empty), so the search falls back to `document.querySelector('app-dropdown .options, app-dropdown ul, ...)` which may not match.

**Debug added in v3.63:** Console logs `[CC] poll attempt=N opts=M v=value root=TAG` on every poll tick. Check browser console after autofill to see what `opts` count and `root` tag are reported.

**State/UT and District work correctly** — same adapter, same site. Difference may be timing (these dropdowns load options asynchronously after a parent selection).

### Adapter `optionsContainer` is empty
The teach session's option inference walks up the DOM from the selected `li` looking for `app-dropdown`, `ul`, or containers with class `option|dropdown|list|menu`. If none found within 6 levels, `containerSel` stays `""`. Re-teaching Gender should capture the container if the options panel is inside a named component.

---

## Profile Schema (example)

```json
{
  "phone": "9823745234",
  "name": "SANDHYA KUMARI",
  "dob": "14/01/2000",
  "father_name": "SUDHIR PRASAD",
  "mother_name": "LALITA DEVI",
  "gender": "FEMALE",
  "aadhaar_number": "729027826597",
  "address": "C/O: Sudhir Prasad, Village Charwara, Atri, Gaya, Bihar - 823311",
  "state": "Bihar",
  "district": "Gaya",
  "nationality": "INDIAN",
  "religion": "hindu",
  "email": "sandhyakumarisanya@gmail.com",
  "mobile": "8727854089",
  "pin_code": "823311",
  "course_name": "INTERMEDIATE",
  "year_of_passing": "2017",
  "board_12th": "BIHAR SCHOOL EXAMINATION BOARD, PATNA",
  "passing_year_12th": "2017",
  "marks_12th": "254",
  "board_10th": "BIHAR SCHOOL EXAMINATION BOARD, PATNA",
  "passing_year_10th": "2015",
  "roll_no_10th": "1500099",
  "roll_no_12th": "17010032"
}
```

---

## Questions for Review

1. **ng-dropdown option not found** — Is polling `document` for `li[offsetParent !== null]` reliable enough, or should we use `document.elementsFromPoint` at the dropdown's position to find the options panel?

2. **Teach mode option inference** — Currently infers `optionSelector` by walking up from the clicked `li`. Should we instead capture the options container by recording which element becomes visible after the trigger click (MutationObserver on `display`/`visibility` change)?

3. **Adapter sharing** — Adapters are saved per `hostname` + `componentClass`. If the same Angular component is used across multiple portals (SSC, NIC), should we share adapters by `componentClass` alone, or keep them hostname-scoped?

4. **State poller false positives** — The teach poller previously triggered on Angular's internal DOM mutations (innerHTML changes unrelated to value). Fixed by checking only `.select-type` text change. Is there a more robust signal (e.g., `aria-selected`, `data-value` attribute)?

5. **Sequential ng-dropdown timing** — 2000ms per dropdown is conservative. Can we reduce it by detecting when the options panel closes (MutationObserver) instead of fixed delay?
