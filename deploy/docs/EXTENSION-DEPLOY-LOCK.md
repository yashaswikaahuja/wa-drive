# Extension deploy lock (Phase 0 / CYB-85)

Café operators must run a **paired** extension package and extension-service image so perception contracts and fill routes stay in sync.

## Rule

| Component | Provenance field | Where to read it |
|-----------|------------------|------------------|
| Chrome extension zip / unpacked | `extension/build-info.json` → `commit` | Side panel footer: `vX.Y @ <sha>` |
| extension-service container | env `BUILD_SHA` | `GET /health` or `GET /api/extension/health` → `commit` |

**Deploy is locked when** both commits match (same git SHA, at least first 7 hex chars).

Baseline for this Runtime Map track: master ≥ `f678ee4` (AI timeout + server-planned fill). Prefer current `master` HEAD for both sides.

## Side panel

Footer line examples:

- `v5.94 @ a1b2c3d · svc a1b2c3d` — paired (OK)
- `v5.94 @ a1b2c3d · svc deadbeef ⚠ mismatch` — **do not fill in production** until one side is redeployed
- `v5.94 @ development` — local/dev build; pairing check skipped when either side is `development`

Hover the footer for full SHA + built_at.

## Packaging extension

When cutting a downloadable zip, stamp `extension/build-info.json`:

```json
{
  "commit": "<full git sha of the tree that was packaged>",
  "built_at": "<ISO-8601 UTC>"
}
```

Do not ship `"commit": "development"` to cafés.

## Deploying extension-service

Image build should set:

```bash
BUILD_SHA=$(git rev-parse HEAD)
```

Confirm after deploy:

```bash
curl -sS https://api.cybercontrol.fun/api/extension/health
# { "status":"ok", "service":"extension-service", "commit":"..." }
# or on the host: curl -sS http://127.0.0.1:3300/health
```

## Product path (only café default)

```
Side panel Fill
  → PageSnapshot (extension)
  → POST /api/fill-plan (extension-service)
  → ActionPlanExecutor (extension)
  → POST /api/fill-observation (extension-service)
```

Legacy client paths (`DISPATCH_JOB`, Agent button, `OPEN_AND_DISPATCH`) are **disabled by default** (Phase 0).  
Emergency re-enable (owner debug only):

```js
// Service worker / extension console
chrome.storage.local.set({ allowLegacyClientFill: true })
```

Clear with `{ allowLegacyClientFill: false }` or remove the key. Phase 6 will remove the dual brain.

## Related

- Smoke: `extension-dev/docs/PHASE0_SMOKE.md`
- Linear: CYB-85
- Runtime Map: Notion → Extension Runtime Map & Implementation Phases
