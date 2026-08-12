# ADR-0011: Visual Privacy Boundaries (geometry yes, pixels no)

- Status: Proposed (architecture_draft for phase_3_6 / conceptual 3.8 / #158)
- Date: 2026-08-12
- Issue: #158
- Relates: ADR-0006 (screenshots), perception-privacy.yml, page-ir secret handling

## Context

Spatial layout helps automation on dense government portals, but visual capture is a primary leakage channel for Aadhaar/PAN, OTPs, CAPTCHAs, payment data, and uploaded documents. Visual Context must stay useful without reopening screenshot or HTML smuggling paths.

## Decision

1. **Default Visual Context is geometry and mechanical visual relationships only** — never screenshot pixels, pixel buffers, canvas image data, or video frames.

2. **ADR-0006 remains in force.** Screenshots stay disabled by default, out of Page IR, and require a separate purpose-bound protocol with operator confirmation and proven redaction. That protocol is **not** part of phase_3_6 Visual Context normative surface.

3. **Public IR forbids** selectors, XPath, DOM handles, raw/outer/inner HTML, binding ids, absolute screen coordinates, business region labels, and workflow intent — including under any "visual" namespace.

4. **Secret/sensitive nodes:** text and values stay redacted per frozen secret_handling. Geometry MAY be published when needed for occlusion/viewport reasoning, but MUST NOT encode value content (no side-channel width maps of characters).

5. **Cross-origin and closed shadow contexts remain opaque.** Visual Context MUST NOT invent child geometry or text from guesses (ADR-0005).

6. **Browser MUST NOT run vision models** on page pixels for perception IR. Any future vision is service-side under a separate approved design.

## Consequences

- Geometry-based ranking remains available to the service planner.
- Pixel leakage requires an explicit future architecture change, not a progressive runtime flag.
- CI fixtures (CHECK-014) treat screenshot/selector/business visual smuggling as hard fails.

## Rejected alternatives

- **Attach thumbnails to every snapshot:** excessive exposure and payload.
- **Browser OCR of labels:** eyes/hands boundary violation and sensitive text risk.
- **Capture first, redact server-side:** transmits sensitive pixels before protection.
