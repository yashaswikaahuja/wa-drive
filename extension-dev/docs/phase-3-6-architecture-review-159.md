## #159 — Phase 3.6 Visual Context Independent Adversarial Architecture Review

**Reviewer:** Grok (independent architecture review)  
**Date:** 2026-08-12  
**Architecture tip:** `e0ba523` on `phase-3-perception` (#158 draft)  
**Issue body commit note:** listed `b31fb79` (pre-draft tip) — **actual artifacts live at `e0ba523`**  
**Nature:** Architecture review only. **No runtime Visual Context implementation. No freeze of `phase_3_6`.**

### Suites re-run

| Suite | Result |
|---|---|
| CHECK-014 Visual Context | **93/93** |
| CHECK-013 Navigation (frozen) | **164/164** |
| Phase 3 governance (after hygiene fix for stale #156 asserts) | **green** (see P1-GOV) |

---

## Executive verdict

### **APPROVE WITH CONDITIONS** (residual **P2** only on Visual Context surface)

| Layer | Verdict | Score |
|---|---|---:|
| Design questions 1–12 answered | **Pass** | **9.0** |
| Frozen 3.0–3.5 non-weakening | **Pass** | **10** |
| Privacy / smuggling barriers | **Pass** | **9.0** |
| Policy A numbering | **Pass** | **10** |
| Ownership eyes/hands vs brain | **Pass** | **9.0** |
| Geometry identity (node/doc/binding vs revision) | **Pass** | **8.5** |
| Page IR compatibility (no forced schema bump) | **Pass** | **9.0** |
| Fixtures + CHECK-014 semantics | **Pass** | **8.5** |
| ADRs 0010–0011 | **Pass** | **9.0** |
| **Overall** | Ready for residual-P2 accept + separate impl issue | **8.7** |

**Meaning:** Architecture is coherent, compatible with frozen Page IR / phase_3_3 visual edges / ADR-0006, and does not authorize runtime or freeze. **No P0. No Visual-Context P1.** Residual risks are progressive/specification tightness (P2).

**Freeze from #159?** **NO**  
**Runtime from #159?** **NO**  
**Self-ratification?** **NO**

---

## Reviewer task matrix

| # | Task | Result |
|---|---|---|
| 1 | 12 design questions answered normatively | **Pass** (`design_answers` + full sections) |
| 2 | Frozen 3.0–3.5 not weakened | **Pass** — #158 does not edit page-ir / action-plan / nav frozen schemas |
| 3 | No screenshot/selector/business smuggling | **Pass** — prohibited lists + malicious fixtures + ADR-0011 |
| 4 | Policy A: `phase_3_6`; WSS=`phase_3_4`; nav=`phase_3_5` frozen | **Pass** |
| 5 | Ownership: browser observes; service selects | **Pass** |
| 6 | Geometry identity rules | **Pass** (revision vs node_id/bindings) |
| 7 | CHECK-014 + related suites green | **Pass** after correcting stale #156 governance asserts (P1-GOV hygiene) |
| 8 | Verdict | **APPROVE WITH CONDITIONS** |

---

## Per–design-question adversarial notes

| Q | Assessment | Residual |
|---|---|---|
| 1 Problem vs structure | Clear: layout/viewport/occlusion/proximity without business vision | — |
| 2 Normative vs progressive | Strong reuse of frozen Geometry/viewport/edges; progressive correctly draft-gated | P2: emission thresholds for `visually_groups_with` still soft |
| 3 Min public representation | viewport + optional geometry + visible + visual edges | — |
| 4 Geometry public/bounded | document CSS px; finite; secret text still redacted | P2: secret field geometry still layout-fingerprints (accepted minimization) |
| 5 Viewport/scroll/occlusion | Normative via intersection/visible/blocking_overlay; nested scroll progressive | P2: pairwise `occludes` undefined IoU |
| 6 Visual vs semantic edges | A11y wins on conflict; depends_on remains non-business | — |
| 7 Identity / deltas | node_id/doc/bindings stable; revision+hash move with published geometry | P2: “material” change undefined (epsilon only progressive) |
| 8 Virtualization / inaccessible | Fail-closed no invention; opaque XO/closed shadow | — |
| 9 Budgets | Inherits perception-performance; bans unbounded O(n²) | P2: no numeric occlusion top-K default |
| 10 Frozen edge authority | contains/labels/controls unweakened | — |
| 11 Planner consumption | Service ranks/selects; ActionPlan targets stay context+node | — |
| 12 Adversarial CI | Fixtures + CHECK-014 semantic | P2: no AJV Geometry validation of fixture nodes; no geometry-delta identity fixture |

---

## Findings

### P0 — none  

### P1 — Visual Context architecture — **none**

### P1 — Program hygiene (outside VC contract surface; fixed under review evidence)

| ID | Finding | Disposition |
|---|---|---|
| **GOV-P1-01** | `test-phase3-governance.mjs` still required `phase_3_5` **not** frozen after #156 freeze, failing Phase 3 governance (2 asserts) and contradicting CHECK-013 | **Remediated in-review** by updating expects to frozen #156 and registering `phase_3_6` architecture_draft |

### P2 (progressive / non-blocking for opening implementation issue)

| ID | Finding |
|---|---|
| **VC-ARCH-P2-01** | “Material” geometry change for revision advance lacks a normative epsilon / materiality rule (only progressive draft epsilon) |
| **VC-ARCH-P2-02** | Progressive `occludes` lacks IoU / stacking algorithm; risk of inconsistent impls |
| **VC-ARCH-P2-03** | Secret-node geometry allowed for occlusion still leaks coarse form layout (accepted tradeoff; side-channel ban is prose-only) |
| **VC-ARCH-P2-04** | CHECK-014 does not AJV-validate positive fixture geometry against frozen `Geometry` schema |
| **VC-ARCH-P2-05** | No positive fixture for geometry-only PageDelta / revision identity (ADR-0010) |
| **VC-ARCH-P2-06** | Progressive `layout_region_tag` could drift into business section names without a mechanical naming ban beyond prose |
| **VC-ARCH-P2-07** | High-frequency scroll→revision churn may stale ActionPlans; depends on debounce discipline (performance contract) |

---

## Adversarial smuggling / boundary checks

| Attack | Result |
|---|---|
| Screenshot / pixel buffer in public IR | Forbidden + malicious fixture |
| Selector / xpath / dom_handle under visual_* | Forbidden + malicious fixture |
| Business region / workflow_intent | Forbidden + malicious fixture |
| Invent virtualized rows | Forbidden + positive fixture |
| Fabricate XO child geometry | Forbidden + positive fixture |
| Secret OTP value via sanitized_text | Redacted fixture asserts |
| Browser OCR / vision | ADR-0011 + ownership must_not |
| Browser candidate selection via proximity | ownership must_not + planner_consumption |
| Amend frozen page-ir.schema in draft | non_goal; not done |
| Rename phase_3_4 to steal “3.8” | Policy A + phase_3_6 key |

---

## Compatibility with frozen contracts

| Contract | Interaction |
|---|---|
| page-ir Geometry / viewport | Reused; no schema bump required for normative surface |
| phase_3_3 overlays / visually_groups_with | Reused with evidence; authority not weakened |
| phase_3_5 blocking_overlay / path privacy | Compatible; navigation ownership unchanged |
| ADR-0006 screenshots | Reaffirmed; not part of VC normative surface |
| ActionPlan targets | Remain context_id + node_id |
| perception-performance | Budgets inherited |

---

## Freeze / next-gate decisions

| Decision | Result |
|---|---|
| Freeze `phase_3_6` from #159? | **NO** |
| Unresolved VC P0/P1? | **No** |
| Self-ratify? | **NO** |
| Proceed to residual-P2 rem (optional)? | **Optional** — P2 non-blocking |
| Proceed to **implementation issue**? | **YES — cleared** (architecture AWC; no VC P0/P1) |

### Recommended next step

1. Optional short architecture remediation for VC-ARCH-P2-01/04/05 if desired before impl  
2. Open **Phase 3.6 Visual Context runtime implementation** issue only after this clearance  
3. Follow: impl → independent impl review → rem → re-review → freeze gate  
4. Do **not** enable screenshots or browser vision under “visual context” progressive flags  

---

## Closing

**Verdict: APPROVE WITH CONDITIONS (8.7/10) — residual P2 only.**

#158 architecture draft is fit for a separate implementation track. Independent review does **not** freeze `phase_3_6` and does **not** authorize runtime without a dedicated implementation issue.
