# CyberControl repository map

One-page guide to what lives where. Normative contracts stay in `architecture/`; this file is navigation only.

## Monorepo status (Turborepo)

This repo is a **pnpm + Turborepo** workspace with product surfaces under **`apps/`** and shared libraries under **`packages/`**.

| Command | Meaning |
|---------|---------|
| `pnpm build` | `turbo run build` across workspace |
| `pnpm test` | `turbo run test` |
| `pnpm typecheck` | `turbo run typecheck` (JS-only packages skip until TS) |
| `pnpm build:bundles` | Rebuild extension `*-bundle.js` via `apps/extension` |
| `pnpm --filter cybercontrol-whatsapp-service build` | Vendor `@cybercontrol/wa-*` into `apps/whatsapp-service/dist/` for Docker |
| `pnpm --filter cybercontrol-whatsapp-resolver build` | Vendor `@cybercontrol/wa-resolver` into `apps/whatsapp-resolver/dist/` for Docker |
| `pnpm --filter cybercontrol-extension-service build` | Vendor `@cybercontrol/svc-*` into `apps/extension-service/dist/` for Docker |

Shared TS baseline (for later migration): `tooling/tsconfig.base.json`.

**Layout:**

```text
apps/{backend,extension,extension-service,frontend,cyb-cli,landing,owner-panel,whatsapp-service,whatsapp-resolver}
packages/{cc-*,backend-*,svc-*,wa-*}
extension-dev/   # tests & tooling (not an app)
```

## Eyes / hands / brain

| Role | Path | Notes |
|------|------|--------|
| **Eyes + hands + thin UI** | `apps/extension/` | Chrome MV3. No business planning. Workspace package `cybercontrol-extension`. |
| **Brain + memory** | `apps/extension-service/` | Fill plan, knowledge, WSS server, mappings. |
| **Hub API** | `apps/backend/` | Auth mint/refresh, profiles CRUD source of truth, WhatsApp orchestration. |
| **WA Baileys worker** | `apps/whatsapp-service/` | Multi-tenant sessions on WA VMs (`:3100`). Thin entry; logic in `@cybercontrol/wa-service` + `wa-auth`. |
| **WA LID resolver** | `apps/whatsapp-resolver/` | Singleton wwebjs oracle (`:3200`). Thin entry; logic in `@cybercontrol/wa-resolver`. |
| **Operator dashboard** | `apps/frontend/` | Café UI. |
| **CLI** | `apps/cyb-cli/` | `cyb live`, sessions, login (HTTPS mint → WSS watch). |
| **Capability libs** | `packages/cc-*` (`@cc/*`) | Sources for extension bundles. Extension depends on them by package name; `apps/extension/scripts` concat/esbuild into inject `*-bundle.js`. |
| **WA libs** | `packages/wa-*` (`@cybercontrol/wa-*`) | Baileys/wwebjs runtime packages imported by name (same pattern as `@cybercontrol/svc-*`). Hub routing stays in `@cybercontrol/backend-whatsapp`. |
| **Brain libs** | `packages/svc-*` (`@cybercontrol/svc-*`) | Fill planner, knowledge, learning, AI mapper, runtime, teach, session. Import by package name only (WSS send injected via `setWsSend`). |

## HTTPS vs WSS (product truth)

| Concern | Transport |
|---------|-----------|
| Login / mint JWT / refresh | **HTTPS** (`backend` auth) |
| Profile CRUD | **HTTPS** (hub / extension-service profiles) |
| Socket presence after JWT | **WSS** (`extension-service` `/ws?token=`) |
| Fill plan, fill session, live field debug | **WSS-first** (HTTPS rare fallback) |
| Mid-fill AI / dynamic replan | **WSS** (planned; not fully shipped) |

## Extension layout (`apps/extension/`)

| Folder | Role |
|--------|------|
| `perception/` + `runtime/` (APE, gateway, WSS client) | **Product path** (ActionPlan) |
| `autofill/` + `drivers/` | **Sequential kernel** — café default fill; **path-stable** (inject lists) |
| `autofill/executor/` | Task-split fill kernel (`debug`, `fill-one`, `sequential`, …) + thin `executor.js` facade |
| `application/` | Orchestration (`fill-orchestrator.js`) |
| `shared/` | Shared utils for both stacks |
| `sw/` | Service-worker helpers composed by `background.js` |
| `popup.html` / `popup.js` | Operator UI entry |
| `background.js` | MV3 service worker entry (do not rename in manifest) |

Do **not** rename `autofill/` or `drivers/` without updating every `executeScript({ files })` list and governance tests.

Frozen reference copy: `extension-legacy-best/` (read-only snapshot ~5.91.5).

## extension-service layout

```text
apps/extension-service/
  index.js                 # process entry (Docker CMD)
  src/
    http/                  # Express auth + routes
    ws/                    # WSS server, handlers, fill over socket
    db/                    # pool + JSON/KV store helpers
  scripts/                 # build-dist + migrators
  migrations/              # SQL
```

`deriveProfile.js` is a **manual port** of hub logic — keep in sync; do not “fix” by importing backend from the browser service.

## Docs & ops

| Path | Role |
|------|------|
| `architecture/` | Normative YAML, ADRs, fixtures — source of truth for contracts |
| `docs/` | Human narrative (this map, performance, schemas) |
| `deploy/` | **Prod** compose, CD, LB, networking (`deploy/docs/`) |
