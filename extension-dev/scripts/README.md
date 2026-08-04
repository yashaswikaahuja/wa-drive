# extension/scripts/

Tooling specific to the Chrome extension. Lives here (not at repo root) so editing the extension stays isolated from hub/WhatsApp work.

## fixes/

One-shot Python scripts that **have already been applied** to extension source files (`extractor.js`, `executor.js`, `popup.js`, etc.). Kept for historical reference — they document the surgical changes made over time.

> Most of these are no longer runnable as-is (paths are absolute to a specific deploy). Read them as a changelog, not as live tools.

| Script | Purpose |
|---|---|
| `fix_extractor.py` | safe ID selector helper for extractor |
| `fix_executor.py`, `fix_exec.py` | executor patches |
| `fix_cascade3.py`, `fix_cascade_exec.py` | cascade-select plugin tweaks |
| `fix_hindi.py` | Hindi input handling for ServicePlus paired fields |
| `fix_paired*.py` | paired (English + Hindi) field fills |
| `fix_jq.py` | jQuery-based form sites |
| `fix_tabid*.py` | tab id propagation in background.js |
| `fix_popup_alarm.py`, `fix_popup_teach.py` | popup teach flow |
| `fix_sw_wake.py` | service worker wake |
| `fix_alarm.py`, `fix_badge.py`, `fix_debug.py`, `fix_delay.py`, `fix_highest.py`, `fix_teach*.py` | misc |

## tests/

JS smoke tests for the autofill pipeline. Run with `node` (not Chrome) — they import the source files and exercise pure functions.

| Test | What it exercises |
|---|---|
| `run_tests.js` | runs all tests below |
| `test_mapper.js` | fuzzy matcher correctness |
| `test_sites.js` | per-site form fingerprinting |
| `test_teaching.js`, `test_teaching2.js` | teach-runtime simulation |

## Why these aren't in the repo's top-level `scripts/`

The top-level `scripts/` is for **operational tooling** (DB backfills, JWT diagnostics, etc.) that touches the hub or shared infra. Anything that only changes/tests extension code lives here so the boundary is clear.
