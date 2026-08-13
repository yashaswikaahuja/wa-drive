## #153 — Phase 3.5 Navigation Runtime Independent Re-Review (post-#152)

**Reviewer:** Grok (independent implementation re-review)  
**Date:** 2026-08-11  
**Commit:** `4f7209d` on `phase-3-perception` (#152 remediation)  
**Prior:** #150 impl → #151 AWC 7.2/10 (NAV-IMPL-P1-01..04) → #152 remediations  

**Nature:** Implementation re-review only. **No code changes. No freeze. No self-ratification.**

### Suites re-run at `4f7209d`

| Suite | Result |
|---|---|
| Navigation contract unit | **50/50** (incl. settle matrix: timeout, same-doc, new-doc, hops, blank, post-settle XO, Escape cancel, overlay) |
| ActionPlanExecutor unit | **43/43** |
| Legacy path guard | **11/11** |
| Chromium APE product E2E | **46/46** (hash/download/blank/submit, settle timeout, same-doc path, `_blank` diagnostic, allow_nav false, XO pre-activate deny, path sanitize) |
| CHECK-013 architecture | **161/161** |
| Permanent security | **110/110** |

---

## Executive verdict

### **APPROVE WITH CONDITIONS** (residual **P2 only**)

| Layer | Verdict | Score |
|---|---|---:|
| NAV-IMPL-P1-01 browseKey / unload | **Resolved** | **8.5** |
| NAV-IMPL-P1-02 cancel | **Resolved** | **9.0** |
| NAV-IMPL-P1-03 post-settle origin | **Resolved** | **8.5** |
| NAV-IMPL-P1-04 settle matrix / browser | **Resolved** | **8.5** |
| Deterministic FailureCode map | Intact | **9.0** |
| Classifier + allow_navigation | Intact | **9.0** |
| Path privacy | Intact | **8.5** |
| Legacy / smuggling | Intact | **9.0** |
| Frozen 3.0–3.4 non-weakening | Pass | **10** |
| **Overall (post-remediation)** | Ready for separate freeze/ratification gate | **8.5** |

**Meaning:** All four **NAV-IMPL-P1** findings from #151 are **demonstrably remediated** in code and tests. **No P0. No remaining P1.** Residual risks are **P2 progressive** and do not block opening a **final Phase 3.5 ratification/freeze gate** issue.

**Freeze from #153?** **NO** — freeze requires a separate ratification/freeze gate after this clearance.

---

## Per–P1 verification

### NAV-IMPL-P1-01 — browseKey / unload — **RESOLVED**

| Requirement | Evidence |
|---|---|
| Live browse identity origin+path | `browseKeyFromIdentity`; `readNavigationIdentity` sets `browseKey` |
| pagehide/beforeunload fail-closed `new_document_completed` | `onPageHide` / `onBeforeUnload` → `unloading` → `finishSuccess('new_document_completed')` |
| Context read failure fail-closed | `catch` on `readIdentity` → `new_document_completed` |
| Hop counting vs last* not before* | path/browse steps vs `lastPath`/`lastBrowseKey` |
| Stale gen/rev still fail-closed | Existing executor tests green (gen 1→2, stale revision) |

**Residual P2:** On unload, post-settle XO recheck uses `beforeOrigin` only (cannot read new origin after context death). Acceptable fail-closed success for full nav; background `webNavigation` remains progressive for richer EO.

### NAV-IMPL-P1-02 — Cancellation — **RESOLVED**

| Requirement | Evidence |
|---|---|
| Escape → `canceled` | `onKey` Escape sets `canceled`; maps to `postcondition_failed` + `navigation_canceled` |
| Not misclassified as timeout | Unit: Escape → `canceled` (not `failed_timeout`) |
| End-to-end in observer | `while` checks `canceled` before timeout |

### NAV-IMPL-P1-03 — Origin revalidation — **RESOLVED**

| Requirement | Evidence |
|---|---|
| After successful settle | `finishSuccess` calls `recheckOriginAfterSettle` |
| XO deny | Unit: path+origin change → `blocked_origin_policy` / `navigation_origin_denied` |
| Non-nav path in executor | `recheckOriginAfterSettle` after activate when observe returns not_applicable |
| Pre-activate known href | Unchanged; Chromium XO deny E2E green |
| Allowlist bypass | Non-array allowlist → `[]`; page cannot set isolated allowlist from MAIN |

### NAV-IMPL-P1-04 — Settle matrix / browser — **RESOLVED**

| Case | Unit | Chromium |
|---|---|---|
| Hash / download / submit classifier | ✓ | ✓ |
| `_blank` diagnostic | ✓ | ✓ |
| Settle timeout | ✓ | ✓ (`__ccNavBudgets`) |
| Same-document path settle | ✓ | ✓ |
| Pre-activate XO / allow_nav false | ✓ | ✓ |
| Path sanitize | ✓ | ✓ |
| Hop overflow | ✓ | (unit; short budgets) |
| Escape cancel | ✓ | (unit with fake doc) |

---

## Additional adversarial checks

| Check | Result |
|---|---|
| Redirect / >10 hops | Unit hop overflow → `failed_error` |
| Quiet-window race | Same-doc path settles after quiet; hop fix prevents false overflow |
| Mid-plan document_replaced | Pre-mutate perception documentId check retained |
| Stale revision / binding gen | Executor tests green |
| Cross-origin inaccessible frames | Architecture fixtures; runtime pre-activate XO for href |
| `allow_navigation: false` | Unit + E2E |
| SPA without href/role=link | Implication false (P2 progressive) |
| Path query/token leakage | Sanitize unit + E2E |
| Selector/business smuggling | Security + EO privacy E2E |
| Legacy bypass | PRODUCT_PATH + legacy guard |
| Deterministic FailureCode map | OUTCOME_MAP + unit |
| Frozen contracts | No schema edits in #152 |

---

## Findings

### P0 — none  
### P1 — none remaining  

### P2 (progressive; non-blocking for freeze-gate issue)

| ID | Finding |
|---|---|
| **NAV-RR2-P2-01** | Full-nav XO destination cannot be rechecked after unload (context destroyed); still reports `new_document_completed` fail-closed |
| **NAV-RR2-P2-02** | Trusted pointer/key after 100ms grace may still false-trigger interrupt during long settle |
| **NAV-RR2-P2-03** | Overlay detection still heuristic (selector list), not IR `blocking_overlay` signal alone |
| **NAV-RR2-P2-04** | SPA without path/href still relies on identity-effect or timeout (accepted progressive) |
| **NAV-RR2-P2-05** | Operator allowlist UX / persistence not productized |

---

## Freeze / next-gate decisions

| Decision | Result |
|---|---|
| Freeze `phase_3_5` from #153? | **NO** |
| Unresolved P0/P1? | **No** |
| Self-ratify? | **NO** |
| Proceed to **final ratification/freeze gate** issue? | **YES — cleared** |

### Recommended next step

Open a **Phase 3.5 final ratification / freeze gate** issue that:

1. Confirms architecture v0.2.0 + runtime @ `4f7209d` (or later)  
2. Treats NAV-RR2-P2-* as accepted progressive  
3. Updates `architecture/phases.yml` `phase_3_5` to `frozen` only after explicit freeze approval  
4. Does **not** redesign navigation  

---

## Closing

**Verdict: APPROVE WITH CONDITIONS (8.5/10) — residual P2 only.**  

#152 successfully closed NAV-IMPL-P1-01..04. Runtime matches architecture v0.2.0 for the remediated surface with unit + Chromium evidence.  

**No freeze from this review.** Next: separate final Phase 3.5 ratification/freeze gate.
