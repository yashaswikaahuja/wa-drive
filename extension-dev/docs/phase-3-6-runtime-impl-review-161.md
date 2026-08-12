## #161 — Phase 3.6 Visual Context Independent Implementation Review (+ P1 rem)

**Reviewer:** Grok (independent implementation review)  
**Date:** 2026-08-12  
**Baseline:** `270814e` (#160) → remediation tip after this review  
**Nature:** Implementation review. **No freeze of `phase_3_6`.**

### Suites (post-remediation)

| Suite | Result |
|---|---|
| Visual Context unit | **28/28** |
| Edge factory (+ proximity P1 tests) | **35/35** |
| Perception unit | **328+** (edge suite embedded) |
| CHECK-014 | **93/93** |
| Chromium APE E2E | **46/46** |

---

## Executive verdict

### **APPROVE WITH CONDITIONS** (residual **P2** only after P1 rem)

| Check | Result |
|---|---|
| Document CSS px + viewport_intersection | **Pass** |
| Batched layout reads / fail-closed omit | **Pass** |
| node_id / binding not churned by geometry | **Pass** (ids/gen independent of geometry) |
| No screenshots/selectors/business labels | **Pass** |
| Mechanical overlays / visually_groups_with | **Pass** (after P1 rem) |
| Secret text redacted | **Pass** |
| Virtualization no invented rows | **Pass** |
| Frozen 3.0–3.5 non-weakening | **Pass** |

**Freeze from #161?** **NO**

---

## Findings

### P0 — none

### P1 — remediated under this issue

| ID | Finding | Fix |
|---|---|---|
| **VC-IMPL-P1-01** | Proximity `visually_groups_with` used unordered endpoints → possible reverse-duplicate undirected edges | Canonical `orderedEdgeEndpoints` (source_id < target_id) |
| **VC-IMPL-P1-02** | Full sibling-pair O(n²) proximity within parent groups | Adjacent-in-order only (O(n) per group) + max edge cap |

### P2 (progressive; non-blocking for freeze-gate issue)

| ID | Finding |
|---|---|
| **VC-IMPL-P2-01** | `isElementVisible` still forces layout during structural walk (pre-batch) |
| **VC-IMPL-P2-02** | Material equality ignores `z_index_hint`-only changes |
| **VC-IMPL-P2-03** | Virtualization diagnostic still uses some private framework class probes |
| **VC-IMPL-P2-04** | Progressive full occlusion graph / IoU not implemented (architecture progressive) |
| **VC-IMPL-P2-05** | Geometry-only revision thrash still depends on publish debounce discipline |

---

## Closing

**Verdict: APPROVE WITH CONDITIONS — residual P2 only.**  
P1 edge ordering and proximity budget fixed with unit evidence.  
**Next:** separate final ratification / freeze gate for `phase_3_6` (optional short re-review if desired).  
**No freeze from this issue.**
