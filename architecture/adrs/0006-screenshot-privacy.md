# ADR-0006: Keep Screenshots Out of Default Page IR

- Status: Accepted
- Date: 2026-08-05
- Issue: #96

## Context

Geometry helps deterministic layout perception, but screenshots of government forms can expose Aadhaar, PAN, addresses, income/category data, documents, OTPs, CAPTCHAs, and payment information. Default continuous capture conflicts with data minimization.

## Decision

Page IR includes bounded geometry and visual relationships, not screenshot pixels or screenshot references. Screenshot capture is disabled by default and is a separate, purpose-bound operation requiring:

1. explicit service request;
2. informed operator confirmation for that capture;
3. displayed scope and retention;
4. proven redaction before transmission;
5. refusal when secret/sensitive redaction cannot be guaranteed.

OTP, password, CAPTCHA response, payment, and identity-number regions may not be captured. Screenshots are never durable browser memory and are never sent directly from the extension to third-party AI services.

## Consequences

- Phase 3 visual context begins with geometry/layout, not browser-side vision.
- Future service-side visual reasoning needs a separate approved protocol.
- Capture failure is safe refusal, not unredacted fallback.
- Screenshot retention and deletion must be auditable if later enabled.

## Rejected alternatives

- **Always attach screenshots to PageSnapshot:** excessive exposure and payload.
- **Capture first, redact server-side:** transmits sensitive pixels before protection.
- **Browser AI classification:** violates the eyes/hands boundary.
