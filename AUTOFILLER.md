# CyberControl AutoFill Extension — Technical Reference

**Current stable version:** v3.23  
**Extension file:** `extension/popup.js`  
**Backend:** `backend/dist/server.js` (TypeScript source: `backend/src/server.ts`)

---

## Architecture Overview

```
Chrome Extension (popup.js)
  │
  ├── extractFormFieldsWithFingerprint()   [runs in page context]
  ├── fuzzyMatch()                         [runs in popup context]
  ├── aiMatch()                            [calls Groq API]
  ├── fillFormFieldsSequential()           [runs in page context]
  ├── injectCorrectionObserver()           [runs in page context]
  └── saveLearning()                       [calls backend]
        │
        └── Backend (Express on GCP)
              ├── GET  /api/extension/version   → reads manifest.json dynamically
              ├── GET  /api/extension/download  → serves extension.zip
              ├── POST /api/debug/form          → saves form debug data to /tmp/cc_form_debug.json
              ├── GET  /api/mappings/:formKey   → load saved field mappings
              ├── POST /api/mappings/:formKey   → save/update field mappings
              └── GET/POST /api/profiles        → student profiles
```

---

## Autofill Flow (Step by Step)

### Step 1 — Field Extraction
`extractFormFieldsWithFingerprint()` runs in the page context via `chrome.scripting.executeScript`.

Extracts:
- Native inputs: `input[type=text/email/tel/number/date/radio/checkbox]`, `textarea`, `select`
- Angular Material: `mat-select`, `mat-checkbox`, `mat-radio-button`, `mat-radio-group`
- Custom dropdowns: `[role="combobox"]`, `[role="listbox"]`

Each field gets:
```js
{
  selector,    // CSS selector to find the element
  id,          // element.id
  name,        // element.name
  label,       // text from associated <label>, mat-label, aria-label, or placeholder
  type,        // 'text'|'select'|'radio'|'checkbox'|'mat-select'|'mat-checkbox'|'mat-radio'
  placeholder,
  value,       // current value
  index        // position in querySelectorAll
}
```

**Selector assignment priority:**
1. `#id` — if element has an id
2. `[name="x"][value="y"]` — if has name AND value is not `"on"` (Angular radio fix)
3. `[data-cc-idx="N"]` — stamped on element, stable across re-renders

**Form fingerprint** = hash of `hostname + title + top-10 labels` → used as `formKey` for saved mappings.

---

### Step 2 — Debug Send
Sends extracted fields + dropdown HTML snapshot to `POST /api/debug/form` for analysis.  
Saved to `/tmp/cc_form_debug.json` on the GCP server.

---

### Step 3 — Load Saved Mappings
`GET /api/mappings/:formKey` → returns `{ semanticKey: { profileKey, fills, corrections } }`

Confidence formula: `fills / (fills + corrections * 3)`  
Only applied if confidence ≥ 0.4.

---

### Step 4 — Fuzzy Match
`fuzzyMatch(formFields, profile)` — pure JS, no API call.

Builds `ident` from: `[label, label, placeholder, id, name].join(' ').toLowerCase().replace(/[-\s:*()'./$]/g, '_')`  
(label repeated twice to give it more weight than generic IDs)

Matches against `FIELD_ALIASES`:
```js
name, dob, father_name, mother_name, address, mobile, email,
aadhaar_number, pan_number, epic_number, category, gender,
pincode, state, district, nationality, marital_status, religion,
domicile_state, qualification_status, year_of_passing, grade,
degree_name, university_name, village, post_office, police_station,
block, house_no, street
```

**Special handling:**
- DOB split: separate day/month/year dropdowns detected by label
- First/last/middle name: detected by `first_name`/`last_name`/`middle_name` in ident
- Hindi fields: skipped (ServicePlus auto-converts from English on Tab)
- Education table rows: matched against separate `eduAliases`
- Radio buttons: matched by label-value comparison → mapped as `type: 'radio-click'`

---

### Step 5 — AI Match (Groq)
Only for fields still unmapped after fuzzy match.  
Uses `meta-llama/llama-4-scout-17b-16e-instruct` via Groq API.  
Returns index→profileKey JSON, max 200 tokens.

---

### Step 6 — Type-Safety Guard
Before filling, removes any mapping where:
- Field type is `checkbox` AND value is not boolean-like (`yes/no/true/false/1/0/on/off`)

---

### Step 7 — Fill (Sequential)
`fillFormFieldsSequential(mapping, filledBySource)` runs in page context.

**Sort order** (dependent dropdowns filled first):
Uses `filledBySource[selector].label` to detect `state → district → block → panchayat` order.  
Falls back to selector string if label not available.

**Fill handlers by type:**

| Type | Method |
|------|--------|
| `text/email/tel/number` | `focus` → native value setter → `keydown+keypress+input+keyup+change+blur` with proper `KeyboardEvent` (keyCode set) |
| `select` | Find matching option by value/text → `applySelect()` with full ASP.NET event sequence + retry loop for dependent dropdowns |
| `radio` | Find radio in group by value or label text → `click+change` |
| `radio-click` | Direct click on the specific pre-matched radio element |
| `checkbox` | Boolean check → `click+change` if state needs to change |
| `mat-select` | Click trigger → wait 400ms → find `mat-option` by text → click |
| `mat-checkbox` | Click if checked state needs to change |
| `mat-radio` | Match by label text → click inner `input[type=radio]` |

**Dependent dropdown retry:** If `<select>` has no real options yet (AJAX not loaded), polls every 200ms up to 15 attempts (3 seconds).

**Verify fields:** After filling a field, also fills any `re-enter/confirm/verify` fields with the same value (with strict validation for sensitive fields like Aadhaar/mobile/email/PAN).

---

### Step 8 — Correction Observer
`injectCorrectionObserver()` watches autofilled fields for user corrections.

- Correction = user changes a filled field to a different value
- Batched with 1.5s debounce → `POST /api/mappings/:formKey` with `delta: { corrections: 1 }`
- Also watches unfilled fields for profile enrichment (new values user types)

---

### Step 9 — Save Learning
Triggered by "Save Learning" button.  
Sends `delta: { fills: 0.3 }` for all filled fields (weak signal).  
Corrections send `delta: { fills: 1 }` (strong signal).

---

## Known Working Forms

| Form | Portal | Notes |
|------|--------|-------|
| Bihar RTPS Domicile/Caste/Income | serviceonline.bihar.gov.in | Native `<select>` with custLGDHierarchy AJAX dependent dropdowns. Text fills work. Dependent dropdowns fill after AJAX loads. |
| SSC OTR Personal Details | ssc.gov.in | Angular form. Text fills work. Dropdowns use custom `ng-dropdown` component — **not yet supported**. |

---

## Known Limitations / Pending Work

### SSC OTR Dropdowns (ng-dropdown)
The SSC form uses a custom Angular component `div.ng-dropdown` with:
```html
<div class="ng-dropdown">
  <div class="label required"> 4. Gender </div>
  <div class="value-area" tabindex="0">   ← click trigger
    <div class="select-type">Select</div>
  </div>
  <!-- options rendered here after click — structure unknown -->
</div>
```

**Status:** Extraction added in v3.26 (reverted). Fill logic needs the exact option element HTML when dropdown is open.  
**To get it:** Open SSC form → click Gender dropdown → run in console:
```js
copy(document.querySelector('div.ng-dropdown').outerHTML)
```

### SSC Radio Buttons
Angular sets `value="on"` for all radio inputs, making `[name="selected"][value="on"]` ambiguous.  
Fix added in v3.26 (reverted with v3.23 restore) — uses `data-cc-idx` instead.

---

## Backend Deployment

- **Server:** GCP VM at `136.115.232.70`, user `bharattvv542`
- **SSH key:** `~/.ssh/gcp_worker`
- **Process manager:** PM2 (`cybercontrol-hub` process)
- **Tunnel:** Cloudflare tunnel → `https://tracker-exhibit-subjective-vintage.trycloudflare.com`
- **Repo:** `https://github.com/yashaswikaahuja/wa-drive`
- **Extension zip:** `/opt/cybercontrol-hub/extension.zip`

**Deploy workflow:**
```bash
# Edit extension/popup.js
# Bump CURRENT_VERSION and manifest.json version
zip -j extension.zip extension/popup.js extension/content.js extension/manifest.json extension/icon.png
git add extension/popup.js extension/manifest.json extension.zip
git commit -m 'vX.XX: description'
git push
```

**Version check:** Backend reads version from `extension/manifest.json` dynamically — no hardcoding needed.

---

## Profile Keys Reference

```
name, father_name, mother_name, dob, mobile, email,
aadhaar_number, pan_number, epic_number, address, pincode,
state, district, block, village, post_office, police_station,
gender, category, nationality, marital_status, religion,
domicile_state, qualification_status, year_of_passing, grade,
degree_name, university_name, roll_number,
board_10th, board_12th, roll_no_10th, roll_no_12th,
passing_year_10th, passing_year_12th, marks_10th, marks_12th,
school_name, college_name
```
