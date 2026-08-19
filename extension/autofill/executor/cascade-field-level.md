# cascade-field-level — Cascade Geography Level Identifier

## Purpose

Given any combination of a field's label text, profileKey, or selector string, identify which level of India's administrative cascade hierarchy this field belongs to. Also provides `CASCADE_PARENTS`: which levels must be filled and settled before a given level can be attempted.

This knowledge is needed to decide the **fill order** for government forms that use cascading dropdowns — for example, selecting a State unlocks District options via AJAX, selecting District unlocks Block, and so on. Without this capability, the fill loop would try to fill Block before State exists, and the options would never load.

---

## Accepted Inputs

`cascadeFieldLevel(label, profileKey, selector)`

All three parameters are strings. Any or all may be empty or null — the function concatenates them and searches the combined string. This means matching works regardless of which parameter carries the actual label text on any given form.

| Parameter | Type | Description |
|-----------|------|-------------|
| `label` | string | Field label text as read from the form DOM |
| `profileKey` | string | Profile data key (e.g. `'state'`, `'district'`) |
| `selector` | string | CSS selector or form-field-N string for this field |

---

## Returned Values

`cascadeFieldLevel` returns one of these strings, or `''` if the field does not belong to any recognised cascade level:

| Return value | What it means |
|--------------|---------------|
| `'state'` | State / Rajya field |
| `'district'` | District / Jila field |
| `'sub_division'` | Sub-division / Anumandal field |
| `'block'` | Block / Prakhand / Tehsil / Taluka field |
| `'panchayat'` | Panchayat / Village Panchayat field |
| `'village'` | Village / Gram / Mohalla field |
| `'police_station'` | Police Station / Thana field |
| `'post_office'` | Post Office field |
| `'pin_code'` | Pin Code / Postal Code field |
| `''` | Not a cascade field |

`CASCADE_PARENTS` is a plain object mapping each cascade level to the list of levels that must be settled before it:

```js
CASCADE_PARENTS = {
  district:       ['state'],
  sub_division:   ['district', 'state'],
  block:          ['district', 'sub_division', 'state'],
  panchayat:      ['block', 'district'],
  village:        ['block', 'district'],
  police_station: ['district', 'block'],
  post_office:    ['block', 'village', 'district'],
}
```

`state` has no entry — it has no parents and can always be filled immediately.

---

## Cascade Level Keywords

The function recognises both English and Hindi Unicode keywords for each level:

| Level | English keywords | Hindi keywords |
|-------|-----------------|----------------|
| state | state, rajya | राज्य |
| district | district, jila | जिला |
| sub_division | sub_div, subdivision, sub-division, sub division | अनुमंडल |
| block | block, prakhand, tehsil, taluka | प्रखंड, तहसील |
| panchayat | panchayat, village_panchayat | पंचायत |
| village | village, gram, mohalla | ग्राम, मोहल्ला |
| police_station | police, thana | थाना |
| post_office | post office, post_office | डाक घर, डाक |
| pin_code | pin, pincode, pin_code, pin code | पिन |

Matching is case-insensitive. The combined string `profileKey + ' ' + label + ' ' + selector` is tested against each pattern.

**Special rule for `state`:** the pattern `state|rajya|राज्य` is only matched if the combined string does not also contain `sub` — this prevents `sub_division` fields from being misclassified as `state`.

---

## What This Capability Owns

- All English and Hindi Unicode keyword patterns for each cascade level
- The `CASCADE_PARENTS` dependency map
- The `cascadeFieldLevel(label, profileKey, selector)` function
- The matching rule for ambiguous cases (state vs sub_division disambiguation)

## What This Capability Does NOT Own

- Any DOM interaction
- Any Chrome extension API
- Checking whether parent levels have actually been filled in the current form (that is the sequential fill loop's responsibility)
- Option matching or select filling (those are in the select widget handler)
- Record writing or debug telemetry

---

## Dependencies

None. Pure JavaScript — no DOM, no Chrome, no external imports.

---

## Current Consumers

- `select-helpers.js` — `installSelectHelpers` assigns `cascadeSemanticKey` to `k.cascadeSemanticKey`
- `dom-order.js` — `PRIORITY_KEYS` array encodes the same keywords (duplicate — replaced after extraction)
- `sequential.js` — uses `k.cascadeSemanticKey` to decide fill order for cascade fields

**Potential consumers:**
- `extension-service` fill planner (server-side) — currently has no access to this knowledge and infers or duplicates it
- Test harnesses
- Any future form analyser

---

## Failure / Unknown-Case Behaviour

- Returns `''` for any unrecognised field — never returns `undefined` or throws
- Null or undefined inputs are treated as empty strings — `(null || '')` pattern used
- If a field matches no pattern, it is treated as a non-cascade field and filled immediately without waiting

---

## Examples

```js
// English labels from real government forms
cascadeFieldLevel('State', '', '')            // => 'state'
cascadeFieldLevel('Select District', '', '')  // => 'district'
cascadeFieldLevel('Sub Division', '', '')     // => 'sub_division'
cascadeFieldLevel('Block Name', '', '')       // => 'block'
cascadeFieldLevel('Panchayat', '', '')        // => 'panchayat'
cascadeFieldLevel('Village', '', '')          // => 'village'
cascadeFieldLevel('Police Station', '', '')   // => 'police_station'
cascadeFieldLevel('Post Office', '', '')      // => 'post_office'
cascadeFieldLevel('Pin Code', '', '')         // => 'pin_code'

// Hindi labels
cascadeFieldLevel('राज्य', '', '')            // => 'state'
cascadeFieldLevel('जिला', '', '')             // => 'district'
cascadeFieldLevel('प्रखंड', '', '')           // => 'block'
cascadeFieldLevel('पंचायत', '', '')           // => 'panchayat'

// Via profileKey (when label is not in English/Hindi)
cascadeFieldLevel('', 'state', '')            // => 'state'
cascadeFieldLevel('', 'district', '')         // => 'district'

// Non-cascade fields
cascadeFieldLevel('Full Name', 'name', '')    // => ''
cascadeFieldLevel('Date of Birth', 'dob', '') // => ''
cascadeFieldLevel('', '', '')                 // => ''
cascadeFieldLevel(null, null, null)           // => '' (does not throw)

// Disambiguation: state vs sub_division
cascadeFieldLevel('Sub Division', '', '')     // => 'sub_division' (not 'state')
cascadeFieldLevel('State', '', '')            // => 'state' (no 'sub' present)
```

---

## Why This Is Reusable

The fill loop needs to know cascade level to decide fill order. The extension-service fill planner needs the same knowledge to decide plan ordering on the server. These are two different applications, different environments (browser and Node.js), but the same knowledge. Keeping this logic in one place means fixing a Hindi keyword once fixes it everywhere.
