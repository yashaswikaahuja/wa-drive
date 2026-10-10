#!/usr/bin/env bash
# db-backup.sh — nightly Postgres backup → AWS S3, no AWS CLI required.
#
# WHAT: pg_dump the cybercontrol DB (over the tailnet) → gzip → upload to an S3 bucket via
#       the AWS REST API using Signature Version 4. Retention is handled by the bucket's
#       lifecycle rule (auto-delete after N days).
#
# WHY curl + SigV4 instead of awscli: keeps the VM lean (no SDK install). Swap bucket/region
#     to move storage; the dump + upload pattern stays identical.
#
# RUNS ON: any app VM that reaches cybercontrol-db:5432 over the tailnet and has Docker
#          (postgres:15-alpine provides pg_dump) + python3.
#
# REQUIRES (env or the defaults below):
#   DATABASE_URL            postgres connection string  (default: read from backend.env)
#   S3_BUCKET               target bucket name          (default: cybercontrol-db-backups)
#   S3_REGION               AWS region                  (default: us-east-1)
#   AWS_ACCESS_KEY_ID       IAM key with s3:PutObject   (required)
#   AWS_SECRET_ACCESS_KEY                                (required)
#   PG_IMAGE                pg_dump image               (default: postgres:15-alpine)
#
# Exit non-zero on any failure so cron/monitoring can alert.
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-$(sudo grep -h '^DATABASE_URL=' /opt/cybercontrol-docker/backend.env 2>/dev/null | cut -d= -f2-)}"
S3_BUCKET="${S3_BUCKET:-cybercontrol-db-backups}"
S3_REGION="${S3_REGION:-us-east-1}"
PG_IMAGE="${PG_IMAGE:-postgres:15-alpine}"
LOG_TAG="[db-backup]"

log()  { echo "$LOG_TAG $(date -u +%FT%TZ) $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

[ -n "${DATABASE_URL:-}"          ] || fail "DATABASE_URL not set / not found"
[ -n "${AWS_ACCESS_KEY_ID:-}"     ] || fail "AWS_ACCESS_KEY_ID not set"
[ -n "${AWS_SECRET_ACCESS_KEY:-}" ] || fail "AWS_SECRET_ACCESS_KEY not set"

TS="$(date -u +%Y%m%d-%H%M%S)"
OBJECT="cybercontrol-${TS}.sql.gz"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
DUMP="$TMP/$OBJECT"

# ── 1. Dump + compress ───────────────────────────────────────────────────────
log "dumping database → $DUMP"
sudo docker run --rm --network host "$PG_IMAGE" pg_dump "$DATABASE_URL" 2>"$TMP/pgdump.err" \
  | gzip > "$DUMP" \
  || { cat "$TMP/pgdump.err" >&2; fail "pg_dump failed"; }
SIZE=$(stat -c%s "$DUMP")
[ "$SIZE" -gt 100 ] || fail "dump suspiciously small ($SIZE bytes) — aborting"
log "dump ok: $SIZE bytes"

# ── 2. Upload to S3 via SigV4 (python3, no awscli) ──────────────────────────
log "uploading → s3://${S3_BUCKET}/${OBJECT}"
python3 - "$DUMP" "$OBJECT" "$S3_BUCKET" "$S3_REGION" \
  "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" <<'PY'
import sys, hashlib, hmac, datetime, urllib.request

dump_path, obj_key, bucket, region, key_id, secret = sys.argv[1:]

with open(dump_path, 'rb') as f:
    payload = f.read()

payload_hash = hashlib.sha256(payload).hexdigest()
now          = datetime.datetime.utcnow()
datestamp    = now.strftime('%Y%m%d')
amzdate      = now.strftime('%Y%m%dT%H%M%SZ')
host         = f'{bucket}.s3.{region}.amazonaws.com'
url          = f'https://{host}/{obj_key}'

signed_headers = 'content-type;host;x-amz-content-sha256;x-amz-date'
canonical = '\n'.join([
    'PUT', f'/{obj_key}', '',
    f'content-type:application/gzip',
    f'host:{host}',
    f'x-amz-content-sha256:{payload_hash}',
    f'x-amz-date:{amzdate}',
    '', signed_headers, payload_hash,
])

credential_scope = f'{datestamp}/{region}/s3/aws4_request'
string_to_sign = '\n'.join([
    'AWS4-HMAC-SHA256', amzdate, credential_scope,
    hashlib.sha256(canonical.encode()).hexdigest(),
])

def sign(key, msg):
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()

signing_key = sign(sign(sign(sign(
    f'AWS4{secret}'.encode(), datestamp), region), 's3'), 'aws4_request')
signature = hmac.new(signing_key, string_to_sign.encode(), hashlib.sha256).hexdigest()

auth = (f'AWS4-HMAC-SHA256 Credential={key_id}/{credential_scope}, '
        f'SignedHeaders={signed_headers}, Signature={signature}')

req = urllib.request.Request(url, data=payload, method='PUT', headers={
    'Content-Type': 'application/gzip',
    'x-amz-date': amzdate,
    'x-amz-content-sha256': payload_hash,
    'Authorization': auth,
})
try:
    resp = urllib.request.urlopen(req, timeout=120)
    print(f'upload ok: HTTP {resp.status}')
except urllib.error.HTTPError as e:
    print(f'upload failed: HTTP {e.code}', file=sys.stderr)
    print(e.read().decode(errors='replace'), file=sys.stderr)
    sys.exit(1)
PY

log "uploaded → s3://${S3_BUCKET}/${OBJECT}"
log "done. retention handled by bucket lifecycle rule."
