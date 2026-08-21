# scan-ng-dropdowns — ng-select / Combobox / Custom Dropdown Scanner

## Purpose
Captures Angular ng-select and custom dropdown widgets not covered by earlier scan passes. Uses two strategies: ARIA role detection and trigger-based indirect detection.

## Public API (`globalThis.CcScanNgDropdowns`)

### `scan(doc, existingFields, helpers, startIdx) => { formFields, labelList }`

## Two strategies

### 1. ARIA role=combobox / role=listbox
Non-`INPUT`/`SELECT` elements with these roles. Skips search/query/filter by class/id.
Detects ng-select vs mat-select by tag name and class.

### 2. Container + trigger detection
- **Direct:** `ng-select`, `ng-dropdown`, `.ng-select`, `.ng-dropdown`, `[class*=custom-dropdown]`, `[class*=select-control]`
- **Indirect:** elements containing `.value-area`, `.ng-value-container`, `.ng-select-container` → walks up to field container

## Duplicate prevention
Before adding a candidate, checks:
1. `el.matches(existingField.selector)` — same element
2. `el.querySelector(existingField.selector)` — contains captured element
3. `el.closest(existingField.selector)` — is inside captured element

## SSC/RRB/NTA workaround
These forms reuse `id="dropsection"` for every dropdown. All ng-dropdown candidates get a unique `data-cc-id="ng-dd-N"` selector regardless of existing id.
