# CyberControl LEGACY BEST (unpacked)

Snapshot of the **last good legacy autofill** from `phase-3-perception`, **before** SEC host lockdown and product ActionPlan path.

## Source commit

| Field | Value |
|--------|--------|
| **SHA** | `f788a487374f374a3154f04a339996655790cd1f` (+ local cascade fixes) |
| **Date** | 2026-08-05 base; **5.91.2** AJAX cascade patch |
| **Message** | base: knowledge-sync wire; patch: parent-aware AJAX wait + honest fail codes |
| **Version** | **`5.91.5`** |

### Sequential fill model (5.91.5)

AJAX is **not** only cascade→cascade. Radio can unlock selects and the reverse.
**Correct model:** DOM-order sequential fill; after each act, settle (network quiet);
then ask “did this field’s strategy work?” — not “is this an ajax edge?”

- `settleAfterAct(text|choice|select|button)` after every field  
- Select with empty options: wait for prior field’s AJAX (`waitForSelectOptionsSequential`)  
- Fail codes: `strategy_failed` / `strategy_options_not_ready` / `strategy_option_mismatch`  
- Label-primary matching (5.91.4) + wait budget so dead controls don’t hang minutes  
- Records: `fillMode: 'sequential'`, planned + actual values

Chosen as tip **after** the Aug 3–4 legacy fix burst and knowledge-sync wire, **before**:

- `4d74817` SEC-001..004 host / boundary hardening  
- `3961783` narrowed `host_permissions` (Bihar allowlist style)  
- later ActionPlan / 5.92 product path  

## Included legacy fixes (guessed from history)

| Commit | Fix |
|--------|-----|
| `ba64a4b` | Wrong-field mapping — name not into husband/relative (#54) |
| `eeae4b0` | Person-name vs certificate label |
| `75c92c0` | Cascade wait only for select-like fields |
| `3d8c06a` | Executor primary (not runner-only) |
| `e506365` | radio-group fuzzy match (#79) |
| `df052d0` / `4793e3e` | ng-select / mat-select / cascade / ng-dropdown |
| `7cd263e` | Datepickers native + flatpickr + jQuery (#82) |
| `ee795dd` | Text fill — missing `isTextarea` |
| `ff84930` | File upload pipeline |
| `f7c27d4` + `ecd5bd3` | ServicePlus cascade retry + 8s waitForOptions |
| `f77604b` / `f788a48` | Server knowledge sync client |

## Host policy (intentionally open)

**You asked to ignore security host restrictions.** This package uses:

- `host_permissions`: **`<all_urls>`** (as at `f788a48`)  
- `content_scripts.matches`: **`http://*/*`, `https://*/*`, `file://*/*`** (widened so Bihar / any portal works without allowlist)

Do **not** ship this build as production café software without re-applying host policy.

## How to load in Chrome

1. Open `chrome://extensions`  
2. Enable **Developer mode**  
3. **Load unpacked** → select this folder:  
   `…/cybercontrol/extension-legacy-best`  
4. Disable or remove other CyberControl builds (5.92 product / old 5.91) so only this one is active  
5. Pin side panel → log in → Fill as usual  

Confirm badge/title: **CC LEGACY BEST 5.91.1**

## How to re-export

```powershell
git archive f788a48 -o legacy.zip extension
Expand-Archive legacy.zip -DestinationPath _tmp -Force
# then copy _tmp/extension → extension-legacy-best and re-apply manifest open hosts
```

## Not included

- Phase 3 perception / ActionPlan / 5.92 orchestrator  
- SEC-004 host allowlist / CHECK-011  
- CYB-85 `allowLegacyClientFill` gate (that is later, `c2e183a`)  
