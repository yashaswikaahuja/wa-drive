# deploy/

Deployment artifacts, organized by type.

```
  deploy/
    docs/              architecture + operations docs
      GHCR.md            images, tailnet, decoupled DB — the big picture
      CD.md              continuous deployment (build → GHCR → VM)
      WHATSAPP-SCALING.md  WhatsApp sharding, failover, instance bring-up
      BACKEND-SCALING.md   backend multi-instance (Redis adapter, LB tier)
      NETWORKING.md        diagram-first network reference (ports, names, tailnet, flows, failures)
      DB-BACKUPS.md        nightly Postgres backups → GCS, retention, and the restore runbook
      SCALING-AUTOMATION.md  one-step node bring-up (cloud-init) + rolling pool deploys
    scripts/           operational scripts
      provision-wa-instance.sh    provision a fresh WhatsApp VM (any cloud, env-var config)
      provision-wa-from-image.sh  boot-join script for VMs cloned from a pre-baked image
      cloud-init-wa.yaml          user-data to self-provision a WA node on first boot (any cloud)
      add-wa-shard.sh             add a provisioned VM to the cluster (one command)
      db-backup.sh                nightly pg_dump → gzip → GCS (cloud-agnostic, no gcloud needed)
    compose/           docker compose files used on the VMs
      docker-compose.app.yml      backend + extension-service (app VM)
      docker-compose.wa.yml       whatsapp-service (WA VMs)
      docker-compose.scale.yml    multi-instance pool: redis + 2 backends + 2 ext-svc + nginx LB
    loadbalancer/      nginx.conf + lb_proxy_params — the LB ("parent") tier in front of the pool
    tailscale/         tailscale-acl.json   tailnet ACL (tag:cybercontrol)
    k8s-experimental/  parked Kubernetes manifests (not deployed)
```

Start with [`docs/GHCR.md`](docs/GHCR.md) for the architecture, then [`docs/CD.md`](docs/CD.md) for how deploys work.
