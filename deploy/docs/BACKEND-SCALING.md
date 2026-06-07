# Backend scaling

The backend is **stateless except for two in-memory things**, which is what gates running it as
multiple instances behind a load balancer:

```
  socket.io events   io.to(room).emit / io.emit only reach clients on the SAME instance
  QR cache (Map)     worker posts a QR to instance A; frontend may poll instance B → miss
```

## Step A — socket.io Redis adapter  ✅ DONE (flag-gated, OFF by default)
With `REDIS_URL` set, socket.io routes events through Redis, so a client on any backend instance
receives events emitted by any other instance (connection status, file inbox, upload progress…).

- Code: `backend/src/socket/index.ts` (attaches `@socket.io/redis-adapter` when `REDIS_URL` is set).
- Config: `REDIS_URL` (empty = single-instance, **current behavior unchanged**; fail-safe if Redis is down).
- Deps: `redis`, `@socket.io/redis-adapter` (lockfile updated).

This makes the **realtime layer** multi-instance-ready. No production change until `REDIS_URL` is set.

## Step A.2 — QR cache → Redis  ✅ DONE (flag-gated, OFF by default)
The QR cache is used while **linking a WhatsApp account**. It is now Redis-backed when `REDIS_URL` is
set, so a QR produced on one backend is visible to a frontend polling any other backend.
- Code: `backend/src/socket/index.ts` — `getWorkspaceQR` / `setWorkspaceQR` / `getWorkspaceQRWithAge`
  are now **async**, backed by Redis keys `wa:qr:<workspaceId>` (40s TTL), with the in-memory `Map`
  kept as a **fallback** (single-instance mode, or a brief Redis outage → graceful degrade).
- Callers awaited in `backend/src/modules/whatsapp/routes.ts` (`/status`, `/qr`, `/event`).
- `REDIS_URL` empty = single-instance, **current behavior unchanged**.

## Extension-service — shared document store  ✅ DONE
`form_mappings.json` and `adapters.json` used to live on local disk (`DATA_DIR`), which made the
extension-service single-instance (two replicas would diverge). They now live in **shared Postgres**.
- Code: `extension-service/store.js` — table `ext_kv_store(key, data jsonb, updated_at)`, one row per
  document (`form_mappings`, `adapters`); `loadDoc`/`saveDoc` async upsert; `ensureSchema()` runs on boot.
- Refactored to async: `routes/{mappings,adapters,corrections,agent}.js`.
- Migration: `extension-service/migrations/002_kv_store.sql` (also created in-process on boot).
- **One-time cutover:** on the live VM run
  `DATABASE_URL=... DATA_DIR=/opt/extension-service/data node migrate-files-to-db.js`
  to copy existing learned mappings/adapters into the DB before scaling out.

## Step B — the LB tier  ✅ TEMPLATE READY (deploy when load/HA needs it)
```
  client → nginx LB ─┬─ backend-1 / backend-2 …   (least_conn for /api, ip_hash for /socket.io)
                     └─ ext-1     / ext-2     …   (least_conn)
                shared: Postgres (cybercontrol-db) + Redis
```
- LB config: `deploy/loadbalancer/nginx.conf` (+ `lb_proxy_params`). `/api/*` → `least_conn` (stateless);
  `/socket.io/*` → `ip_hash` (a websocket must stay pinned to one backend; the Redis adapter still fans
  events from the other backends).
- Pool compose: `deploy/compose/docker-compose.scale.yml` — Redis + 2 backends + 2 ext-services + nginx
  LB on one host, all with `REDIS_URL` set and sharing `DATABASE_URL`. A single-host template; in prod
  spread the instances across VMs/orchestrator pointing at the same external Postgres + shared Redis.

### Is one parent LB a bottleneck?
- **Throughput:** rarely — an LB just forwards bytes (no app work, no DB), so one small nginx handles far
  more than the backends behind it. Backends saturate first.
- **Availability:** yes — a single LB is a single point of failure. Fix when needed with **two nginx LBs +
  DNS round-robin** (portable) or a **managed load balancer** (Cloudflare/GCP/AWS — HA behind one IP).

## Status
- ✅ Step A (Redis adapter) — realtime events fan out across backends.
- ✅ Step A.2 (QR cache → Redis) — QR linking works across backends.
- ✅ Extension-service state → Postgres — mappings/adapters shared across replicas.
- ✅ Step B template — `nginx.conf` + `docker-compose.scale.yml` ready to run a multi-instance pool.
- ⬜ **Activation** (production): set `REDIS_URL` on the backends, run the ext-service file→DB migration
  once, stand up Redis, then bring up the pool behind the LB. Nothing changes in prod until you do —
  every piece is flag-gated and backward-compatible (empty `REDIS_URL` = today's single-instance).
