# ADR-0011: Nonce-Bound Operator Confirmation (Anti-Replay)

- Status: Accepted
- Date: 2026-08-14
- Phase: phase_4_0
- Supersedes: None
- Related: ADR-0010 (server-owned policy), architecture/gateway-security.yml

## Context

When the extension pauses for operator confirmation (OTP entry, form submission
approval, payment authorization), the system must ensure that:

1. A confirmation applies to exactly the intended action, not a different one.
2. A confirmation cannot be replayed to authorize a second action.
3. A stale confirmation (from a previous session or expired timeout) is rejected.
4. A forged confirmation (from compromised page script or browser extension)
   cannot authorize irreversible actions.

The Phase 3 protocol's `confirm_submission` action exists but lacks formal
anti-replay semantics. The confirmation is a bare boolean (operator said yes/no)
with no binding to the specific request context.

## Decision

**Every HIM request carries a server-generated, single-use, cryptographically
random nonce. Operator confirmation is valid if and only if it carries a nonce
that matches the original request AND satisfies all binding constraints.**

The confirmation is bound to a 5-tuple:

```
(session_id, plan_id, step_id, nonce, expires_at)
```

### Nonce lifecycle

1. **Generation**: Server generates a UUID v4 nonce when issuing a `him_request`.
   The nonce is stored in the server's `active_nonces` table keyed by the 5-tuple.

2. **Distribution**: Nonce travels in the `him_request` message to the extension.
   The extension holds it in memory (isolated world / background service worker).
   It is never exposed to page scripts or stored in DOM.

3. **Confirmation**: When the operator confirms, the extension sends
   `operator_confirmation` with the nonce to the server.

4. **Validation**: Server checks:
   - `nonce ∈ active_nonces` (exists and not yet consumed)
   - `nonce ∉ consumed_nonces` (not previously used)
   - `current_time < expires_at + grace_period` (not expired)
   - `session_id` matches active session
   - `plan_id` and `step_id` match the original request

5. **Consumption**: On valid confirmation, nonce moves from `active_nonces` to
   `consumed_nonces` with a TTL. It can never authorize again.

6. **Expiry**: After `expires_at + 5s grace`, nonce is purged from both tables.
   Any confirmation arriving after this point is rejected.

### Re-prompting

If the server decides to re-prompt (e.g., soft timeout), it issues a new
`him_request` or `him_response` with `action: re_prompt` carrying a `new_nonce`
and `new_expires_at`. The old nonce is invalidated immediately.

## Consequences

- Every irreversible action requires a fresh nonce — no "remember my choice" or
  "approve all remaining submits" shortcuts.
- Server-side nonce storage is bounded: max active nonces ≤ active_sessions ×
  max_concurrent_plans. TTL ensures cleanup.
- Network partitions during confirmation are safe: if the confirmation arrives
  after expiry, it's rejected and the server re-prompts on reconnection.
- The extension can safely discard nonces on page navigation (they're invalidated
  server-side anyway via him_cancel).
- Audit trail links each nonce consumption to a specific action, enabling
  forensic reconstruction of operator authorizations.

## Rejected Alternatives

### UI click as authorization

> The extension treats the operator's click on "Confirm" as sufficient
> authorization and immediately proceeds.

Rejected because:
- A click is a UI event, not a security token. It has no binding, no expiry, no
  uniqueness guarantee.
- Compromised content script could synthesize click events.
- Page script could manipulate the page to make the operator click unintentionally
  (clickjacking on HIM UI if it were page-DOM-based).
- No server-side audit of what was authorized and when.
- Violates doctrine: extension cannot authorize, only server can.

### Unbounded confirmation tokens

> Server issues a long-lived token when the plan starts. The extension uses
> this token to authorize any HIM interaction during the plan.

Rejected because:
- One token for multiple confirmations enables replay within the plan scope.
- Stolen token authorizes all remaining irreversible actions in the plan.
- No per-step audit granularity.
- If the operator confirms step 3 but not step 7, the token cannot express this.
- Violates the principle that each irreversible action requires its own
  dedicated authorization cycle.

### HMAC-signed client-side confirmation

> Extension generates a confirmation signed with a shared secret, proving
> it originated from a legitimate extension instance.

Rejected because:
- Shared secret in extension code is extractable (browser extensions are not
  tamper-resistant).
- Does not prove operator intent — only extension code execution.
- Adds cryptographic complexity without meaningful security gain over server-side
  nonce validation.
- The real security boundary is the server validating the nonce it generated.
