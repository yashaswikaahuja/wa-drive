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

## Step A.2 — QR cache → Redis  (remaining, for full multi-instance)
The QR cache is only used while **linking a WhatsApp account** (rare, one-time per workspace). Until it's
shared, QR linking under multiple backends can miss. Options:
- move the `workspaceQRs` map into Redis (make `get/setWorkspaceQR` async — touches `routes.ts`), **or**
- do account-linking while on a single instance / pin the linking endpoints (sticky) — simplest interim.

## Step B — the LB tier (when load/HA needs it)
```
  DNS round-robin (portable)  OR  managed cloud LB (easy, cloud-locked)
        │
        ├── nginx LB-1 ──┐
        └── nginx LB-2 ──┤  round-robin (websocket-aware)
                         ▼
              backend-1 / backend-2 / backend-3   (REDIS_URL set)
                         ▼
                  shared DB + Redis
```
1. stand up **Redis** (small box on the tailnet, e.g. `cybercontrol-redis:6379`); set `REDIS_URL` on the backends.
2. run 2+ backend replicas (containers or VMs).
3. front them with **nginx** (the "parent"), websocket-aware (proxy upgrade headers + a sticky hint for QR).

### Is one parent LB a bottleneck?
- **Throughput:** rarely — an LB just forwards bytes (no app work, no DB), so one small nginx handles far
  more than the backends behind it. Backends saturate first.
- **Availability:** yes — a single LB is a single point of failure. Fix when needed with **two nginx LBs +
  DNS round-robin** (portable) or a **managed load balancer** (Cloudflare/GCP/AWS — HA behind one IP).

## Status
- ✅ Step A (Redis adapter) shipped, flag-gated, backend stays single-instance until `REDIS_URL` is set.
- ⬜ Step A.2 (QR cache → Redis) — do before running multiple backends if QR linking must work mid-scale.
- ⬜ Step B (Redis box + replicas + LB) — when backend load or HA actually requires it (not yet).
