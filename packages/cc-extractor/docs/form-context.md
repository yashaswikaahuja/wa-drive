# form-context — Form Guard + Element Skip + Label Helpers

## Purpose
Three helpers used by every extractor scan pass. Determines whether a page is worth scanning, which elements to skip, and whether a label string is meaningful.

## Public API (`globalThis.CcFormContext`)

### `isInSkipContext(el)`
Returns `true` if `el` is inside a navigation, header, footer, search, or banner context. These containers are never part of a form worth filling.

Checked selectors: `nav`, `header`, `footer`, `[role="navigation"]`, `[role="search"]`, `[role="banner"]`

### `isGoodLabel(s, ccDomUtils?)`
Returns `true` if the label string is non-empty, contains at least one alphanumeric character, and is at least 2 chars long. Delegates to `ccDomUtils.isGoodLabel` when provided.

### `hasFormContext(doc, ccDomUtils?)`
Returns `true` if the page has a real form worth scanning. Requires either:
- At least one `<form>` element, **or**
- At least 2 labeled non-skip inputs (`input[type=text/email/tel]`, `textarea`)

Returns `false` early — callers should bail out if this returns false.

## Dependencies
- `ccDomUtils` — injected (not read from `window`) for testability. Falls back to inline logic if not provided.

## Notes
- `isInSkipContext` uses `Element.closest()` — available in all modern browsers and extension contexts.
- The 2-labeled-input threshold is intentional — some Indian govt forms (SSC, RRB, NTA) don't use `<form>` tags.
