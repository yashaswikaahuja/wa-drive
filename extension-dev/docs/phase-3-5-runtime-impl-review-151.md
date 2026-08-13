## #151 — Phase 3.5 Navigation Runtime Independent Adversarial Implementation Review

**Reviewer:** Grok (independent implementation review)  
**Date:** 2026-08-11  
**Commit:** `bbcdb9b` (#150) on `phase-3-perception`  
**Contract:** `architecture/navigation-understanding.yml` **v0.2.0**  
**Nature:** Review only. **No code changes. No freeze. No self-ratification.**

### Suites re-run

| Suite | Result |
|---|---|
| Navigation contract unit | **38/38** |
| ActionPlanExecutor unit | **43/43** |
| Legacy path guard | **11/11** |
| CHECK-013 architecture | **161/161** |
| Chromium APE product E2E | **39/39** (incl. allow_nav false, XO origin deny, path sanitize) |
| Permanent security | **110/110** |

---

## Executive verdict

### **APPROVE WITH CONDITIONS**

| Layer | Verdict | Score |
|---|---|---:|
| Mechanical classifier vs architecture | Largely correct; unit-proven | **8.5** |
| Ownership (expose vs select) | No browser candidate selection found | **9.0** |
| Origin policy enforcement | Pre-activate for known href; gap on unknown dest | **7.0** |
| `page.path` sanitization | Implemented + unit/browser evidence | **8.5** |
| Settle/quiet/hop budgets | Constants present; observer incomplete vs real full-nav | **6.0** |
| Deterministic EO mapping | OUTCOME_MAP matches contract table | **9.0** |
| Transition type coverage (runtime) | Partial — see matrix | **6.5** |
| Stale doc/rev/generation TOCTOU | Intact on product path | **8.5** |
| Privacy / no smuggling | Pass on tested surfaces | **8.5** |
| Legacy bypass | Product inject + guards | **9.0** |
| Browser test depth for nav settle | Insufficient for full contract matrix | **5.5** |
| **Overall implementation** | Usable for link authz + path privacy; not ratification-ready | **7.2** |

**Meaning:** #150 delivers a real, architecture-aligned **navigation-contract** module and wires it into product Fill (executor + snapshot path). Pre-activate **allow_navigation** and **same-origin destination** enforcement work and are tested. Full contract conformity for **post-activate identity-effect observation** (especially full document navigation, cancel, hop storms) is **not proven** and has concrete defects. **Do not freeze `phase_3_5`.** Ratification blocked on P1s below.

**No P0** forcing wholesale rollback of the product Fill path.

---

## Answers to review checklist (1–15)

1. **Classifier matches architecture / fail-closed?** **Mostly yes.** True: navigable `A`/`AREA` href, `role=link`. False: hash/`javascript:`, download, submit, plain button. Ambiguous → implies false. Unit **38**.  
2. **No browser workflow selection?** **Yes.** No candidate ranking; only mechanical activate of plan target.  
3. **Origin policy enforced / no bypass?** **Partial.** Known `href` checked pre-activate via `isDestinationOriginAllowed` + `__ccNavigationOriginAllowlist`. **Gap:** `role=link` with `destinationHref: null` skips pre-check; contract **unknown_destination** allows activate then **post-settle recheck** — recheck **not implemented**.  
4. **`page.path` sanitized?** **Yes** in snapshot-builder via `sanitizePagePath` (query/fragment/credentials stripped, token segments redacted, max 512). Browser E2E asserts.  
5. **8000 / 300 / 10 + deterministic timeout?** Constants match. Observer implements quiet/hop/timeout. **Gap:** `canceled` never produced (`canceled` flag never set). Interrupt via any pointer/key may false-positive. Full-nav unload may abort without EO.  
6. **Deterministic FailureCode mapping?** **Yes** — `OUTCOME_MAP` mirrors architecture table; frozen enum only.  
7. **Transition types?** See matrix below.  
8. **Stale TOCTOU?** resolveExecutionTarget + generation `resolveBinding` + mid-plan document_id check remain.  
9. **Cross-origin / opaque?** Origin deny E2E; frames not fully exercised in browser runtime.  
10. **No selectors/handles/business in public evidence?** EO diagnostics use navigation codes; security suite green.  
11. **APE no business reasoning?** Only classifier + authz + observe.  
12. **No legacy bypass?** PRODUCT_PATH inject includes contract; legacy guard green.  
13. **No private state leak?** Allowlist is extension global, not IR.  
14. **Meaningful browser tests?** Authz/path/XO yes; **settle/timeout/hops/blank/download/mid-plan mostly unit or missing**.  
15. **3.0–3.4 suites green / no weakening?** Unit aggregate green; no architecture schema edits in #150.

---

## Transition-type matrix (architecture vs runtime)

| Case | Contract | Runtime | Evidence gap |
|---|---|---|---|
| Navigable anchor authz | enforce allow_navigation | **Yes** | E2E + unit |
| Hash / download / submit | fail-closed implication false | **Yes** | Unit |
| Same-document path change | settle + map success | **Partial** (path polled; revision only if re-perceive) | No SPA E2E |
| Full document replace | new_document_completed | **Weak** — perception `documentId` does not update without re-perceive; top-level nav unloads executeScript context | **P1** |
| Frame replace | context document swap | **Not proven** in browser | P1 tests |
| Redirect / hops >10 | max 10 → failed_error | Logic present; **not E2E** | P1 tests |
| Blocked overlay | postcondition_failed | Heuristic querySelector; **not E2E** | P2 quality |
| Timeout | gateway_error | Yes if no identity effect | **No deliberate E2E** |
| Cancel | postcondition_failed | **Dead code** (`canceled` never set) | **P1** |
| Interrupt | postcondition_failed | Gesture listeners; flaky | P2 |
| `_blank` | navigation_new_context | Returns immediately with diagnostic | **No browser E2E** |
| Mid-plan document_replaced | before mutate | Perception-state compare only | Limited |
| XO destination | authorization_denied | **Yes** E2E | — |
| Path sanitization | pathname only | **Yes** | Unit + E2E |

---

## Findings

### P0 — none

### P1 — blocking for ratification / freeze

| ID | Finding | Evidence | Remediation |
|---|---|---|---|
| **NAV-IMPL-P1-01** | **Full-document navigation observation does not reliably produce `new_document_completed` EO.** Identity uses perception `documentId` (unchanged until re-perceive); top-level navigation tears down the `executeScript` isolated world so settle loop may never finish or report. | `readNavigationIdentity` in `action-plan-executor.js` L125–140; `observeNavigationAfterActivate` depends on `readIdentity` documentId | Observe via extension background `webNavigation` / tab events, or fail closed with explicit diagnostic when context is destroyed; do not claim full-nav complete from perception state alone |
| **NAV-IMPL-P1-02** | **`canceled` outcome is unreachable** — `canceled` is never assigned `true`. | `navigation-contract.js` L284–285, L385–390 | Wire cancel detection (e.g. `pagehide`/`beforeunload` without identity settle, or explicit abort API) or remove dead branch and document “cancel → timeout/interrupt only” as accepted delta (needs architecture note if changed) |
| **NAV-IMPL-P1-03** | **Post-settle origin recheck missing** for unknown destination (`destinationHref` null, e.g. `role=link` without href). Contract allows activate then deny if resulting origin violates policy. | `checkNavigationAuthorization` only when `classification.destinationHref` set; observe success does not recheck origin | After settle success, compare `readIdentity().origin` to plan-time origin/allowlist; map `blocked_origin_policy` if violated |
| **NAV-IMPL-P1-04** | **Browser proof gaps for normative settle matrix** (timeout, hop overflow, `_blank` EO, download/hash in browser, mid-plan replacement under live identity, frame navigation). Issue #150 acceptance requires Chromium proof; current E2E covers authz/path only. | `run-action-plan-executor.mjs` nav cases vs required list | Add focused Chromium cases (can use short budgets via test hook if exported) |

### P2 — progressive / non-blocking for continued product Fill of non-nav steps

| ID | Finding |
|---|---|
| NAV-IMPL-P2-01 | Any `pointerdown`/`keydown` during settle → interrupt (false positives) |
| NAV-IMPL-P2-02 | SPA content change without path/revision → 8s timeout |
| NAV-IMPL-P2-03 | Overlay detection via fixed selectors is heuristic, not IR signal-driven |
| NAV-IMPL-P2-04 | Token redaction heuristics remain approximate (#148 P2) |
| NAV-IMPL-P2-05 | `__ccNavigationOriginAllowlist` has no operator UX (accepted progressive) |

---

## Hostile scenario results (summary)

| Scenario | Status |
|---|---|
| Forged origin / allowlist | Allowlist only via extension global (not page MAIN); page cannot set isolated allowlist easily — **pass**. Invalid allowlist type → empty — **pass** |
| `allow_navigation: false` | **Pass** unit + E2E |
| Stale gen / revision | **Pass** existing executor tests |
| Mid-plan document_replaced | Pre-mutate check on perception state — **partial** |
| Redirect >10 hops | Code path exists — **unproven E2E** |
| Settle timeout | Code path — **unproven E2E** |
| Cancel / interrupt | Interrupt partial; cancel **missing** |
| Blocked overlay | Heuristic — **unproven E2E** |
| `_blank` | Unit-level immediate return — **no E2E** |
| Cross-origin frame IR | Architecture fixtures; **not runtime E2E** |
| Hash / download / submit | **Pass** unit classifier |
| SPA without href | Implication false (P2 progressive) |
| Path leakage | **Pass** unit + E2E sanitize |
| Selector smuggling | **Pass** schema/legacy/security |
| Dual failure codes | **Pass** map is 1:1 |
| Legacy bypass | **Pass** inject guards |

---

## Architecture ↔ runtime mismatch summary

| Contract v0.2.0 | Runtime |
|---|---|
| Classifier rules | Implemented |
| Origin policy pre-activate | Implemented for known href |
| Origin policy post-settle unknown dest | **Missing** |
| Budgets 8s/300ms/10 | Constants + loop present |
| Cancel outcome | **Not produced** |
| Full doc identity effect | **Not reliably observable in page world** |
| Deterministic mapping table | Implemented |
| page.path privacy | Implemented |
| Expose not select | Implemented |

---

## Freeze / ratification decision

| Decision | Result |
|---|---|
| Freeze `phase_3_5` from #151? | **NO** |
| Self-ratify? | **NO** |
| Unresolved P0? | **No** |
| Unresolved P1? | **Yes — P1-01..04** |
| Next | Remediation issue → independent re-review → then ratification/freeze gate |

---

## Closing

**Verdict: APPROVE WITH CONDITIONS (7.2/10).**  

#150 successfully lands the **navigation-contract** core (classifier, path sanitization, pre-activate origin/`allow_navigation` enforcement, EO outcome map) on the product path with solid unit coverage and partial Chromium proof.  

**Not ready for implementation ratification or freeze** while NAV-IMPL-P1-01..04 remain: full-nav observation model, dead cancel path, missing post-settle origin recheck, and incomplete browser settle matrix tests.

No implementation changes were made in this review.
