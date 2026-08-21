# script-manifests — Injection Script Lists

## Purpose
Centralised frozen arrays of scripts injected into the active tab for each fill path. Versioned independently so changes to the script lists don't touch orchestration logic.

## Public API (`globalThis.CcScriptManifests`)
- `PRODUCT_PATH_SCRIPTS` — perceive/APE path (DYNAMIC preference)
- `SEQUENTIAL_KERNEL_SCRIPTS` — legacy sequential fill path (default)

## Order matters
Dependencies must load before consumers. See comments in the arrays.
