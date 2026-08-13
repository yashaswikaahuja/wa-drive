## #148 — Phase 3.5 Navigation Architecture Independent Re-Review

**Reviewer:** Grok (independent architecture re-review)  
**Date:** 2026-08-11  
**Branch / commit:** `phase-3-perception` @ `5b7e80f` (#147 remediation)  
**Prior:** #145 draft v0.1.0 → #146 AWC 7.3/10 (P1-01..08) → #147 contract v0.2.0  

**Nature:** Architecture gate only. **No runtime implementation. No architecture mutation. No `phase_3_5` freeze. No self-ratification.**

### Evidence re-run

| Check | Result |
|---|---|
| CHECK-013 `test-phase35-navigation-governance.mjs` | **160/160** |
| Fixtures under `architecture/fixtures/navigation/` | **15** |
| Frozen schema churn `page-ir` / ActionPlan / EO / gateway-security in #147 | **None** (`git diff 007e2df..5b7e80f` empty on those files) |
| Contract version | **0.2.0** `architecture_draft` |

---

## Executive verdict

### **APPROVE WITH CONDITIONS** (residual **P2 only**)

| Layer | Verdict | Score |
|---|---|---:|
| P1-01 Deterministic EO mapping | **Resolved** | **9.0** |
| P1-02 Mechanical classifier | **Resolved** | **8.5** |
| P1-03 `page.path` privacy | **Resolved** | **8.5** |
| P1-04 Origin policy binding | **Resolved** | **9.0** |
| P1-05 Settle/hop budgets | **Resolved** | **8.5** |
| P1-06 Fixture corpus | **Resolved** | **8.5** |
| P1-07 CHECK-013 semantic | **Resolved** (with residual depth as P2) | **8.0** |
| P1-08 Ownership wording | **Resolved** | **9.0** |
| Frozen contract non-weakening | **Pass** | **10** |
| ADR ↔ contract consistency | **Pass** | **8.5** |
| **Overall re-review** | Architecture gate **cleared for implementation issue** | **8.6** |

**Meaning:** All eight **NAV-ARCH-P1** items from #146 are **demonstrably remediated** in repository artifacts. No **P0** and **no unresolved P1**. Remaining items are **P2 progressive** and do **not** block opening a separate `phase_3_5` **runtime implementation** issue.

**Freeze-readiness:** **Still NO** — do not freeze `phase_3_5` from this issue. Freeze only after implementation + implementation-level review policy.

**Implementation gate:** **CLEARED** to open a separate runtime implementation issue (not to implement inside #148).

---

## Per–P1 verification (with evidence)

### NAV-ARCH-P1-01 — Deterministic EO mapping — **RESOLVED**

| Requirement | Evidence |
|---|---|
| 1:1 primary failure_code | `deterministic_outcome_mapping` in `navigation-understanding.yml` L117–184 |
| Blocked ≠ timeout | `blocked_overlay` → `postcondition_failed` + `navigation_blocked`; `failed_timeout` → `gateway_error` + `navigation_failed_timeout` |
| Frozen FailureCode only | Explicit rule L113–115; fixture `outcome-mapping-table.json` + CHECK-013 asserts subset of EO enum |
| No arbitrary dual mapping | `forbidden` list L182–184 |

**Residual P2:** `canceled` and `interrupted_by_user_gesture` share primary `postcondition_failed` (disambiguated only by diagnostic). Acceptable and deterministic.

### NAV-ARCH-P1-02 — Mechanical classifier — **RESOLVED**

| Requirement | Evidence |
|---|---|
| Normative architecture-owned rules | `mechanical_navigation_classifier` L61–108 |
| Tag/role/href based | `html_anchor_with_navigable_href`, `role_link_*`, `area_with_href`, download/hash false rules |
| Fail-closed / no invent | L59–60, L104–108; ADR-0009 requires runtimes implement this classifier |
| Not “whatever APE does” | Explicit MUST NOT invent alternate implication logic |

**Residual P2:** SPA controls that navigate without href/`role=link` remain “implication false” until identity-effect is observed — correct fail-closed for authz, may need progressive detectors later.

### NAV-ARCH-P1-03 — `page.path` privacy — **RESOLVED**

| Requirement | Evidence |
|---|---|
| Path is sanitized pathname | `page_path_privacy` L193–213; path **is** privacy `sanitized_path` under frozen field name `path` |
| Query/fragment/credentials out | MUST/MUST_NOT lists L201–209 |
| No unnecessary duplicate field | MUST NOT emit second `sanitized_path` public field |
| Fixture | `positive-path-token-sanitized.json` + CHECK-013 secret/query asserts |

**Residual P2:** Token redaction is pattern + classification dependent; exact entropy heuristics left to implementation.

### NAV-ARCH-P1-04 — Destination origin policy — **RESOLVED**

| Requirement | Evidence |
|---|---|
| Binds gateway-security | `destination_origin_policy.inherits` L219; compatibility L gateway_security |
| Same-origin default | `default_allowed` L223–224 |
| Operator allowlist for XO | L225–228 |
| Deterministic deny | `authorization_denied` + `navigation_origin_denied` L139–143, on_deny |

### NAV-ARCH-P1-05 — Budgets — **RESOLVED**

| Requirement | Evidence |
|---|---|
| settle 8000ms | `navigation_observation_budgets.settle_deadline_ms: 8000` |
| quiet 300ms | `quiet_window_ms: 300` |
| max hops 10 | `max_redirect_hops: 10` |
| Timeout semantics | `failed_timeout` → `gateway_error` + `navigation_failed_timeout` |
| Cancel / interrupt | mapping rows + budget cancel rules |

### NAV-ARCH-P1-06 — Fixtures — **RESOLVED**

Present and required by CHECK-013: frame replace, redirect settle, blocked overlay, `allow_navigation:false`, mid-plan `document_replaced`, cross-origin frame, `target=_blank`, path token sanitized, outcome mapping table, positive/malicious plan fragments. **15** fixtures total.

### NAV-ARCH-P1-07 — CHECK-013 semantic — **RESOLVED**

Suite now includes: AJV ActionPlan validation (accept valid, reject css_selector smuggle), 1:1 mapping table uniqueness + frozen codes, blocked≠timeout, privacy path, origin fixture, classifier/budget string+structure checks, required fixture set. **160/160**.

**Residual P2:** Does not yet machine-parse YAML `deterministic_outcome_mapping` into the JSON table (JSON+additives are the enforced source of truth for CI); not a contract defect.

### NAV-ARCH-P1-08 — Ownership wording — **RESOLVED**

| Requirement | Evidence |
|---|---|
| Expose, don’t select | ownership L33 “exposing observed activatable nodes… never selecting among workflow candidates” |
| Service selects | L47–50; ADR-0009 L20 |
| Old phrasing gone | CHECK-013 asserts absence of “identifying mechanically executable navigation targets” |

---

## Cross-cutting adversarial checks

| Check | Result |
|---|---|
| Unresolved P0/P1? | **No** |
| Frozen schema expansion/weakening in #147? | **No** |
| Contract ↔ ADR contradiction? | **No material** (ADR-0008/0009 cite classifier, origin, budgets, expose wording) |
| Page IR / ActionPlan / EO / WSS 3.4 compatibility? | **Yes** — activate + existing FailureCode + transport-only WSS |
| Privacy leakage path/redirect? | Controlled; hop URLs private; residual token-heuristic P2 |
| Selector / business-semantics smuggling? | Forbidden + AJV + malicious fixtures |
| Cross-origin / inaccessible? | Opaque context + origin policy |
| Stale rev/doc/generation? | Mapped to frozen codes |
| Redirect settle races? | Bounded by quiet window + settle deadline |
| `_blank` / new context? | `navigation_new_context`; no invented IR |
| Browser still allowed candidate selection language? | **No** (P1-08) |

---

## Findings summary

### P0 — none  
### P1 — none remaining  

### P2 (progressive; non-blocking for implementation issue)

| ID | Finding |
|---|---|
| **NAV-RR-P2-01** | SPA/scripted navigators without href/`role=link` are implication-false until identity-effect evidence; may need progressive detectors post-impl |
| **NAV-RR-P2-02** | Path segment token redaction patterns not fully formalized (entropy/length rules) |
| **NAV-RR-P2-03** | CHECK-013 does not auto-diff YAML outcome table vs JSON fixture (dual maintenance) |
| **NAV-RR-P2-04** | `canceled` vs `interrupted` share primary FailureCode (diagnostics distinguish) — fine; optional EO field later |
| **NAV-RR-P2-05** | Operator allowlist storage/UX for cross-origin not specified (implementation concern) |

---

## Freeze & next-gate decisions

| Decision | Result |
|---|---|
| Freeze `phase_3_5` from #148? | **NO** |
| Architecture gate for **implementation issue**? | **YES — cleared** (no P0/P1) |
| Self-ratify implementation? | **NO** |
| Open runtime implementation issue? | **Allowed / recommended next** (separate issue; not done as freeze) |

### Recommended next step

Open a **`phase_3_5` runtime implementation** issue that:

1. Implements mechanical classifier, origin policy, settle budgets, path sanitization, deterministic diagnostics per contract v0.2.0  
2. Does **not** freeze from the implementation issue alone without independent implementation review  
3. Treats NAV-RR-P2-* as progressive  

---

## Closing

**Verdict: APPROVE WITH CONDITIONS (8.6/10) — residual P2 only.**  

#147 successfully closed all #146 P1 blockers. Frozen Phase 3.0–3.4 contracts remain intact. `phase_3_5` stays `architecture_draft` (not frozen).  

**Architecture gate cleared** for a separate runtime implementation issue. **Do not freeze Phase 3.5 from this review.**
