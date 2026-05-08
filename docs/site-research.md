# Government Form Site Research Notebook
_Last updated: 2026-05-08_

---

## 1. SSC OTR — ssc.gov.in/candidate-portal/one-time-registration/personal-details
**Framework:** Angular 15.2.10  
**Access:** ssc.gov.in → Login or Register → Register Now (session required, direct URL redirects to home)

### Dropdown Type: Custom `div.ng-dropdown`
- Component: `<div class="ng-dropdown custom-dropdown-css-class">`
- Label: inside as `<div class="label required">5. Gender</div>`
- Trigger: `.value-area` (click to open)
- Options: `<li>` elements inside the component (already in DOM, NOT dynamically added)
- Current value: `.value-area .value`
- Verify selector: `.select-type`
- **Adapter key:** `ng-dropdown` on `ssc.gov.in`

### Dropdown Behavior
- Options are in DOM before click (not lazy-loaded via mutation)
- MutationObserver fires 0 mutations → executor falls back to `document` → picks up nav `<li>` items
- **Fix needed:** search within `root` component when no overlay found (Priority 4 in executor)
- State/District dropdowns: `UL.list.scroll` — options loaded dynamically ✓ working

### Text Inputs
- No `id`/`name` on most inputs — identified by `form-field-N` fingerprint
- Labels: `label[for]` pattern, numbered (e.g. "2. Candidate Name (As per Matriculation Certificate)*")
- "Candidate Name (As per Matriculation Certificate)" — contains "matric"+"certificate" → wrongly treated as education row → **fixed in v3.85**
- DOB: Angular Material datepicker, `placeholder="dd-mm-yyyy"`, no label → **fixed in v3.85**

### Radio Buttons
- Native `<input type="radio">` with `name="selected"`, `name="changed"`, `name="isAddressSame"`
- Labels: `label[for]` or adjacent text

### Known Issues (v3.89)
- ✅ Gender: Female — working
- ✅ State/District: Bihar/Gaya — working  
- ✅ Education Board 10th: Bihar School Examination Board — working
- ✅ Year of Passing: 2015 — working
- ❌ Highest Education Qualification: was matching `course_name:"INTERMEDIATE"` instead of `highest_education_qualification:"Graduation"` — **fixed in v3.89**
- ❌ Aadhaar: fills `*` from masked profile key — needs profile cleanup
- ❌ Roll Number (9th field): not in profile — expected skip

---

## 2. SSC OTR Scribe — ssc.gov.in/candidate-portal/one-time-registration/scribe-otr-details
**Framework:** Angular 15.2.10  
**Same dropdown type as candidate OTR** — `div.ng-dropdown`

### Fields (24 dropdowns, 16 text inputs, 4 radios)
- Aadhaar, Name, Father, Mother, DOB (datepicker), Gender, Education Qual, Board 10th, Roll 10th, Year 10th, State, District, Mobile, Email
- Radio: `name="changed"` (name changed?), `name="isAddressSame"`

---

## 3. UPESSC BEd — bed.upessc.org/otr/register/
**Framework:** Nuxt.js / Vue 3 SPA

### Dropdown Type: Vue custom `div.relative > button > span`
- Component: `<div class="relative"><button type="button"><span>DAY</span></button>`
- Label: `<label>` as `previousElementSibling` of parent `<div class="flex-1">`, found by walking up 4 levels
- Options: teleported to `<body>` as `div.fixed` — NOT inside root component
- Trigger: the `<button>` itself
- **No adapter yet** — needs teaching

### Text Inputs
- No `id`/`name` — pure Vue `v-model`
- Label: `previousElementSibling` `<label>` of the input's parent div
- 9 text inputs: full_name, father_name, mother_name, aadhaar, mobile, email + confirm fields

### Native Selects (3)
- Gender: `<select class="w-full border...">` — options: MALE/FEMALE/TRANSGENDER
- Re-enter Gender: same
- Identity Proof: Aadhaar Card, Driving License, PAN Card, Passport, Voter ID

### DOB: 6 `div.relative` dropdowns (DAY/MONTH/YEAR × 2 for DOB + re-enter DOB)

---

## 4. Bihar RTPS — serviceonline.bihar.gov.in (ServicePlus platform)
**Framework:** Plain HTML / jQuery  
**Access:** Home → ऑनलाइन आवेदन menu → service link (JS-driven, no direct URL)  
**Form:** Form-XII — Residence Certificate Application

### Structure
- **Table-based layout** — labels in `<td>` cells, inputs in adjacent `<td>`
- Label pattern: `label[for]` ✓
- Bilingual labels: Hindi + English (e.g. "Name of Applicant / आवेदक का नाम")
- Input `name` attribute: numeric IDs (e.g. `name="78248"`) — no semantic names

### Dropdown Type: Native `<select>`
- 31 native selects
- Cascading: District → Sub-Division → Block → Panchayat (options load on parent change)
- State: pre-filled "BIHAR"
- Salutation: श्री/श्रीमती/सुश्री

### Radio Buttons: Native `<input type="radio">`
- 27 radios, 5 groups
- Gender: `name="17290"` — values 1/2/3 (Male/Female/Third Gender)
- Application type: `name="17285"` — General/Tatkal
- Area type: `name="75290"` — Village Panchayat/Municipal Corp/Municipality/Town Panchayat

### Key Observations
- Input names are numeric → extractor must rely on labels
- Hindi labels need stripping for matching
- Cascading selects need sequential fill (district after state, block after district)
- No JS framework — standard form submit

---

## 5. Framework Summary Table

| Site | Framework | Dropdown Type | Label Pattern | Notes |
|------|-----------|---------------|---------------|-------|
| SSC OTR | Angular 15 | `div.ng-dropdown` (custom) | `label[for]` + numbered | Options in DOM, not lazy |
| UPESSC BEd | Nuxt/Vue 3 | `div.relative>button>span` | prev-sibling `<label>` | Options teleported to body |
| Bihar RTPS | Plain/jQuery | Native `<select>` | `label[for]` bilingual | Cascading selects, numeric names |
| BPSC | — | — | — | Site down/blocked |
| UPSSSC | Plain/jQuery | — | — | No form on homepage |
| MP Online | Plain/jQuery | Native `<select>` | — | Portal/redirect site |

---

## 6. Teaching System Issues

### SSC ng-dropdown teaching
- `getDisplayText()` reads `.select-type` or `.value-area .value` ✓
- MutationObserver on root — works since options are in DOM
- Teaching should work — needs test

### UPESSC Vue teaching
- Options teleported to `<body>` as `div.fixed` — MutationObserver on root won't see them
- Need to also observe `document.body` for new `div.fixed` after trigger click
- `getDisplayText()` reads `button > span:first-child` ✓

### Bihar RTPS teaching
- Native `<select>` — no teaching needed, executor handles directly
- Cascading selects: need to fill parent first, wait for child options to load

---

## 7. Profile Field Gaps Found

| Missing Field | Needed For |
|---------------|-----------|
| `roll_number` (10th) | SSC OTR field 9 — have as `roll_no_10th` ✓ |
| `highest_education_qualification` | SSC OTR field 8 — have ✓ |
| `salutation` | Bihar RTPS — not in profile |
| `area_type` | Bihar RTPS — Village/Municipal |
| `sub_division` | Bihar RTPS cascading |
| `panchayat` | Bihar RTPS — have ✓ |
| `category` | Many forms — missing |

---

## 8. Bugs Fixed Per Version

| Version | Fix |
|---------|-----|
| v3.83 | div.relative scanner, label walk-up, DAY/MONTH/YEAR placeholder detection |
| v3.84 | Label walk-up 5 levels, teleported options detection, DAY/MONTH/YEAR as unfilled |
| v3.85 | Candidate Name not treated as education row, DOB dd-mm-yyyy placeholder |
| v3.87 | Reverted v3.86 regression |
| v3.88 | Executor Priority 4: search within root when no overlay (SSC in-DOM options) |
| v3.89 | `highest_education_qualification` alias, block `degree_name` on `highest` fields |
