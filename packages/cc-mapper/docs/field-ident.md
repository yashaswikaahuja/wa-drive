# field-ident — Field Identity Normalisation

## Purpose
Converts raw DOM field data into stable normalised identity strings for alias matching.

## Public API (`globalThis.CcFieldIdent`)
- `normalizeIdent(s)` — lowercase + collapse separators to `_`
- `labelPrimaryIdent(field)` — label-primary identity with matchBy, labelStrong
- `normChoice(s)` — strip non-alphanumerics for option comparison

## labelPrimaryIdent
Label text is double-weighted. DOM id/name are soft hints only.
Returns `{ ident, matchBy, labelEn, labelRaw, labelStrong }`.
`matchBy = 'dom-fallback'` when label is weak (< 3 alnum English chars, < 4 raw chars).
