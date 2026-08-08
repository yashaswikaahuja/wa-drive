# CyberControl Page IR Migrations

Status: **Frozen Phase 3.0 contract**  
Current public IR: **2.0.0**  
Legacy runtime model: `extension/models/ir.js` **1.0.0**

## Compatibility rules

- Major versions are wire-incompatible and require explicit capability negotiation.
- Minor versions are additive: consumers must ignore unknown optional fields.
- Patch versions clarify validation or fix non-semantic defects.
- Enum consumers must preserve unknown values or degrade to `unknown`; they must not crash.
- A service must advertise `page_ir_versions`; an extension selects the highest mutually supported major/minor.
- No negotiation means the existing protocol-v2/legacy extraction path remains active. It must not be mislabeled as IR v2.

## Compatibility matrix

| Extension | Service | Required behavior |
|---|---|---|
| legacy IR v1 | legacy | Existing local extraction flow; no Phase 3 claims |
| legacy IR v1 | IR v2-capable | Service compatibility adapter accepts v1 as `legacy_page_model`, strips/quarantines selectors, and requests upgrade for v2-only plans |
| IR v2-capable | legacy | Feature flag keeps the legacy end-to-end path; v2 is not down-converted into selector-bearing public IR |
| IR v2-capable | IR v2-capable | Use PageSnapshot/PageDelta and node-ID targets with revision checks |
| unsupported major | any | Fail negotiation explicitly with `unsupported_page_ir_version` |

## v1 → v2 breaking changes

1. `selector` and `optionSelectors` are removed from public data.
2. `fieldId` is replaced by document-scoped `node_id`; cross-reload stability is no longer claimed.
3. Nested forms/fields are normalized into typed nodes and edges.
4. `extractedAt` becomes `observed_at`; immutable snapshots add `snapshot_id`, `document_id`, and `revision`.
5. Framework/widget strings become behavior classification plus advisory implementation hint.
6. Raw `value` becomes privacy-safe `value_state` by default.
7. `dependsOn` and cascade arrays become evidence-bearing typed edges.
8. Page booleans become observable state signals and candidates.
9. Browser-private bindings are maintained separately and never serialized.

## Migration stages

### Stage A — Phase 3.0: contract freeze

- Freeze schema, identity, lifecycle, DOM gateway, privacy, confidence, and performance contracts.
- Add governance checks only. No runtime behavior changes.

### Stage B — Phase 3.1–3.3: shadow production

- Implement the new gateway and perception pipeline behind a disabled feature flag.
- Produce v2 snapshots locally in shadow mode.
- Validate and compare coverage against legacy extraction without affecting execution.
- Never transmit shadow snapshots unless negotiation and privacy validation succeed.

### Stage C — Phase 3.4–3.8: negotiated consumers

- Enable v2 for opted-in test portals and sessions.
- Service consumes v2 and emits revision-bound node-ID plans.
- Legacy executor remains available as an explicit fallback path, not an implicit selector fallback inside v2.

### Stage D — Phase 3.9: primary and cleanup

- Make v2 primary only after corpus, privacy, performance, and unpacked-extension gates pass.
- Remove direct DOM discovery from legacy execution/resolution paths.
- Remove v1 compatibility only after supported extension versions no longer emit it.

## Migration requirements

Every future migration directory must include:

- source and target schema versions;
- compatibility classification;
- deterministic transformation where possible;
- fields dropped or redacted;
- rollback procedure;
- golden input/output fixtures;
- consumer version matrix.

## Rollback

Runtime rollout is controlled by negotiated feature flags. Rollback disables v2 publication and returns to the complete legacy flow. It never converts private bindings into public selectors and never reports legacy output as a valid PageSnapshot.
