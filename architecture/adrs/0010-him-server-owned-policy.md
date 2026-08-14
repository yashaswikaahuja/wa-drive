# ADR-0010: Server Owns All HIM Policy Decisions

- Status: Accepted
- Date: 2026-08-14
- Phase: phase_4_0
- Supersedes: None
- Related: ADR-0003 (DOM gateway boundaries), architecture/constitution.yml

## Context

The Human Interaction Mode (HIM) introduces pause points where automated execution
stops and an operator is required to act (enter OTP, confirm submission, authorize
payment). This creates a policy surface: *when* to pause, *how long* to wait, *what*
constitutes valid confirmation, and *what happens* on timeout.

The CyberControl doctrine is clear: Extension = Eyes + Hands, Server = Brain. However,
HIM introduces tempting shortcuts — the extension could locally decide whether a field
"looks like" an OTP field and self-pause, or locally decide that 60 seconds is long
enough and auto-cancel. These would be policy decisions made by the extension.

## Decision

**All HIM policy decisions are made exclusively by the server.** The extension's role
in HIM is limited to:

1. **Presenting** — Rendering the HIM UI to the operator as instructed by the server.
2. **Detecting** — Observing operator interactions on the HIM UI (button clicks, field
   activity) and forwarding them to the server.
3. **Executing** — Resuming or aborting execution only upon server instruction.
4. **Reporting** — Emitting observations about HIM interactions (type, timing, outcome).

The server exclusively owns:

- **Pause eligibility** — Which steps require HIM (via plan authoring and step risk classification).
- **Timeout policy** — Duration of each HIM wait, per interaction type.
- **Confirmation validation** — Nonce verification, expiry enforcement, replay detection.
- **Disposition on timeout** — Whether to abort, re-prompt, or escalate.
- **Resume authorization** — The him_response with action=continue that authorizes execution to proceed.
- **Sensitivity classification** — Whether a field is secret (and therefore its value must not be observed).

## Consequences

- The extension never autonomously decides "this is an OTP field, I should pause."
  It pauses only when the plan step has `him_required: true` or `risk: irreversible`.
- The extension never implements a local countdown that auto-continues or auto-cancels.
  It waits indefinitely for server instruction (him_response or him_timeout).
- All timeout values come from the server's `expires_at` field. The extension may
  display a countdown for UX purposes but takes no action when it reaches zero —
  the server's him_timeout message is authoritative.
- Extension code for HIM is purely mechanical: render prompt, capture events, forward
  to server, wait for response, resume or abort as instructed.
- Adding new HIM interaction types requires only server-side changes + prompt templates.
  The extension handles them generically.
- Testing HIM policy is a server-side concern. Extension tests verify presentation
  and forwarding only.

## Rejected Alternatives

### Extension-side eligibility detection

> The extension inspects the page, detects OTP/CAPTCHA fields, and self-pauses.

Rejected because:
- Violates the doctrine: the extension must not make policy decisions.
- Creates a split-brain: server might not expect the pause, leading to state desync.
- Field classification requires knowledge/AI reasoning which belongs to the server.
- False positives would unnecessarily interrupt automation.
- False negatives would miss sensitive fields — a security failure.

### Local timeout decisions

> The extension runs its own timer and auto-cancels if the operator doesn't respond
> within a locally configured duration.

Rejected because:
- Timeout policy is a business decision (some forms have 10-minute OTP windows,
  others have 2 minutes). Only the server has this knowledge.
- Local auto-cancel could abort an interaction the operator is still completing
  (slow typist, phone delay for OTP).
- Auto-cancel without server knowledge creates state inconsistency.
- The server must know about every state transition to maintain its nonce table.

### Hybrid: extension suggests, server approves

> The extension detects likely HIM situations and sends a "should I pause?" query.

Rejected because:
- Adds round-trip latency before every potential HIM step.
- The server already knows which steps require HIM — it authored the plan.
- "Detection" at the extension level is unreliable without AI/knowledge.
- Unnecessary complexity when the server can simply mark steps in the plan.
