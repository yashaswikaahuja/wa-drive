# ADR-0007: Service Adapters Reference Capabilities by ID, Not by Selector

- Status: Accepted
- Date: 2026-08-05
- Issue: #97 (CYB-68, Phase 3.0.1)
- Supersedes ambiguity between: `architecture/knowledge-schema.json` (frozen Phase 2) and the Phase 3 no-selector doctrine

## Context

Phase 3 states that the service MUST NOT send CSS selectors or XPath and MUST
NOT depend on browser-specific mechanics (`perception-contract.yml`
`service_contract.forbidden`). Only a public `adapter_id` may cross the boundary.

However, the **frozen** Phase 2 knowledge schema defines a
`component_adapter_payload` whose `interaction` object requires selector-bearing
fields:

```
architecture/knowledge-schema.json
  detection.selectors: string[]
  interaction.required: [trigger_selector, option_selector]
  interaction.trigger_selector, options_container, option_selector, verify_selector
  interaction.value_read_method includes "inner_html"
```

These are distributed to the extension via the sync protocol
(`architecture/sync-protocol.yml`, `extension-service/routes/sync.js`).

The principal review flagged this as a cross-frozen-contract conflict: the
service appears to own and distribute selectors, which the Phase 3 contract
forbids.

## Decision

We distinguish **planning intelligence** from **capability recipes**.

1. **Planning intelligence (Phase 3 boundary).** The service's planning output —
   `ActionPlan` (`architecture/action-plan.schema.json`) — references widgets only
   by public `adapter_id` plus node identity. It contains no selectors, XPath,
   HTML, or DOM handles. `ExecutionObservation` likewise contains none. This is
   the boundary the no-selector doctrine governs, and it holds.

2. **Capability recipes (browser-private artifact channel).** The selector-bearing
   `component_adapter_payload` is reclassified as a **browser-private capability
   recipe**, not service planning intelligence. It is:
   - authored/curated as an audited artifact,
   - distributed to the extension's gateway/adapter layer keyed by `adapter_id`,
   - consumed only inside the Browser DOM Gateway / interaction port,
   - **never** used by service planning, reasoning, or AI, and
   - **never** echoed back into an `ActionPlan` as a selector.

   In other words, a recipe travels *to* the extension as an adapter definition;
   it never travels *from* the service as a per-action target.

3. **No selector in the perception/planning wire types.** Page IR, ActionPlan,
   and ExecutionObservation remain selector-free by schema. The recipe channel is
   a separate distribution concern, not part of the perception/planning contract.

## Consequences

- The Phase 2 knowledge schema stays frozen and valid; it is re-scoped, not
  changed.
- The service's *planning* path is conformant: it emits `adapter_id`, not
  selectors.
- The recipe distribution channel must be documented as browser-private and
  excluded from the "service sends selectors" prohibition, because the recipe is
  an adapter definition consumed by the gateway, not a targeting instruction.
- `value_read_method: inner_html` in a recipe governs how the **gateway** reads a
  mechanical value internally; it MUST NOT cause `inner_html` to appear in public
  IR or observations (still prohibited by `perception-privacy.yml`).

## Migration and remaining work

- Mark `extension-service/routes/agent.js` (selector-in/selector-out AI planning)
  as a temporary exception with a removal gate; it is the actual violation of the
  no-selector doctrine, not the adapter recipe channel.
- A future revision SHOULD move recipe authoring/versioning into an explicit
  "capability recipe" artifact type distinct from planning knowledge, so the
  private nature is structural rather than documented.

## Rejected alternatives

- **Delete selectors from the Phase 2 schema now:** breaks a frozen contract and
  the working sync path with no replacement recipe channel.
- **Let the service send selectors in plans:** directly violates the Phase 3
  no-selector doctrine and makes the brain browser-specific.
- **Pretend there is no conflict:** the review correctly rejected hand-waving; the
  distinction between recipe distribution and planning targeting must be explicit.
