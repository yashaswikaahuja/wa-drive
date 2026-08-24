# CyberControl extension (eyes + hands)

Chrome MV3 package. **Does not own business planning** — that lives in `extension-service`.

Workspace package: `cybercontrol-extension` (lives at `apps/extension`). It depends on `@cc/*` workspace packages by **name** (same pattern as extension-service → `@cybercontrol/svc-*`), not relative `packages/` paths.

Rebuild bundles: `pnpm --filter cybercontrol-extension build` (or root `pnpm build:bundles`). Scripts under `scripts/` resolve `@cc/*` via `node_modules` and write path-stable `*-bundle.js` inject files here.

## Layout

| Path | Role |
|------|------|
| `perception/`, `runtime/` | Product ActionPlan path (perceive → execute) |
| `autofill/`, `drivers/` | **Sequential kernel** (café default Fill) — **keep paths stable** |
| `autofill/executor/*.js` | Task-split of the old monolith (`debug`, `fill-one`, `sequential`, …); facade `autofill/executor.js` |
| `application/fill-orchestrator.js` | Popup-side orchestration + inject lists |
| `shared/` | Utilities used by both stacks |
| `sw/` | Service-worker helpers (`importScripts` from `background.js`) |
| `popup.html` / `popup.js` | Operator UI |
| `background.js` | Service worker **entry** (manifest) |
| `runtime/ws-client.js`, `runtime/wss-session.js` | Authenticated WSS after HTTPS JWT |

## Inject lists (do not casual-rename)

Canonical lists: `application/fill-orchestrator.js`

- `SEQUENTIAL_KERNEL_SCRIPTS` — default café fill  
- `PRODUCT_PATH_SCRIPTS` — ActionPlan / perception stack  

Also duplicated in places inside `background.js` / `popup.js` for legacy/agent inject — update all if paths change.

## Auth

1. JWT arrives via trusted `CONNECT` or storage (minted over **HTTPS**).  
2. Service worker opens **WSS** with `?token=`.  
3. Fill plan / live debug prefer WSS; HTTPS is fallback only.

See `docs/REPO-MAP.md`.
