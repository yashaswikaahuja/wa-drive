# Legacy → Product Fill Transformation

**Goal:** Port the legacy extension’s proven fill kernel into the product extension, then add form context, conditional filling, common sense, operator learning, and a **WSS-first** live session (not HTTPS polling for login/fill/debug).

**North star**

> Legacy is the best *actuator*. The new extension should be that actuator plus intelligence and a live WSS channel — not a weaker parallel engine.

**Non-goals**

- Parallel forever dual engines (legacy forever + product forever)
- Pure-LLM fill as the primary path
- Treating DOM-hidden ServicePlus nodes as real unmapped failures
- Treating portal-masked Aadhaar actuals as fill failures
- Blaming empty hostname on legacy (primarily newer/product posts)

**Evidence sources:** live sessions (Bihar, SSC, Mazagon), mappings/corrections code paths, operator observations (2026-08).

---

## Architecture (target)

```text
WSS live session (auth presence + fill + debug + replan + corrections)
  ├─ Plan
  │    DATA fields      → label-primary → profile value
  │    CONDITIONAL      → radio/checkbox → rules / common sense / learned choice
  │    HUMAN            → captcha / OTP / file without URL
  ├─ Execute (legacy kernel)
  │    sequential DOM order · settle after each act · strategy verify
  ├─ Evidence
  │    planned + actual + reason · hostname · honest totals
  └─ Learn
       corrections → mappings (data keys + conditional answers)

HTTPS: token mint, profile CRUD, health, rare fallback only
```

---

## GitHub tracking

- **Milestone:** [Legacy→Product Fill Transformation](https://github.com/yashaswikaahuja/wa-drive/milestone/1)
- **Epic:** [#214](https://github.com/yashaswikaahuja/wa-drive/issues/214)
- **Label:** `transform-legacy`
- **Product build:** extension **5.92.3** — sequential kernel default; WSS Stage A presence wiring started
- **Kernel freeze doc:** `extension/autofill/KERNEL-FREEZE.md`
- **Golden pack:** `extension-dev/GOLDEN-PORTAL-REGRESSION.md`
- **Honesty note:** legacy-like **actuator ≠** full WSS-first plan. T4/T5/T6/T7 were reopened.

### Implementation status (corrected)

| ID | Status |
|----|--------|
| T1–T3, T8–T11, T13, T16–T17 | mostly done (actuator / polish) |
| T4 | **reopened** — Stage A client wired in SW (5.92.3); needs live `/ws` + verify |
| T5 | **reopened** — emit path not in fill loop yet |
| T6–T7 | **reopened** — radio-click fix in tree, live verify pending |
| T12, T14 | open (correct) |
| T15 | soft — re-sign after radio + WSS presence |

## Path (phases) → issues

| Phase | Name | Outcome | Issues |
|-------|------|---------|--------|
| **0** | Charter & freeze | Shared purpose, kernel freeze criteria | [#214](https://github.com/yashaswikaahuja/wa-drive/issues/214) T0 |
| **A** | Fill kernel package | Sequential + label-primary + soft fails portable | [#215](https://github.com/yashaswikaahuja/wa-drive/issues/215) T1 · [#216](https://github.com/yashaswikaahuja/wa-drive/issues/216) T2 · [#217](https://github.com/yashaswikaahuja/wa-drive/issues/217) T3 |
| **A2** | WSS session (incl. login UX) | Connect/heartbeat/reconnect; no 20–30s dead air | [#218](https://github.com/yashaswikaahuja/wa-drive/issues/218) T4 · [#219](https://github.com/yashaswikaahuja/wa-drive/issues/219) T5 |
| **B** | Conditional + common sense | Radios/checks as decisions; gender/DOB/marital sense | [#220](https://github.com/yashaswikaahuja/wa-drive/issues/220) T6 · [#221](https://github.com/yashaswikaahuja/wa-drive/issues/221) T7 · [#222](https://github.com/yashaswikaahuja/wa-drive/issues/222) T8 |
| **C** | Form context | Visible/active fields only; dual hierarchy | [#223](https://github.com/yashaswikaahuja/wa-drive/issues/223) T9 · [#224](https://github.com/yashaswikaahuja/wa-drive/issues/224) T10 |
| **D** | Learning loop | Corrections → durable plan improvement | [#225](https://github.com/yashaswikaahuja/wa-drive/issues/225) T11 · [#226](https://github.com/yashaswikaahuja/wa-drive/issues/226) T12 |
| **E** | Product integration | Single extension shell; debug stream | [#227](https://github.com/yashaswikaahuja/wa-drive/issues/227) T13 · [#228](https://github.com/yashaswikaahuja/wa-drive/issues/228) T14 · [#229](https://github.com/yashaswikaahuja/wa-drive/issues/229) T15 |
| **F** | Observability polish | Sessions/CLI honesty; no false VERIFIED_LIE | [#230](https://github.com/yashaswikaahuja/wa-drive/issues/230) T16 · [#231](https://github.com/yashaswikaahuja/wa-drive/issues/231) T17 |

---

## Issue catalog

### Phase 0 — Charter

#### T0 — Epic: Legacy fill kernel → product extension
**Labels:** `transform-legacy`, `enhancement`  
**Body:** Track the full transformation. Child issues T1–T17. Success: fills as well as legacy-best on Bihar/SSC/Mazagon; WSS live session; conditionals correct; learning from operator; visible-context only.

---

### Phase A — Fill kernel (port package)

#### T1 — Freeze sequential fill kernel from legacy-best
**Labels:** `transform-legacy`, `fill-kernel`  
**Depends:** —  
**Deliverable:** Documented + packaged kernel (DOM-order sequential act, settle after text/choice/select/button, strategy verify, wait budget for dead controls). Source: `extension-legacy-best` 5.91.5+ behavior.  
**Done when:** Kernel runs on Bihar/SSC/Mazagon with parity to current best manual runs; no multi-minute hang on dead selects.

#### T2 — Label-primary planning for DATA fields
**Labels:** `transform-legacy`, `fill-kernel`  
**Depends:** T1  
**Deliverable:** Label is semantic authority; DOM id/name only act target when label strong.  
**Done when:** Wrong-id mapping (email←address, husband←father) does not occur from id-only match.

#### T3 — Soft failure hygiene (file dialog, AI timeout)
**Labels:** `transform-legacy`, `fill-kernel`  
**Depends:** T1  
**Deliverable:** Never open OS file chooser from automation; AI residual soft-timeout without Chrome Errors spam.  
**Done when:** SSC file fields → `waiting_human`; AI timeout does not block fill or red-error the extension.

---

### Phase A2 — WSS live session

#### T4 — WSS auth/presence session (login UX)
**Labels:** `transform-legacy`, `wss`  
**Depends:** T0  
**Deliverable:** Extension maintains authenticated WSS after token mint. Fail-fast auth; heartbeat; reconnect with short backoff and user-visible “reconnecting”. **No** primary “retry login every 20–30s over HTTPS” loop.  
**Done when:** First auth failure surfaces within seconds; reconnect does not feel like a 30s freeze.

#### T5 — WSS fill/debug event stream
**Labels:** `transform-legacy`, `wss`, `observability`  
**Depends:** T4, T1  
**Deliverable:** Stream field.start / wait / done / fail with planned+actual over WSS; optional replan hooks for dynamic DOM. HTTPS session post remains durable end-state.  
**Done when:** Debugger can watch a fill live without polling final session only.

---

### Phase B — Conditional fill + common sense

#### T6 — Conditional classifier for radio/checkbox
**Labels:** `transform-legacy`, `conditional-fill`  
**Depends:** T2  
**Deliverable:** Radios/checkboxes never default to free-text fuzzy/AI data map. Classify as CONDITIONAL | CONSENT | HUMAN.  
**Done when:** SSC checkbox no longer planned with Aadhaar number; gender group not strategy=text-input with MALE vs actual=true confusion.

#### T7 — Conditional decision planner
**Labels:** `transform-legacy`, `conditional-fill`, `common-sense`  
**Depends:** T6  
**Deliverable:** Map conditionals to Yes/No/option via profile flags, derive, or learned choice; else skip/human.  
**Done when:** Disability / General-Tatkal / I Agree / Accept-Reject use decisions, not free profile strings.

#### T8 — Common-sense derive pack (deterministic v1)
**Labels:** `transform-legacy`, `common-sense`  
**Depends:** T2  
**Deliverable:** Gender-from-name (when gender missing); skip husband if unmarried; highest education from records; DOB format normalize for act+verify; don’t fill “changed name” unless profile has it.  
**Done when:** Mazagon DOB not skipped solely for DD/MM vs ISO; salutation can be derived when gender known.

---

### Phase C — Form context

#### T9 — Visible/active field filter
**Labels:** `transform-legacy`, `form-context`  
**Depends:** T1  
**Deliverable:** Extractor/planner only targets operator-visible, enabled controls (not hidden ServicePlus shells).  
**Done when:** Session unmapped count no longer dominated by non-visual DOM nodes on Bihar.

#### T10 — Active cascade / dual-hierarchy context
**Labels:** `transform-legacy`, `form-context`  
**Depends:** T9, T1  
**Deliverable:** Prefer live hierarchy (visible LGD group); mark twins as duplicate_hierarchy; sequential settle covers radio↔select AJAX without requiring a full edge graph.  
**Done when:** State→District→Block fills on visual form; English office shell doesn’t burn the run.

---

### Phase D — Learning

#### T11 — Correction promote: data vs conditional
**Labels:** `transform-legacy`, `learning`  
**Depends:** T6, T4  
**Deliverable:** Auto-promote by semantic class: data → profileKey; conditional → option/flag. Require profileId. Stop promote-only-by-string-equality for free values when ambiguous.  
**Done when:** Operator “No” on disability learns; District correction binds to district key reliably.

#### T12 — Close correction capture reliability
**Labels:** `transform-legacy`, `learning`  
**Depends:** T11  
**Deliverable:** Reliable capture (not only late unload); optional WSS correction event; link sessionId.  
**Done when:** Operator edits after fill appear in corrections and affect next plan on same form key.

---

### Phase E — Product integration

#### T13 — Lift kernel into product extension tree
**Labels:** `transform-legacy`, `fill-kernel`  
**Depends:** T1–T3, T6–T10  
**Deliverable:** Product extension uses sequential kernel as default café fill path; ActionPlan/APE only where it earns keep or as opt-in.  
**Done when:** Side-panel Fill on product build matches legacy-best quality on golden portals.

#### T14 — Product WSS client wired to fill loop
**Labels:** `transform-legacy`, `wss`  
**Depends:** T4, T5, T13  
**Deliverable:** Product uses existing `ws-client` / protocol for plan/observe/debug; HTTPS fallback documented.  
**Done when:** Fill works WSS-primary in staging.

#### T15 — Golden portal regression pack
**Labels:** `transform-legacy`, `fill-kernel`  
**Depends:** T13  
**Deliverable:** Automated or checklist regression: Bihar ServiceOnline, SSC OTR, Mazagon registration.  
**Done when:** CI or documented manual gate green before release.

---

### Phase F — Observability

#### T16 — Session metrics honesty (product + legacy posts)
**Labels:** `transform-legacy`, `observability`  
**Depends:** T13  
**Deliverable:** Always hostname on session POST; totals split filled/skipped/unmapped/failed; always attempt actualValue.  
**Done when:** Admin sessions show planned/actual (frontend) and honest counts. *Empty hostname fixed on product path.*

#### T17 — CLI/debug: mask & date aware audit
**Labels:** `transform-legacy`, `observability`  
**Depends:** —  
**Deliverable:** Portal-masked actuals (Aadhaar) and DOB format variants not flagged as VERIFIED_LIE; optional PORTAL_MASKED info.  
**Done when:** SSC Aadhaar session shows masked actual as success. *(Partially done in cyb-cli.)*

---

## Dependency graph

```text
T0 epic
 ├─ T1 kernel freeze ──┬─ T2 label-primary ── T6 conditional class ── T7 conditional plan
 │                     ├─ T3 soft fails
 │                     ├─ T9 visible filter ── T10 dual hierarchy
 │                     └─ T8 common sense ─────┘
 ├─ T4 WSS auth ── T5 WSS debug stream ── T14 product WSS
 ├─ T11 learning promote ── T12 correction capture
 └─ T13 product lift ── T15 golden pack
                        T16 metrics
 T17 CLI audit (can ship early)
```

---

## Suggested sprint slicing

| Sprint | Issues | Theme |
|--------|--------|--------|
| S1 | T0, T1, T3, T17 | Freeze kernel + stop false alarms |
| S2 | T2, T6, T8 | Plan quality (label + conditional + sense) |
| S3 | T4, T5 | WSS login + debug stream |
| S4 | T9, T10, T7 | Context + full conditional planner |
| S5 | T11, T12 | Learning loop |
| S6 | T13, T14, T15, T16 | Product merge + gates |

---

## False issues (do not file as legacy bugs)

| Claim | Correct reading |
|-------|-----------------|
| Empty hostname is a legacy fill bug | Newer/product posts; legacy 5.91.7 often sets host |
| Aadhaar actual `********8335` is fill fail | Portal mask after fill; record is correct |
| 50+ unmapped on ServiceOnline = 50 missing fields | Many DOM-only / non-visual nodes |

---

## Create on GitHub

```bash
# from repo root (when API is healthy)
bash extension-dev/scripts/create-transform-issues.sh
# or PowerShell:
pwsh extension-dev/scripts/create-transform-issues.ps1
```
