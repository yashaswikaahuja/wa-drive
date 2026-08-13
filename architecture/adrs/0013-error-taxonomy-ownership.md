# ADR-0013: Error Taxonomy Ownership (machine codes vs operator language)

- Status: Proposed (architecture_draft for phase_3_7 / conceptual 3.9 / #164)
- Date: 2026-08-12
- Issue: #164
- Relates: ActionPlan/EO FailureCodes, navigation OUTCOME_MAP, security privacy

## Context

Failure strings are created in gateway, executor, navigation, perception, popup, and service routes. Operators need safe language; developers need technical diagnostics; public EO must use frozen FailureCodes. Without ownership, errors either leak page secrets or collapse into opaque `gateway_error`.

## Decision

1. **Categories** (perception, classification, navigation, execution, authorization_security, stale_state, contract_schema, infrastructure_service, unsupported_delegated) own *creation* at the detecting module.
2. **Normalization** to frozen FailureCode enums is owned by a dedicated `runtime/errors` catalog (implementation phase) — not ad-hoc string compares in UI.
3. **Operator messages** are a separate map: short, non-technical, no selectors/HTML/values/credentials.
4. **Developer diagnostics** may include machine codes and private reasons; never raw secrets or DOM handles in public IR/EO.
5. **Navigation** continues to use phase_3_5 OUTCOME_MAP as the sole navigation outcome → FailureCode table.
6. **No new public FailureCodes** without a contract amendment review.

## Consequences

- UI stops inventing parallel error vocabularies.
- Security suite can assert operator/EO payloads never contain forbidden keys.
- Service HTTP/WSS errors stay infrastructure_service unless translated into EO.

## Rejected alternatives

- **Single catch-all gateway_error everywhere:** hides ownership and breaks replanning.
- **User-facing stack traces:** privacy and UX failure.
- **Browser invents business error meanings** (“KYC step failed”): brain boundary violation.
