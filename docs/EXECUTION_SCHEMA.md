# CyberControl Execution Schema v1.0
# Frozen: 2026-05-13
# DO NOT rename, remove, or redefine entries without incrementing schema version.

## Schema Versioning

```
actionVocabVersion: "1.0"
outcomeVersion: "1.0"
correctionVersion: "1.0"
observationVersion: "1.0"
```

---

## 1. Action Vocabulary (frozen)

| Action | Description | Plugin Owner |
|--------|-------------|--------------|
| `fill_text` | Set value on input/textarea via native setter + events | text-input strategy |
| `select_option` | Choose option in native `<select>` | cascade-select plugin / native-select strategy |
| `click_dropdown` | Open a custom dropdown (ng-dropdown, mat-select) | ng-dropdown plugin |
| `click_option` | Select item from open custom dropdown overlay | ng-dropdown plugin |
| `click_button` | Click navigation/expand/submit button | button-click plugin (future) |
| `scroll_to` | Scroll element into viewport | runtime |
| `wait` | Wait for stabilization (options populate, DOM quiet) | runtime / WaitEngine |
| `skip` | Intentionally skip field (no data, no capability, escalate) | runtime |

---

## 2. Outcome Taxonomy (frozen)

| Label | Meaning |
|-------|---------|
| `filled` | Value accepted and verified |
| `skipped` | Field intentionally not filled |
| `error` | Exception during fill attempt |
| `reset` | Value accepted then framework reset it |
| `pending` | Async fill in progress (ng-dropdown) |

---

## 3. Failure Reasons (frozen)

| Reason | Meaning |
|--------|---------|
| `no-element` | Selector did not resolve to DOM element |
| `no-option` | Dropdown had no matching option |
| `no-matching-option` | Options exist but none match value |
| `no-options-loaded` | Dependent dropdown options never populated |
| `wait-timeout` | WaitEngine timed out waiting for stabilization |
| `timeout-no-options` | ng-dropdown overlay never showed options |
| `custom-input-rejected` | Field cleared value (custom widget rejection) |
| `framework-reset` | Framework (Angular/React) reset value after fill |
| `no-adapter` | ng-dropdown has no interaction adapter |
| `verify-fail` | Post-fill verification detected wrong value |

---

## 4. Strategy/Plugin Attribution (frozen)

| Strategy | Source |
|----------|--------|
| `text-input` | Built-in text/textarea fill |
| `native-select` | Built-in native `<select>` fill |
| `radio` | Built-in radio button fill |
| `checkbox` | Built-in checkbox fill |
| `ng-dropdown-click` | Legacy ng-dropdown (pre-plugin) |
| `mat-select-click` | Angular Material select |
| `wait-engine` | Cascade field via WaitEngine |
| `confirm-mirror` | Confirm/retype field propagation |
| `plugin:cascade-select` | Cascade-select plugin |
| `plugin:ng-dropdown` | ng-dropdown plugin |
| `plugin:button-click` | Button-click plugin (future) |
| `plugin:file-upload` | File upload plugin (future) |

---

## 5. Correction Taxonomy (frozen)

| Type | Meaning |
|------|---------|
| `override` | AI filled a value, operator changed it (wrong mapping) |
| `completion` | AI skipped/failed, operator filled manually (missing capability) |

### Correction Triggers

| Trigger | Meaning |
|---------|---------|
| `submit` | Captured at form submission (highest confidence) |
| `unload` | Captured at page navigation (lower confidence, possibly abandoned) |

---

## 6. Verification Methods (frozen)

| Method | Description |
|--------|-------------|
| `dom_value` | Check `el.value` matches expected |
| `visual_text` | Check displayed text in custom widget |

---

## 7. Observation Schema (frozen)

### Per-field observation:
```json
{
  "selector": "form-field-0",
  "tag": "input",
  "type": "text",
  "label": "Full Name",
  "required": true,
  "enabled": true,
  "currentValue": "",
  "options": null
}
```

### Per-record (replay):
```json
{
  "selector": "form-field-0",
  "value": "SANDHYA KUMARI",
  "type": "text",
  "result": "filled",
  "failReason": null,
  "strategy": "text-input",
  "plugin": null,
  "dependsOn": [],
  "durationMs": 12,
  "ts": 1715600000000,
  "rv": "5.28"
}
```

### Per-correction:
```json
{
  "selector": "form-field-5",
  "field": "Year of Passing",
  "semanticKey": "year of passing",
  "profileKey": "passing_year_10th",
  "autofilledValue": "2017",
  "finalOperatorValue": "2015",
  "correctionType": "override",
  "originalResult": "filled",
  "plugin": null,
  "strategy": "text-input",
  "trigger": "submit",
  "ts": 1715600000000
}
```

---

## 8. Escalation Reasons (frozen)

| Reason | Meaning |
|--------|---------|
| `no-capability` | No plugin/strategy can handle this widget |
| `low-confidence` | AI mapping confidence below threshold |
| `sensitive-field` | Field requires operator verification (OTP, captcha, password) |
| `repeated-failure` | Same field failed on multiple attempts |

---

## 9. Phase Metadata (frozen)

| Field | Description |
|-------|-------------|
| `phase` | Execution phase number (1 = independent, 2+ = dependent) |
| `dependsOn` | Array of profileKey dependencies |
| `waitFor` | Stabilization signal: `options-populated` / `dom-quiet` / null |
| `populatesChildren` | Boolean: filling this triggers downstream option population |

---

## Migration Rules

- Adding new entries to any taxonomy: allowed without version bump (additive)
- Renaming or removing entries: REQUIRES version bump + migration script
- Changing meaning of existing entry: REQUIRES version bump
- All records MUST include `rv` (runtime version) for future filtering
