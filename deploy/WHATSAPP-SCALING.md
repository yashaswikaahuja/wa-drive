# WhatsApp scaling — sticky shards + failover

How the WhatsApp tier scales across multiple VMs, and the ruleset that keeps a logged-in account
**stable on one instance** (no surprise re-scans) while still surviving an instance going down.

> ✅ **ACTIVATED (2026-06-06).** Live shard pool: `cybercontrol-wa` (asia) + `cybercontrol-wa-2`
> (us-central1, kishynay account, 3ms to DB). Both on DB-backed auth + heartbeating. A live failover
> drill passed: stopping `cybercontrol-wa` moved the customer to `cybercontrol-wa-2` and reconnected
> from the DB **with no QR re-scan**. Tuning in use: `WA_DEAD_AFTER_MS=30000`, `WA_HEARTBEAT_MS=10000`.

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
  to the hub every `WA_HEARTBEAT_MS` (code default 20s; **live: 10s**). The hub upserts `wa_instances.last_seen`.
- The hub treats an instance as **alive** if `last_seen` is within `WA_DEAD_AFTER_MS` (code default 90s;
  **live: 30s** — ~3 missed beats, fast failover without flapping on a brief blip).
- If an instance is off the tailnet, its heartbeats can't reach the hub → it's marked dead → its
  workspaces fail over. This is exactly the "only logs out if the instance disconnects" rule you wanted.

### What makes failover seamless (no re-scan)
DB-backed Baileys auth (`WA_AUTH_BACKEND=postgres`): each workspace's creds/keys live in Postgres
(`wa_auth_creds`, `wa_auth_keys`), not on a VM's disk. So a different instance can restore the session
and reconnect **without** a QR scan. On boot, an instance also **resumes** the sessions assigned to it
(`resumeAssignedSessions()` → `wa_assignments WHERE instance = me`).

## The resolver is shared — reach it over the tailnet
The **whatsapp-resolver** (whatsapp-web.js, contact/LID lookups) is a single non-scaling oracle that
runs on **`cybercontrol-wa`** only (pm2, bound to `*:3200`). When the service is sharded, every
instance must reach that one resolver over the tailnet — **not** `localhost`:

```
   RESOLVER_URL = http://cybercontrol-wa:3200      (all WA instances, via CD var)
```
If left at the default `localhost:3200`, a shard with no local resolver (e.g. `cybercontrol-wa-2`)
can't resolve contacts. Provisioned as the repo variable `RESOLVER_URL` and written into each WA
instance's env by CD.

> ⚠️ The resolver is a genuine **single point of failure**: whatsapp-web.js allows only one session, so
> it can't be cloned. If `cybercontrol-wa` goes down, WhatsApp *sessions* fail over fine, but
> *contact resolution* stops cluster-wide until it's back. Making the resolver resilient is a separate,
> harder problem.

## Components
| Piece | Where |
|---|---|
| `wa_assignments` (workspace → instance, assigned_at) | `backend/migrations/wa_auth.sql` |
| `wa_instances` (instance, last_seen, status) | `backend/migrations/wa_instance_health.sql` |
| sticky+failover routing (`waBase`, `healthyInstances`, `pickInstance`) | `backend/src/modules/whatsapp/routes.ts` |
| heartbeat endpoint `/instance-heartbeat` | same file (mounted at `/api/worker` + `/api/whatsapp`) |
| heartbeat sender + boot resume | `whatsapp-service/index.js` |
| tuning: `WA_INSTANCES`, `WA_DEAD_AFTER_MS`, `WA_HEARTBEAT_MS`, `WA_MIN_HOLD_MS`, `RESOLVER_URL` | repo/env GitHub Variables (provisioned by CD) |

## Backward compatibility
With **no `WA_INSTANCES`** (and no `WA_INSTANCE_NAME` on the service), everything falls back to the
single `WA_SERVICE` — current production behaviour is unchanged. The ruleset only activates when you
configure instances.

## Fast instance bring-up (~2 min, self-provisioning)
The manual sequence (install docker/tailscale → join → deploy user → GHCR login → copy compose) is
baked into [`deploy/provision-wa-instance.sh`](provision-wa-instance.sh) as a **GCP startup script**.
A new WhatsApp VM self-provisions on first boot — you only pass three per-instance values as metadata:

```bash
gcloud compute instances create cybercontrol-wa-3 \
  --zone=us-central1-a --machine-type=e2-micro \
  --image-family=debian-12 --image-project=debian-cloud \
  --metadata-from-file startup-script=deploy/provision-wa-instance.sh \
  --metadata ts-authkey=tskey-auth-XXXX,wa-instance-name=cybercontrol-wa-3,ghcr-token=ghp_XXXX
# wait ~90s (boot + provision: docker, tailscale join, deploy user, GHCR login, compose)
```
Then the GitHub side (also quick):
1. env `whatsapp-service-3` → vars `WA_INSTANCE_NAME=cybercontrol-wa-3`, `WA_AUTH_BACKEND=postgres`
2. add a `whatsapp-service-3` target in `deploy.yml` (copy the wa-2 block, change host + environment)
3. update repo var `WA_INSTANCES=...,cybercontrol-wa-3`
4. Deploy (manual) → `whatsapp-service-3`, then re-deploy `backend`

> Even faster: snapshot a provisioned VM into a **machine image** (docker + deploy user + compose
> pre-baked); new instances then only run steps 2 (tailscale join) + 4 (GHCR login) on boot.

## Activation runbook (done for wa-2; reuse for a 3rd VM)
This was followed on 2026-06-06 to add `cybercontrol-wa-2`; reuse it verbatim for any further instance.
All env values are provisioned by CD (`_deploy.yml` writes them into each VM's `<service>.env`), so set
them as **GitHub Variables** — do *not* hand-edit VM files. Also set `RESOLVER_URL=http://cybercontrol-wa:3200`
(repo var) so the new instance reaches the shared resolver.

1. **Switch auth to Postgres** so sessions can move: set variable `WA_AUTH_BACKEND=postgres` in each
   whatsapp-service environment, and run the migrations on the DB:
   ```
   psql "$DATABASE_URL" -f backend/migrations/wa_auth.sql
   psql "$DATABASE_URL" -f backend/migrations/wa_instance_health.sql
   ```
   (One-time: migrate existing on-disk sessions into the DB with
   `whatsapp-service/migrate-sessions-to-db.js`. Files-mode sessions can't fail over.)
2. **Tell the hub the pool**: set variable `WA_INSTANCES=cybercontrol-wa-1,cybercontrol-wa-2` so the
   **backend** deploy writes it (set it as a repo variable, or in the `backend` environment).
3. **Name each instance** — and this is the key CD detail: `WA_INSTANCE_NAME` must be **distinct per WA
   VM**, so one shared `whatsapp-service` environment can't serve two VMs. Create a **per-instance
   environment + deploy target** for each WA VM:
   - environment `whatsapp-service-1` → var `WA_INSTANCE_NAME=cybercontrol-wa-1` (+ `WA_AUTH_BACKEND=postgres`)
   - environment `whatsapp-service-2` → var `WA_INSTANCE_NAME=cybercontrol-wa-2` (+ `WA_AUTH_BACKEND=postgres`)
   - add a deploy job (or matrix entry) in `deploy.yml` per WA VM, each pointing `host` at that VM and
     `environment` at its per-instance environment.
4. Deploy each service. CD now writes `WA_INSTANCES` into the backend's env and the correct
   `WA_INSTANCE_NAME` into each worker's env, so the backend routes shard-aware and each worker
   heartbeats. New workspaces spread across instances; existing ones pin on first use; sessions stay
   put unless an instance dies.

> Until you add the per-instance environments + targets (step 3), `WA_INSTANCE_NAME` is empty and the
> worker stays in single-instance mode (no heartbeat) — which is the safe default.

> ⚠️ Switching a currently-connected `files`-mode account to `postgres` is a one-time re-link (the
> creds location changes). Plan it like the original cutover. After that, moves are re-scan-free.

## Limits / not yet done
- **No active-active** for a single account (protocol limit) — failover is active-passive.
- The hub triggers failover lazily (on the next request for that workspace) and the new owner also
  resumes on boot; a always-on reconciler/cron could fail sessions over proactively the moment an
  instance dies, rather than on next use.
- Single-account redundancy via WhatsApp's 4-linked-devices is possible but not implemented (needs
  message de-dup + reply coordination).
