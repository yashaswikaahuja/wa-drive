#!/usr/bin/env bash
# db-backup.sh — nightly Postgres backup → GCS, cloud-agnostic, no gcloud/gsutil required.
#
# WHAT: pg_dump the cybercontrol DB (over the tailnet) → gzip → upload to a GCS bucket via the
#       JSON API with a service-account key (signs a JWT, exchanges for an access token, PUTs the
#       object). Retention is handled by the bucket's lifecycle rule (auto-delete after N days).
#
# WHY curl + SA key instead of gsutil: keeps the VM lean (no SDK install) and the upload step is a
#     plain HTTPS PUT, so swapping GCS for S3/Backblaze later is a small change (one upload function).
#
# RUNS ON: the app VM (gcp-worker) — it reaches cybercontrol-db:5432 over the tailnet and has Docker
#          (postgres:15-alpine provides pg_dump). The DB VM itself has no usable SSH.
#
# REQUIRES (env or the defaults below):
#   DATABASE_URL        postgres connection string (default: read from backend.env)
#   GCS_BUCKET          target bucket name           (default: cybercontrol-db-backups)
#   SA_KEY_FILE         path to the service-account JSON key (default: /opt/cybercontrol-docker/db-backup-key.json)
#   PG_IMAGE            pg_dump image                (default: postgres:15-alpine — match server major)
#
# Exit non-zero on any failure so cron/monitoring can alert.
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-$(sudo grep -h '^DATABASE_URL=' /opt/cybercontrol-docker/backend.env | cut -d= -f2-)}"
GCS_BUCKET="${GCS_BUCKET:-cybercontrol-db-backups}"
SA_KEY_FILE="${SA_KEY_FILE:-/opt/cybercontrol-docker/db-backup-key.json}"
PG_IMAGE="${PG_IMAGE:-postgres:15-alpine}"
LOG_TAG="[db-backup]"

log() { echo "$LOG_TAG $(date -u +%FT%TZ) $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

[ -n "$DATABASE_URL" ] || fail "DATABASE_URL not set / not found"
[ -f "$SA_KEY_FILE" ]  || fail "SA key file not found: $SA_KEY_FILE"

TS="$(date -u +%Y%m%d-%H%M%S)"
OBJECT="cybercontrol-${TS}.sql.gz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
DUMP="$TMP/$OBJECT"

# ── 1. Dump + compress ───────────────────────────────────────────────────────
log "dumping database → $DUMP"
sudo docker run --rm --network host "$PG_IMAGE" pg_dump "$DATABASE_URL" 2>"$TMP/pgdump.err" | gzip > "$DUMP" \
  || { cat "$TMP/pgdump.err" >&2; fail "pg_dump failed"; }
SIZE=$(stat -c%s "$DUMP")
[ "$SIZE" -gt 100 ] || fail "dump suspiciously small ($SIZE bytes) — aborting"
log "dump ok: $SIZE bytes"

# ── 2. Mint a GCS access token from the SA key (JWT bearer flow) ──────────────
# Done in a tiny python one-liner (python3 is present); avoids needing gcloud.
ACCESS_TOKEN="$(python3 - "$SA_KEY_FILE" <<'PY'
import sys, json, time, base64, urllib.request, urllib.parse, hashlib
key = json.load(open(sys.argv[1]))
def b64(b): return base64.urlsafe_b64encode(b).rstrip(b'=')
now = int(time.time())
claim = {"iss": key["client_email"], "scope": "https://www.googleapis.com/auth/devstorage.read_write",
         "aud": "https://oauth2.googleapis.com/token", "iat": now, "exp": now + 3600}
header = {"alg": "RS256", "typ": "JWT"}
signing_input = b64(json.dumps(header).encode()) + b'.' + b64(json.dumps(claim).encode())
# RS256 sign using the private key (use cryptography if available, else openssl fallback)
try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    pk = serialization.load_pem_private_key(key["private_key"].encode(), password=None)
    sig = pk.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
except Exception:
    import subprocess, tempfile, os
    with tempfile.NamedTemporaryFile('w', suffix='.pem', delete=False) as f:
        f.write(key["private_key"]); pem = f.name
    sig = subprocess.run(["openssl","dgst","-sha256","-sign",pem],input=signing_input,
                         stdout=subprocess.PIPE,check=True).stdout
    os.unlink(pem)
jwt = signing_input + b'.' + b64(sig)
data = urllib.parse.urlencode({"grant_type":"urn:ietf:params:oauth:grant-type:jwt-bearer","assertion":jwt.decode()}).encode()
resp = urllib.request.urlopen("https://oauth2.googleapis.com/token", data=data, timeout=30)
print(json.load(resp)["access_token"])
PY
)" || fail "failed to mint GCS access token"
[ -n "$ACCESS_TOKEN" ] || fail "empty access token"
log "got access token"

# ── 3. Upload to GCS (resumable not needed for ~3MB; simple media upload) ─────
UPLOAD_URL="https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET}/o?uploadType=media&name=${OBJECT}"
HTTP=$(curl -s -o "$TMP/resp.json" -w '%{http_code}' -X POST "$UPLOAD_URL" \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/gzip" \
  --data-binary @"$DUMP")
[ "$HTTP" = "200" ] || { cat "$TMP/resp.json" >&2; fail "upload failed (HTTP $HTTP)"; }
log "uploaded → gs://${GCS_BUCKET}/${OBJECT} (HTTP $HTTP)"
log "done. retention handled by bucket lifecycle."
