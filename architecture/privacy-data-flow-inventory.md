# Privacy Data-Flow Inventory (Part 1)

- Status: Initial repository inventory
- Reviewed ref: `master` at `ec238a6175acc3b75a14f33f2a85a9e33d14da33`
- Related: Issue #359, ADR-0014

This is a code-path inventory, not a claim that every path is currently reachable in every deployment. Feature flags, caller identity, provider configuration, and deployment topology affect reachability. Re-run the inventory against the release branch and packaged extension before release.

## Known sensitive data paths

| Surface | Source / entry point | Data involved | Destination / persistence | Current assessment |
|---|---|---|---|---|
| MCP profile listing | `apps/extension-service/src/http/mcp-rpc.ts` → profile service | Customer identifiers and contact/display metadata | MCP caller | Workspace authentication exists; no separate field-level consent gate identified in the reviewed path. |
| MCP profile read | `apps/extension-service/src/http/mcp-rpc.ts` → `apps/extension-service/src/http/routes/profiles.ts` | Full non-empty profile values; may include identity, DOB, address, income and other customer fields | MCP caller | High data-minimization risk. Restrict or remove broad read tool; prefer narrow fill operation. |
| MCP screenshot | `apps/extension-service/src/http/mcp-rpc.ts` → `packages/cc-wss/src/wss-session.ts` | Browser screenshot pixels, potentially including customer data and sensitive page content | MCP client as image content | Screenshot path returns image bytes. The reviewed path did not show a separate in-extension operator approval and pre-transfer redaction gate. Existing ADR-0006 and ADR-0011-visual-privacy-boundaries prohibit bypassing these controls. |
| Legacy Agent planning | `apps/extension/popup.ts` → `apps/extension-service/src/http/routes/agent.ts` | Customer profile values and DOM snapshot | Configured LLM provider; plan/trace storage | Extension legacy client-fill gate is permanently closed in `packages/cc-shared/src/legacy-fill-gate.ts`; nevertheless the server route and data-handling code remain and must be secured against direct/other callers. |
| Legacy Agent traces | `apps/extension-service/src/http/routes/agent.ts` and `apps/extension-service/migrations/001_agent.sql` | Snapshot, plan, action values, before/after snapshots and results | PostgreSQL `agent_plans` / `agent_traces` | Sensitive values may be persisted. No application-level TTL/deletion path was found in the reviewed repository search. Verify database backup/retention policy separately. |
| Teach LLM request | `packages/cc-background/teach/src/teach.ts` and Teach request assembly | Field profile values, HTML snippets, option HTML and labels | Configured external LLM endpoint | Conditional on Teach invocation/configuration. Must be routed through a central authorization boundary and minimized. |
| Hindi transliteration | `packages/cc-executor/src/fill-one-text.ts` | Customer-provided Hindi/English name | Google Input Tools request | Name is included in an outbound request when this conditional path runs. Prefer local transliteration or disclose/gate the transfer. |
| Other service/AI egress | Search all `fetch`, `XMLHttpRequest`, WebSocket and provider-client call sites | Varies | Third-party APIs, internal services, MCP clients | Inventory is not exhaustive. Add CI/static checks and update this document as new paths are found. |

## Existing architecture controls that remain normative

- `architecture/adrs/0006-screenshot-privacy.md`: screenshots are disabled by default; separate purpose-bound request, informed operator confirmation, displayed scope/retention, proven redaction before transmission, and safe refusal when redaction cannot be guaranteed.
- `architecture/adrs/0011-visual-privacy-boundaries.md`: normal visual context is geometry-only; screenshot pixels are outside that surface.
- `architecture/adrs/0010-him-server-owned-policy.md`: server owns policy decisions; extension presents and forwards operator interactions.
- `architecture/adrs/0011-him-confirmation-anti-replay.md`: confirmations are nonce-bound, scoped and single-use.
- `architecture/adrs/0012-him-sensitive-field-redaction.md`: OTP, password, payment credential and CAPTCHA values are never read, transmitted or persisted.
- `architecture/perception-privacy.yml`: perception privacy classification and redaction contract.

The privacy engine must enforce these decisions; it must not introduce a more permissive alternative.

## Part 1 implementation status

- Added a pure server-side policy evaluator at `apps/extension-service/src/privacy/engine.ts`.
- The evaluator rejects malformed requests, prohibited secret categories, unverified screenshot redaction, and grants that do not exactly match workspace, user, action, purpose, recipient/endpoint, origin, data categories, field scope, expiry and revocation.
- Added policy tests at `apps/extension-service/src/privacy/engine.test.ts` and wired them to the extension-service test script.
- Added ADR-0014 to establish the central enforcement architecture and phased rollout.

**Important limitation:** Part 1 is the policy foundation only. Existing MCP, Agent, Teach, screenshot, transliteration and persistence paths are not yet wired to this evaluator. They must not be described as fixed until Parts 2–5 integrate and test enforcement at each final trusted boundary.
