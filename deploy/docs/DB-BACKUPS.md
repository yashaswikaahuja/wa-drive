# Database Backups & Restore Runbook

Nightly offsite backups of the CyberControl Postgres, and how to restore them.

## At a glance
```
  WHAT      full pg_dump of the cybercontrol DB → gzip → GCS bucket
  WHERE     gs://cybercontrol-db-backups   (project cybercontrol-db-20260605, us-central1)
  WHEN      nightly 02:30 UTC (cron on the app VM, gcp-worker)
  RETENTION 30 days (bucket lifecycle auto-deletes older objects)
  SIZE      ~3 MB gzipped per night
  SCRIPT    deploy/scripts/db-backup.sh  (installed at /opt/cybercontrol-docker/db-backup.sh)
  CREDS     SA db-backup@…  (objectAdmin on ONLY this bucket) key at
            /opt/cybercontrol-docker/db-backup-key.json (root, 600)
```

## Why it runs on the app VM (not the DB VM)
The DB VM (`cybercontrol-db`) has no usable SSH. The app VM (`gcp-worker`) reaches Postgres over the
tailnet (`cybercontrol-db:5432`) and has Docker (provides `pg_dump` via `postgres:15-alpine`). The
backup is just `dump → gzip → HTTPS PUT to GCS`, so it doesn't need gcloud installed — it mints a GCS
token from the SA key with a small python step. This keeps it **cloud-agnostic**: to move off GCS,
swap the upload step for the new provider's PUT (S3/Backblaze), nothing else changes.

## Architecture
```
   cron 02:30 UTC (app VM)
        │
        ▼
   db-backup.sh
        │  pg_dump over tailnet
        ▼
   cybercontrol-db:5432 ──► gzip ──► GCS PUT ──► gs://cybercontrol-db-backups/cybercontrol-<ts>.sql.gz
                                       (SA key → JWT → access token)
```

## Verify backups are running
```bash
# list recent backups (from any box with gcloud authed as kishynay)
gcloud storage ls -l gs://cybercontrol-db-backups/ | tail

# check the cron log on the app VM
ssh gcp-worker "sudo tail -20 /var/log/db-backup.log"

# run one on demand
ssh gcp-worker "sudo DATABASE_URL=\$(grep -h '^DATABASE_URL=' /opt/cybercontrol-docker/backend.env | cut -d= -f2-) /opt/cybercontrol-docker/db-backup.sh"
```

## RESTORE (tested procedure)
The dump is a plain `pg_dump` (SQL). Restore into any Postgres 15+.

```bash
# 1. download a backup (pick the timestamp you want)
gcloud storage cp gs://cybercontrol-db-backups/cybercontrol-<ts>.sql.gz .

# 2. restore into a TARGET database (throwaway first to verify!)
#    create an empty db, then pipe the dump in:
createdb -h <host> -U <user> cybercontrol_restore
gunzip -c cybercontrol-<ts>.sql.gz | psql -h <host> -U <user> -d cybercontrol_restore

# 3. sanity-check row counts
psql -h <host> -U <user> -d cybercontrol_restore -c \
  "SELECT 'profiles',count(*) FROM profiles
   UNION ALL SELECT 'drive_files',count(*) FROM drive_files
   UNION ALL SELECT 'extraction_cache',count(*) FROM extraction_cache;"
```

### Restoring over the LIVE database (disaster recovery)
> ⚠️ Destructive. Only when the live DB is lost/corrupt. Take a fresh dump first if the DB is still up.
```bash
# point at the live DB and restore into a NEW db, then cut over by renaming, OR restore in place:
gunzip -c cybercontrol-<ts>.sql.gz | psql "$DATABASE_URL"
# (the dump does not DROP the database; restoring into a populated db can conflict —
#  prefer restoring into a fresh db and repointing DATABASE_URL.)
```

## Restore drill — last verified
- **2026-06-10:** downloaded the nightly dump, restored into a throwaway Postgres 17, row counts matched
  live (profiles 53, workspaces 14, users 14; drive_files/sessions slightly higher = live growth since).
  Spot-checked: 11 `extraction_cache` rows for a sample customer restored intact. **Restore works.**

## Rotate the SA key
```bash
# create a new key, replace on the VM, delete the old one
gcloud iam service-accounts keys create new-key.json \
  --iam-account=db-backup@cybercontrol-db-20260605.iam.gserviceaccount.com
scp new-key.json gcp-worker:/tmp/ && ssh gcp-worker \
  "sudo mv /tmp/new-key.json /opt/cybercontrol-docker/db-backup-key.json && sudo chmod 600 /opt/cybercontrol-docker/db-backup-key.json"
# then delete the old key id (gcloud iam service-accounts keys list / delete)
```

## Known limitations / future
- **Single nightly snapshot** — up to 24h of data loss on a restore. For tighter RPO, add WAL archiving
  / point-in-time recovery (bigger lift) or run the script more often.
- **One region** — the bucket is single-region us-central1. For DR across regions, enable bucket
  replication or copy to a second bucket.
- **Restore is manual** — by design (restores are rare + risky). The drill above is the procedure.
