# WhatsApp scaling — sticky shards + failover

How the WhatsApp tier scales across multiple VMs, and the ruleset that keeps a logged-in account
**stable on one instance** (no surprise re-scans) while still surviving an instance going down.

## Why WhatsApp is different from the backend
The backend is stateless → round-robin across replicas. WhatsApp is **not**: one WhatsApp account =
one live socket = **one linked device**. You cannot run the same account on two instances at once
(WhatsApp's duplicate-session detection logs it out). So WhatsApp scales by **sharding accounts across
instances**, not by load-balancing one account.

```
   backend ──(routes each workspace to its owner)──┐
                                                    ▼
   wa-1: workspaces A–H     wa-2: workspaces I–P     wa-3: workspaces Q–Z
        │                        │                        │
        └──────── DB-backed Baileys auth (per workspace) ─┘   ← creds in Postgres,
                                                                not on local disk
```

Library note: **Baileys** (socket, no browser) gives high session density and is the right tool here;
**whatsapp-web.js** (the resolver) drives a headless Chromium, so it stays a single non-scaling oracle.
WhatsApp's protocol also allows up to **4 linked devices** per number — usable for single-account
redundancy later, but not a general load-balancer.

## The sticky-shard ruleset
Goal: **a logged-in account stays on its instance and is not migrated** — so the operator never has to
re-scan — and it only ever moves if its instance genuinely dies.

```
   ASSIGN     first time a workspace is used → pinned to the least-loaded HEALTHY instance
              (row in wa_assignments: workspace_id → instance, assigned_at)

   STICKY     while the assigned instance is ALIVE, the workspace ALWAYS routes to it.
              It is never moved for load/rebalancing → stable for the life of the instance
              (≥24h guaranteed in normal operation; WA_MIN_HOLD_MS documents the floor).

   FAILOVER   ONLY when the assigned instance is DEAD — it stopped heartbeating, i.e. it
   (rare)     dropped off the tailnet. Then the workspace is reassigned to a healthy instance,
              which restores the session from the DB (no QR re-scan), and the hub triggers
              /sessions/start on the new owner.
```

### How "alive / dead" is decided — heartbeats
- Each `whatsapp-service` instance POSTs `/api/worker/instance-heartbeat` (with its `WA_INSTANCE_NAME`)
  to the hub every `WA_HEARTBEAT_MS` (default 20s). The hub upserts `wa_instances.last_seen`.
- The hub treats an instance as **alive** if `last_seen` is within `WA_DEAD_AFTER_MS` (default **90s** —
  several missed beats, so a brief blip doesn't trigger a needless failover).
- If an instance is off the tailnet, its heartbeats can't reach the hub → it's marked dead → its
  workspaces fail over. This is exactly the "only logs out if the instance disconnects" rule you wanted.

### What makes failover seamless (no re-scan)
DB-backed Baileys auth (`WA_AUTH_BACKEND=postgres`): each workspace's creds/keys live in Postgres
(`wa_auth_creds`, `wa_auth_keys`), not on a VM's disk. So a different instance can restore the session
and reconnect **without** a QR scan. On boot, an instance also **resumes** the sessions assigned to it
(`resumeAssignedSessions()` → `wa_assignments WHERE instance = me`).

## Components
| Piece | Where |
|---|---|
| `wa_assignments` (workspace → instance, assigned_at) | `backend/migrations/wa_auth.sql` |
| `wa_instances` (instance, last_seen, status) | `backend/migrations/wa_instance_health.sql` |
| sticky+failover routing (`waBase`, `healthyInstances`, `pickInstance`) | `backend/src/modules/whatsapp/routes.ts` |
| heartbeat endpoint `/instance-heartbeat` | same file (mounted at `/api/worker` + `/api/whatsapp`) |
| heartbeat sender + boot resume | `whatsapp-service/index.js` |
| tuning: `WA_INSTANCES`, `WA_DEAD_AFTER_MS`, `WA_MIN_HOLD_MS` | `backend/src/config.ts` |

## Backward compatibility
With **no `WA_INSTANCES`** (and no `WA_INSTANCE_NAME` on the service), everything falls back to the
single `WA_SERVICE` — current production behaviour is unchanged. The ruleset only activates when you
configure instances.

## Activation (when you add a 2nd WhatsApp VM)
1. **Switch auth to Postgres** so sessions can move: set `WA_AUTH_BACKEND=postgres` on the WA service(s)
   and run the migrations on the DB:
   ```
   psql "$DATABASE_URL" -f backend/migrations/wa_auth.sql
   psql "$DATABASE_URL" -f backend/migrations/wa_instance_health.sql
   ```
   (One-time: migrate existing on-disk sessions into the DB with
   `whatsapp-service/migrate-sessions-to-db.js`. Files-mode sessions can't fail over.)
2. **Name each instance**: set `WA_INSTANCE_NAME=cybercontrol-wa-1` (and `-2`, …) on each WA service —
   the value must match its tailnet hostname.
3. **Tell the hub the pool**: set `WA_INSTANCES=cybercontrol-wa-1,cybercontrol-wa-2` on the backend.
4. Deploy. New workspaces spread across instances; existing ones pin on first use; sessions stay put
   unless an instance dies.

> ⚠️ Switching a currently-connected `files`-mode account to `postgres` is a one-time re-link (the
> creds location changes). Plan it like the original cutover. After that, moves are re-scan-free.

## Limits / not yet done
- **No active-active** for a single account (protocol limit) — failover is active-passive.
- The hub triggers failover lazily (on the next request for that workspace) and the new owner also
  resumes on boot; a always-on reconciler/cron could fail sessions over proactively the moment an
  instance dies, rather than on next use.
- Single-account redundancy via WhatsApp's 4-linked-devices is possible but not implemented (needs
  message de-dup + reply coordination).
