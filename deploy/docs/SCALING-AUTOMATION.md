# Hands-off scaling: add a node + rolling pool deploys

How adding and updating pool nodes works with **no manual per-VM steps**. This is what makes the
GHCR-image investment pay off: a node ships one tested image, joins the mesh on boot, and updates
roll out across the whole pool from one button.

## The big picture
```
   ADD A NODE                         UPDATE THE POOL
   ──────────                         ───────────────
   create VM with cloud-init          push code → CI builds + smoke-tests image
        │ (user-data does everything)      │
        ▼                                  ▼
   boots → installs docker+tailscale   gh workflow run deploy.yml -f target=backend-pool
        → joins tailnet                     │
        → GHCR pull → runs container        ▼ rolling, one host at a time, health-gated
        → appears in the cluster        VM1 ✓ → VM2 ✓ → VM3 ✓   (stops if one fails)
```

## 1. Add a node — ONE step (any cloud)

Use [`cloud-init-wa.yaml`](../scripts/cloud-init-wa.yaml) as the VM's **user-data** at create time.
Fill the 5 placeholders (`__TS_AUTHKEY__`, `__WA_INSTANCE_NAME__`, `__GHCR_TOKEN__`,
`__DATABASE_URL__`, `__WA_SECRET__`). On first boot the VM self-provisions and starts the service.

```
   AWS:     paste into "User data" (Advanced details)
   Oracle:  Instance → "Cloud-init script" / paste base64 user-data
   GCP:     --metadata-from-file user-data=cloud-init-wa.yaml   (or the startup-script path)
   Hetzner/DO/Azure: the "user data" / "cloud-config" field
```

No SSH, no scp, no manual script run. The only `curl` inside is fetching the ~50-line **bootstrap
script** — your application ships as the GHCR image (`docker pull`), never as source on the VM.

> Private-repo note: the cloud-init `curl`s the provision script from the repo. Since the repo is
> private, either expose just that one script, bake it into a base image, or inline it into the
> user-data. (The application image stays private in GHCR — only the tiny bootstrap needs reach.)

## 2. Update the pool — rolling, health-gated

Set the pool membership once as **repo variables** (Settings → Secrets and variables → Variables):
```
   BACKEND_HOSTS = cybercontrol-app,cybercontrol-app-2,cybercontrol-app-3
   WA_HOSTS      = cybercontrol-wa,cybercontrol-wa-2
```
Then deploy the whole pool with one trigger:
```
   gh workflow run deploy.yml -f target=backend-pool   -f version=latest
   gh workflow run deploy.yml -f target=whatsapp-pool  -f version=latest
```
What happens:
```
   prep job: BACKEND_HOSTS csv ─► JSON array
        │
        ▼  matrix, max-parallel: 1  (rolling)
   host1: pull → recreate → health-check ──► ✓ continue
   host2: pull → recreate → health-check ──► ✗ FAIL
        │                                      └─ that host auto-rolls-back (prev image)
        ▼ fail-fast stops the rollout here     └─ remaining hosts untouched → pool stays mostly up
```
- **One host at a time** (`max-parallel: 1`) — the LB always has healthy backends.
- **Health-gated** — each host must pass its `/health` before the next starts.
- **Stops on failure** — a bad release can't roll across the whole fleet; the failed host reverts.
- **Rollback** — `-f version=<old-sha>` redeploys a previous image across the pool.

## 3. Single-host targets still work
The original targets are unchanged for one-off deploys / the current single VM:
```
   target=backend            → just cybercontrol-app
   target=extension-service  → just cybercontrol-app
   target=whatsapp-service   → cybercontrol-wa
   target=whatsapp-service-2 → cybercontrol-wa-2
   target=whatsapp-instance  → any one VM via -f wa_host=<name>
   target=backend-pool       → ALL of BACKEND_HOSTS  (rolling)   ← new
   target=whatsapp-pool      → ALL of WA_HOSTS        (rolling)   ← new
```

## So: why GHCR + this automation was worth it
```
   without:  per-VM git clone + npm install + build + system deps + "works on my machine"
   with:     create VM (self-provisions) → docker pull one tested image → in the cluster
             update = one button, rolling across N VMs, auto-rollback on failure
```
The manual steps you do for a *one-off test* on a bare VM collapse to **zero** in normal operation:
the cloud-init handles bring-up, the pool workflow handles updates.

## See also
- [`../scripts/cloud-init-wa.yaml`](../scripts/cloud-init-wa.yaml) — the one-step node user-data
- [`../scripts/provision-wa-instance.sh`](../scripts/provision-wa-instance.sh) — the bootstrap it runs
- [`CD.md`](CD.md) — the deploy pipeline + rollback
- [`BACKEND-SCALING.md`](BACKEND-SCALING.md) — the pool/LB architecture
