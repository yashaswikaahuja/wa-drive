## #165 — Phase 3.7 Hardening Architecture Independent Adversarial Review

**Reviewer:** Grok (independent architecture review)  
**Date:** 2026-08-12  
**Architecture tip:** `aebccc8` (#164 draft; issue body listed older `6f05db2`)  
**Post-rem tip:** see freeze-candidate after HARD-ARCH-P1 rem commit  
**Nature:** Architecture review only. **No mass reorg. No freeze of `phase_3_7`.**

### Suites

| Suite | Result |
|---|---|
| CHECK-015 Hardening | **70/70** → post-rem higher |
| Phase 3 governance | **123/123** |
| CHECK-014 Visual (frozen) | **96/96** |
| CHECK-013 Navigation (frozen) | **164/164** |

---

## Executive verdict

### **APPROVE WITH CONDITIONS** (after architecture-only P1 rem; residual **P2**)

| Task | Result |
|---|---|
| 1 Inventory accuracy | **Pass** — mixed modules match tree; line counts approximate |
| 2 Responsibility-driven structure | **Pass** — facades, no line-count-only splits |
| 3 Error taxonomy → frozen FailureCodes | **Pass** — no new public codes without amendment |
| 4 Dependency / eyes-hands vs brain | **Pass** — service planning stays out of extension |
| 5 Migration map risk/tests | **Pass** — per-MIG risk + tests; not big-bang |
| 6 CHECK-015 semantic | **Pass** |
| 7 Policy A numbering | **Pass** — phase_3_7; 3.4 WSS; 3.5/3.6 frozen |
| 8 Verdict | **AWC residual P2** |

**Overall:** **8.4 / 10**  
**Freeze from #165?** **NO**  
**Mass reorg from #165?** **NO**  
**Cleared for separate implementation issue?** **YES** (after P1 rem landed)

---

## Findings

### P0 — none

### P1 — remediated under this review (architecture-only)

| ID | Finding | Remediation |
|---|---|---|
| **HARD-ARCH-P1-01** | #164 required Extension↔server boundary diagram; draft had prose only | Added `dependency_direction.boundary_diagram` ASCII diagram |
| **HARD-ARCH-P1-02** | MIG-GW/NAV propose splitting frozen_files paths without explicit freeze-file split procedure | Added `freeze_file_internal_split` normative rules (facade, tests, allowed_changes) |
| **HARD-ARCH-P1-03** | CHECK-015 did not assert diagram / freeze-split procedure | Extended governance suite |

### P2 (progressive; non-blocking for opening implementation issue)

| ID | Finding |
|---|---|
| **HARD-ARCH-P2-01** | CHECK-015 forbidden-import matrix is fixture-based; live grep of all product modules is progressive |
| **HARD-ARCH-P2-02** | Operator message map is examples-only, not exhaustive FailureCode coverage |
| **HARD-ARCH-P2-03** | Service-side `orchestrator.js` decomposition is deferred (correctly), lightly specified |
| **HARD-ARCH-P2-04** | Inventory `tip_reference` pinned to 6f05db2; draft commit is later — acceptable audit snapshot |
| **HARD-ARCH-P2-05** | No dependency-cruiser / automated cycle detection yet |
| **HARD-ARCH-P2-06** | Test taxonomy reorganization deferred to implementation |

---

## Adversarial checks

| Attack / risk | Result |
|---|---|
| Big-bang reorg authorized by draft? | **No** — out_of_scope + ADR-0012 |
| New FailureCodes smuggled? | **No** — frozen enum rule |
| Planning moved into extension via reorg? | **No** — forbidden_target_moves |
| Frozen 3.5/3.6 weakened? | **No** — still frozen; CHECK-013/014 green |
| phase_3_4 renumbered? | **No** — WSS retained |
| Legacy autofill re-expanded into perception? | **No** — quarantine MIG-LEG-01 |

---

## Next gate

1. Open **Phase 3.7 Hardening implementation** issue (priority: MIG-ERR-01 → MIG-POPUP-01 → MIG-GW-01 …).  
2. Implement behind facades; green product-path E2E per split.  
3. Independent implementation review → rem → freeze gate.  
4. **Do not freeze `phase_3_7` from this issue.**

---

## Closing

**Verdict: APPROVE WITH CONDITIONS (8.4/10) — residual P2 only after architecture P1 rem.**  
Draft is fit for a separate implementation track. No mass reorg and no freeze from #165.
