# Phase 0 smoke checklist (CYB-85)

Verify **stabilize single fill path + deploy lock** before opening Phase 1 (CYB-86).

## Preconditions

- [ ] extension-service deployed with `BUILD_SHA` set (not only local `development` if testing prod pairing)
- [ ] Extension reloaded / zip reinstalled after Phase 0 package
- [ ] Operator logged into side panel (CONNECT from app or stored JWT)
- [ ] Seeded `knowledge_records` (or known form with mappings) available for a test profile
- [ ] `chrome.storage.local.allowLegacyClientFill` is **unset or false** (café default)

## A. Deploy lock UI

1. Open CyberControl side panel on any allowed tab.
2. Footer shows `v<manifest> @ <ext-sha>`.
3. After login + backend URL available, footer ideally also shows `· svc <sha>`.
4. If both SHAs are real and differ → red **mismatch** warning appears (expected until paired).
5. Hover footer → title includes extension commit and service commit when known.

## B. Product Fill path (must work)

1. Open a known form tab (seeded portal or fixture).
2. Select a customer profile with values for mapped fields.
3. Click **Fill Form** (not Agent).
4. Expect:
   - [ ] Side-panel **Fill** is the only café-visible fill entry point (Agent hidden)
   - [ ] Fill runs without hang; results UI shows filled / skipped / failed counts
   - [ ] On `phase-3-perception`: Fill still uses the grandfathered extension executor path (mapper not deleted — Phase 6). Dual-brain **Agent** and **DISPATCH_JOB** remain gated off.
   - [ ] When server `POST /fill-plan` + ActionPlanExecutor are product-wired (master product line / later phase), prefer that path and observation POST — not required to re-open Phase 0 gate work

## C. Legacy paths blocked (must fail closed)

With `allowLegacyClientFill` **false**:

1. Side panel **AI / Agent** button is **hidden**.
2. Dashboard `OPEN_AND_DISPATCH` / `DISPATCH_JOB_DIRECT` (if exercised) returns `legacy_client_fill_disabled` and does **not** inject `autofill/mapper.js`.
3. Pending `_cc_pending_job` on CONTENT_READY is dropped with a console warning (no client fill).

Optional re-enable check (owner only, then disable again):

```js
chrome.storage.local.set({ allowLegacyClientFill: true })
// reload side panel — Agent button visible
chrome.storage.local.set({ allowLegacyClientFill: false })
```

## D. Automated

```bash
node extension-dev/tests/test-legacy-fill-gate.mjs
# or full unit CI:
node extension-dev/tests/ci-unit.mjs
```

## Sign-off

| Check | Pass? | Notes |
|-------|-------|-------|
| Deploy lock visible | | |
| Side-panel Fill works | | |
| Observation POST | | |
| Legacy dispatch gated | | |
| Agent hidden by default | | |
| Unit tests green | | |

**Phase 0 Done when:** all rows pass and Linear CYB-85 can move to Done.  
**Next:** CYB-86 Phase 1 — harden server-planned execution on real portals.
