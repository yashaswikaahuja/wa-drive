# ADR-0012: Sensitive Values Never Persist

- Status: Accepted
- Date: 2026-08-14
- Phase: phase_4_0
- Supersedes: None
- Related: ADR-0010 (server-owned policy), architecture/perception-privacy.yml

## Context

During HIM interactions, operators enter highly sensitive values: OTP codes,
passwords, payment credentials (card numbers, CVV), and CAPTCHA solutions. The
extension facilitates these entries — it may focus the field, display a prompt,
and detect completion — but the *values themselves* pass through the system.

The question is: should these values be recorded anywhere for audit, debugging,
or operational purposes?

CyberControl's perception-privacy.yml already classifies these as `secret` and
prohibits them in Page IR, observations, and logs. HIM must extend this guarantee
to cover the entire value lifecycle during human interaction.

## Decision

**OTP, password, payment credential, and CAPTCHA values are ephemeral bridge-only.
They exist transiently in the browser's DOM (entered by the operator) and are
never read, transmitted, stored, or recorded by any CyberControl component.**

### What "never persist" means

| Layer | Permitted | Prohibited |
|-------|-----------|------------|
| Page DOM | Operator types into field (browser-native) | Extension reading .value |
| Content script | Detecting "field is non-empty" state | Reading or caching the value |
| Background SW | — | Receiving or storing the value |
| Server | — | Receiving, caching, or logging the value |
| Observation | `action_type` + `result` enum | The value, hash, partial, or encoding |
| Logs (any layer) | Diagnostic codes, timing | The value at any log level |
| Screenshots | — | Capturing the field region |

### Observations record structure, not content

When a HIM step involving a sensitive field completes, the ExecutionObservation
step entry includes:

```yaml
him_checkpoint:
  interaction_type: otp_entry    # or password_entry, payment_entry, captcha_solve
  result: completed              # or failed, expired, cancelled
  duration_ms: 12400
```

This proves the interaction *happened* and its *outcome*. It does not prove or
reveal *what was entered*. This is a deliberate security trade-off: we sacrifice
forensic detail for privacy protection.

### Auto-detection without value access

The extension may detect completion of sensitive field entry using only state
transitions:
- `empty → non_empty` (field now has content)
- Element focus changes (operator moved away from the field)
- Page navigation (form was submitted with the value)

It MUST NOT use `.value`, `.textContent`, or any DOM API that returns the
field's content for sensitive-classified fields.

## Consequences

- The server can never assist with "your OTP was 1234" — it genuinely does not
  have this information.
- Debugging OTP failures requires operator self-report ("I entered X but it
  failed") — the system has no record.
- Payment reconciliation cannot rely on CyberControl logs — external payment
  gateway records must be used.
- The architecture is inherently safe against database breaches revealing
  operator-entered secrets: they were never stored.
- Extension code review must verify that no code path reads `.value` from a
  secret-classified field.

## Rejected Alternatives

### Encrypted storage of sensitive values

> Store the value encrypted with a key derived from the operator's session,
> for debugging and audit purposes.

Rejected because:
- Encrypted data at rest is still data at rest. Key management is an attack surface.
- Regulatory burden: storing payment credentials triggers PCI DSS scope.
- Storing OTPs (even encrypted) after their window expires is pointless.
- The principle of data minimization says: if you don't need it, don't store it.
- A breach of the encryption key retroactively compromises all stored secrets.
- Operators at cybercafes enter customer secrets — the cybercafe should not
  retain these beyond the momentary entry.

### Server-side sensitive value cache

> Server temporarily caches the value (in-memory, TTL 60s) for retry scenarios
> where the operator might need to re-enter.

Rejected because:
- Transmitting the value to the server violates the "never transmitted" rule.
- In-memory cache survives longer than intended (process doesn't restart on time).
- Opens a window for value exfiltration from the server's memory.
- Re-entry by the operator is the correct behavior: if OTP fails, operator
  requests a new OTP and enters the new one.
- Caching creates a false expectation that old OTPs can be retried (they can't —
  OTP windows are server-side one-time).

### Hash-based audit (store hash of value)

> Store SHA-256(value) in the observation for non-repudiation.

Rejected because:
- OTPs are 4-6 digits: SHA-256 of a 6-digit number is trivially brutable
  (1M possibilities).
- Hashed passwords are still sensitive data requiring protection.
- Partial value exposure via brute-force defeats the purpose of redaction.
- Non-repudiation is not a requirement for this system: operator trust is
  managed via session-level accountability, not per-value proof.
