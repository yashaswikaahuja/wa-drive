# ADR-0016: Adaptive Execution Ratification & Freeze (Phase 4.15)

**Status:** Ratified  
**Date:** 2026-08-14  
**Branch:** `phase-3-perception`  
**Freeze commit:** (this commit)

---

## Context

Phase 4 milestones M4.1–M4.14 implement Adaptive Static/Dynamic execution for CyberControl. This ADR ratifies the implementation as architecturally sound and freezes the contracts.

## Decision

The following contracts are **frozen** and may not be modified without a new governance ADR:

### 1. Server/Extension Ownership Boundary

- **Extension = Eyes + Hands**: perceives DOM, executes mechanical actions, observes evidence
- **Server = Brain + Memory + Knowledge**: classifies behavior, decides execution mode, plans steps, learns patterns
- No second brain in extension. No strategic logic in extension.

### 2. Authority Hierarchy

1. Hard runtime evidence (highest — safety)
2. Server policy (bounds, mode merge, plan race)
3. Operator preference (AUTO/STATIC/DYNAMIC)
4. System classification (belief input)

### 3. Execution Modes

| Mode | Behavior | Steps per plan |
|---|---|---|
| STATIC | Bounded batch execution | ≤ 12 (STATIC_MAX_STEPS), cascade-break |
| DYNAMIC | One-step server loop | 1 (re-perceive between turns) |
| UNKNOWN | Conservative → DYNAMIC | 1 |

### 4. Safety Demotion (M4.7)

- STATIC batch stops mid-execution on hard DOM evidence
- Remaining steps skipped (never execute against stale targets)
- Continuation via DYNAMIC one-step loop
- Operator STATIC preference cannot prevent demotion

### 5. Frozen APIs

| API | Contract |
|---|---|
| `POST /fill-plan` | snapshot + profile + preference → plan + classification |
| `POST /fill-observation` | observation → ack + plan race guard |
| WSS `fill_plan_request` | Same semantics as HTTP |
| WSS `fill_observation_wss` | Same semantics as HTTP |
| `mergeExecutionMode()` | Decision table (execution-mode.js) |
| `applyStaticBounds()` | Hard max + cascade break (static-bounds.js) |
| `classifyFormBehavior()` | STATIC/DYNAMIC/UNKNOWN (behavior-classifier.js) |
| HIM integration | Phase 4.0 protocol unchanged |

### 6. Learning Model

- `recordDynamicEvidence()` — accumulates with confidence + provenance
- `recordStaticSuccess()` — contradicting evidence
- 30-day staleness expiry
- Safety-first: any hard evidence keeps form DYNAMIC
- Server-only storage (KEYS.MAPPINGS._behavior)

### 7. DOM Stabilization

- 300ms quiet period (configurable)
- 5000ms hard timeout (never hangs)
- Relevance filter (ignores ads/scripts/analytics)

## Consequences

- Future changes to these contracts require a new ADR with justification
- Extension cannot add strategic logic without architecture review
- Performance baseline is documented (all server ops < 1ms)
- Test matrix (2709 tests) serves as regression gate

## Verification

| Check | Result |
|---|---|
| Unit CI (37 suites) | 2214/2214 |
| Browser CI (8 suites) | 495/495 |
| Total | 2709/2709 |
| Server/extension boundary violations | None |
| Open P0/P1 blockers | None |
| EXC / constitution alignment | Verified |
