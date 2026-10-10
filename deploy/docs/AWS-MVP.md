# AWS MVP — GCP parity on one EC2 box

This is the **single-host** stand-in for the old multi-VM GCP mesh
(`cybercontrol-app` / `cybercontrol-db` / `cybercontrol-wa*`).

Canonical GCP topology: [`GHCR.md`](./GHCR.md) §4, [`NETWORKING.md`](./NETWORKING.md).

---

## Why this felt harder than GCP

GCP was already a finished recipe:

| GCP (easy) | Early AWS MVP (painful) |
|---|---|
| Stable MagicDNS names per VM | Invented `cybercontrol-mvp`, broke name-based routing |
| Host `tailscaled` + `network_mode: host` apps | Mixed host agent + Docker TUN → conflicts |
| nginx + certbot on LB VMs for `api.` | HTTP-only at first → Vercel HTTPS frontend could not talk to API |
| Only `:80`/`:443` public | Accidentally published `:3000`/`:3300`/`:3100` (SG later blocked them) |
| CD: join tailnet → SSH MagicDNS → compose pull | Ad-hoc SSH to EIP + one-off workflows |

The product contract never changed. We re-derived it under time pressure instead of copying the GCP files.

---

## Mental model (same as GCP)

```
  public internet
       │
       │  https://app.cybercontrol.fun     → Vercel (unchanged)
       │  https://api.cybercontrol.fun     → this EC2 EIP
       ▼
  ┌──────────── AWS EC2 (one box) ─────────────────────────────┐
  │  Caddy :443/:80   = GCP cybercontrol-lb (TLS edge)         │
  │       ↓                                                    │
  │  nginx (internal) = path router (backend vs extension)     │
  │       ↓                                                    │
  │  backend :3000  +  extension-service :3300                 │
  │       = GCP cybercontrol-app (+ ext)                       │
  │                                                            │
  │  postgres :5432   = GCP cybercontrol-db                    │
  │  redis            = GCP cybercontrol-redis (co-located)    │
  │  whatsapp-service :3100 + resolver :3200                   │
  │       = GCP cybercontrol-wa / wa-2                         │
  │                                                            │
  │  Tailscale MagicDNS identities (sidecars):                 │
  │    cybercontrol-app  cybercontrol-db  cybercontrol-wa      │
  └────────────────────────────────────────────────────────────┘
```

Same trust zones as NETWORKING.md:

- **Public:** only TLS edge (`:80`/`:443`).
- **Private:** everything else via Docker DNS **or** Tailscale MagicDNS.

---

## Name contract (identical to GCP)

| MagicDNS | Serves on this box | Callers |
|---|---|---|
| `cybercontrol-app` | backend `:3000`, ext `:3300`, nginx via host | Vercel (via public HTTPS), WA `PARENT_URL` for off-box peers |
| `cybercontrol-db` | postgres `:5432` | any tailnet tool / future shards |
| `cybercontrol-wa` | whatsapp-service `:3100` | backend `WA_SERVICE` / `WA_INSTANCES` |

Inside compose, prefer Docker DNS (`postgres`, `backend`, `whatsapp-service`) — same as co-located services talking over localhost on a GCP VM.

---

## Compose file

`deploy/compose/docker-compose.aws-mvp.yml` → `/opt/cybercontrol-docker/docker-compose.yml`

| GCP multi-VM | AWS MVP single-host |
|---|---|
| `docker-compose.app.yml` on app VM | backend + extension-service in the same file |
| native Postgres on db VM | `postgres` service + `tailscale-db` sidecar |
| `docker-compose.wa.yml` on wa VM | `whatsapp-service` + `tailscale-wa` |
| resolver via **pm2** on wa host | `whatsapp-resolver` container (MVP-only; live session migrate carefully) |
| nginx+certbot on **lb** VMs | **Caddy** on this box (TLS) + internal nginx (routes) |
| host `tailscaled` per VM | compose sidecars (disable host `tailscaled` — TUN conflict) |

---

## Public edge

```
DNS:  api.cybercontrol.fun  A → 44.219.62.198
SG:   22, 80, 443 only
TLS:  Caddy → Let's Encrypt for api.cybercontrol.fun
App:  Vercel still uses VITE_API_URL=https://api.cybercontrol.fun/api
```

Do **not** open `3000`/`3300`/`3100`/`5432` on the security group.
Those ports may be published on the host so the `cybercontrol-app` Tailscale
identity (host TUN) can reach them — same idea as GCP host-network listeners
behind a firewall that only allows 80/443.

---

## Ops (keep GCP habits)

1. Images from **GHCR** (`:latest` / `:<sha>`), not build-on-box.
2. Secrets in `/opt/cybercontrol-docker/.env` (assembled from GitHub secrets).
3. Deploy = `docker compose pull && docker compose up -d` (manual gate).
4. Health: `https://api.cybercontrol.fun/api/health`
5. Tailscale admin should show `cybercontrol-app`, `cybercontrol-db`, `cybercontrol-wa`.

Workflow helpers:

- `aws-mvp-tailscale-compose.yml` — inject OAuth + (re)start MagicDNS sidecars.

---

## What we will not reinvent

- Frontend hosting stays **Vercel**.
- API hostname stays **`api.cybercontrol.fun`**.
- Service discovery stays **MagicDNS names**, not cloud IPs.
- CD stays **pull GHCR + recreate**, not rebuild on EC2.
