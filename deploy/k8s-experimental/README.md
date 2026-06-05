# k8s-experimental — NOT DEPLOYED, OUT OF DATE

⚠️ **These Kubernetes manifests are aspirational scaffolding. They are not deployed anywhere
and do not reflect the current architecture.** Do not assume they describe the running system.

The real deployment is **GHCR images on GCE/Oracle VMs connected over a Tailscale tailnet**.
See [`/GHCR.md`](../../GHCR.md) for the authoritative architecture, images, connectivity, and
VM-shift runbooks.

## Why these are stale (if you ever revive them)
- `backend.yaml` references `cybercontrol/backend:latest` — the real images are
  `ghcr.io/yashaswikaahuja/cybercontrol-*:latest`.
- `postgres.yaml` runs an **in-cluster** database. The real DB is **decoupled** on a dedicated
  host (`cybercontrol-db`), reached privately over the tailnet, with daily backups.
- `whatsapp-service.yaml` is a plain `Deployment`. The real WhatsApp service scales by
  **sharding** (one live WhatsApp socket per workspace, exactly one owner) — that requires
  StatefulSets + the workspace shard map (see the DB-backed auth / `wa_assignments` work).
- No tailnet, no shard routing, `replicas: 1` throughout.

## If Kubernetes is ever adopted
This base would need: GHCR image refs, removal of in-cluster Postgres (point at the external DB),
a StatefulSet + shard logic for whatsapp-service, a singleton resolver, and a progressive-delivery
controller (Argo Rollouts / Flagger) for canary/blue-green.
