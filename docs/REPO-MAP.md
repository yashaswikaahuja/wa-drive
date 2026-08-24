# CyberControl repository map

One-page guide to what lives where. Normative contracts stay in `architecture/`; this file is navigation only.

## Monorepo status (PR1 tooling)

This repo is a **pnpm + Turborepo** workspace. Product surfaces are **workspace members in place** today; the next step (PR2) moves them under `apps/` without renaming Chrome inject filenames.

| Command | Meaning |
|---------|---------|
| `pnpm build` | `turbo run build` across workspace |
| `pnpm test` | `turbo run test` |
| `pnpm typecheck` | `turbo run typecheck` (JS-only packages skip until TS) |
| `pnpm build:bundles` | Direct concat rebuild of extension `*-bundle.js` via `build-all.mjs` |

Shared TS baseline (for later migration): `tooling/tsconfig.base.json`.

**Target layout (PR2+):** `apps/{extension,extension-service,backend,frontend,cyb-cli,…}` + `packages/{cc-*,backend-*,svc-*}`.

## Eyes / hands / brain

| Role | Path | Notes |
|------|------|--------|
| **Eyes + hands + thin UI** | `extension/` | Chrome MV3. No business planning. Workspace package `cybercontrol-extension`. |
| **Brain + memory** | `extension-service/` | Fill plan, knowledge, WSS server, mappings. |
| **Hub API** | `backend/` | Auth mint/refresh, profiles CRUD source of truth, WhatsApp orchestration. |
| **Operator dashboard** | `frontend/` | Café UI. |
| **CLI** | `cyb-cli/` | `cyb live`, sessions, login (HTTPS mint → WSS watch). |
| **Capability libs** | `packages/cc-*` (`@cc/*`) | Sources for extension bundles. Extension depends on them by package name; `extension/scripts` concat/esbuild into inject `*-bundle.js`. |

## HTTPS vs WSS (product truth)

| Concern | Transport |
|---------|-----------|
| Login / mint JWT / refresh | **HTTPS** (`backend` auth) |
| Profile CRUD | **HTTPS** (hub / extension-service profiles) |
| Socket presence after JWT | **WSS** (`extension-service` `/ws?token=`) |
| Fill plan, fill session, live field debug | **WSS-first** (HTTPS rare fallback) |
| Mid-fill AI / dynamic replan | **WSS** (planned; not fully shipped) |

## Extension layout (`extension/`)

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
extension-service/
  index.js                 # process entry (Docker CMD)
  src/
    http/                  # Express auth + routes
    ws/                    # WSS server, handlers, fill over socket
    db/                    # pool + JSON/KV store helpers
    engines/               # planning, mapping, learning, HIM, …
  scripts/                 # one-off migrators / seed
  migrations/              # SQL
```

`deriveProfile.js` is a **manual port** of hub logic — keep in sync; do not “fix” by importing backend from the browser service.

## Docs & ops

| Path | Role |
|------|------|
| `architecture/` | Normative YAML, ADRs, fixtures — source of truth for contracts |
| `docs/` | Human narrative (this map, performance, schemas) |
| `deploy/` | **Prod** compose, CD, LB, networking (`deploy/docs/`) |
| Root `docker-compose*.yml` | **Local/dev** stacks |
| `nginx/` | Local/dev nginx snippets (prod LB under `deploy/loadbalancer/`) |
| `extension-dev/` | Tests + debug CLI; `cli/out/` is local artifacts only (gitignored) |
| `extension-dev/docs/` | Historical phase review notes |

## Secrets / artifacts (never commit)

- `*.pem`, `*.crx` — Chrome pack/signing  
- `*.jwt`, `extension-dev/cli/out/**` — debug dumps  

See root `.gitignore`.

## Related

- ADR-0012: facades over big-bang moves  
- `architecture/hardening-repository.yml` — target boundaries  
- `deploy/docs/GHCR.md`, `deploy/docs/NETWORKING.md` — live topology  
