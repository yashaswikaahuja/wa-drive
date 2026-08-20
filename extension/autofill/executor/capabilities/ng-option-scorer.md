# ng-option-scorer — Angular Dropdown Option Scorer

## Purpose

Scores a dropdown option's text against a planned fill value to determine how well they match. Used when selecting the best option from an `ng-dropdown` / `ng-select` list where an exact value match is unlikely (government forms show localised text; the profile may contain English or Hindi synonyms).

---

## Public API

Registered on `globalThis.CcNgOptionScorer`:

```js
scoreOption(optText, planned) => number (0–100)
scoreAndPick(opts, planned, minScore?) => { text, node, score } | null
```

### scoreOption

| Parameter | Type | Description |
|-----------|------|-------------|
| `optText` | string | Option label text |
| `planned` | string | Planned fill value |

Returns 0–100.

### scoreAndPick

| Parameter | Type | Description |
|-----------|------|-------------|
| `opts` | `Array<{text, node}>` | Candidate options |
| `planned` | string | Planned fill value |
| `minScore` | number (optional) | Minimum score to accept (default: 50) |

Returns `{ text, node, score }` or `null` if no option meets `minScore`.

---

## Scoring Cascade

| Score | Condition |
|-------|-----------|
| 100 | Exact match (case-insensitive, trimmed) |
| 80 | `optText.includes(planned)` |
| 70 | `planned.includes(optText)` and optText > 3 chars |
| 60 | Token overlap ≥ 2 (tokens > 2 chars, split on `[\s()+,/\-]+`) |
| 55 | Education-level synonym match (see synonym table) |
| 50 | Single-token overlap when either string is short (≤ 2 tokens) |
| 0 | No match |

---

## Education Synonyms (Indian forms)

| Group | Synonyms |
|-------|----------|
| Intermediate | `intermediate`, `higher secondary`, `10+2`, `12th`, `hsc`, `senior secondary` |
| Matriculation | `matriculation`, `10th`, `sslc`, `secondary`, `high school`, `class 10`, `class x` |
| Graduation | `graduation`, `graduate`, `degree`, `bachelor`, `ug` |
| Post Graduation | `post graduation`, `post graduate`, `masters`, `pg`, `m.a`, `m.sc`, `m.com` |

---

## Consumers

| File | Previous implementation |
|------|------------------------|
| `fill-one-ng.js` / `_fo_ng.js` | Inline `_matchScore()` function — same algorithm, threshold ≥ 50 |
| `fill-one-ng-helpers.js` | `k._ngScoreOption` — simpler algorithm, threshold ≥ 30 |

### Behavioral differences from previous implementations

**From `fill-one-ng.js`:** Identical algorithm. Now extracted and reused.

**From `fill-one-ng-helpers.js` (`k._ngScoreOption`):** Two differences:
1. Token overlap now uses `[\s()+,/\-]+` as separator (matches `_fo_ng.js`) instead of `[^a-z0-9]+`. This is richer — preserves multi-char tokens better.
2. Education synonyms added (from `_fo_ng.js`).
3. `scoreAndPick` default `minScore` is 50 (matches `_fo_ng.js` threshold); the old `_ngPickOption` used 30.

The `fill-one-ng-helpers.js` consumers (`_ngPickOption`) are updated to use `CcNgOptionScorer` with `minScore: 30` to preserve their original threshold.

---

## What This Capability Owns

- Option text scoring algorithm
- Education synonym table
- Pick-best-from-list helper

## What This Capability Does NOT Own

- DOM querying (that is the fill handlers)
- Session management (`_ccReplaySessions`)
- Visibility checking (`ccDomUtils.isVisible`)
