#!/bin/bash
# Add an already-provisioned WhatsApp VM to the cluster, in one command.
# Run AFTER the VM is up + on the tailnet (via deploy/provision-wa-instance.sh).
# Needs: gh (authenticated) + the VM reachable by its tailnet name.
#
# Usage:  ./add-wa-shard.sh cybercontrol-wa-3
set -e
HOST="$1"
REPO="yashaswikaahuja/wa-drive"
[ -z "$HOST" ] && { echo "usage: $0 <vm-tailnet-name, e.g. cybercontrol-wa-3>"; exit 1; }

# 1. add the VM to the shard pool the backend routes over (append if not already present)
CUR=$(gh api "repos/$REPO/actions/variables/WA_INSTANCES" --jq .value 2>/dev/null || echo "")
case ",$CUR," in
  *",$HOST,"*) NEW="$CUR"; echo "$HOST already in WA_INSTANCES";;
  *)           NEW="${CUR:+$CUR,}$HOST";;
esac
gh variable set WA_INSTANCES -R "$REPO" --body "$NEW"
echo "WA_INSTANCES = $NEW"

# 2. Apply private DNS / MagicDNS contract on the new host (#299) before app deploy.
#    Same contract used for backend/extension/any future service VM.
#    Requires DEPLOY SSH from this machine (same key CD uses) OR run apply script on the VM once.
if command -v ssh >/dev/null && [ -n "${DEPLOY_SSH_USER:-}" ] && [ -f "${DEPLOY_SSH_KEY:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  scp -o StrictHostKeyChecking=accept-new -i "$DEPLOY_SSH_KEY" \
    "$SCRIPT_DIR/cc-ensure-resolved-stub.sh" \
    "$SCRIPT_DIR/cc-ensure-resolved-stub.service" \
    "$SCRIPT_DIR/apply-private-dns-contract.sh" \
    "$SCRIPT_DIR/check-service-connectivity.sh" \
    "$DEPLOY_SSH_USER@$HOST:/tmp/"
  ssh -o StrictHostKeyChecking=accept-new -i "$DEPLOY_SSH_KEY" "$DEPLOY_SSH_USER@$HOST" \
    "sudo bash -c 'cp /tmp/cc-ensure-resolved-stub.sh /usr/local/sbin/; chmod 0755 /usr/local/sbin/cc-ensure-resolved-stub.sh; cp /tmp/cc-ensure-resolved-stub.service /etc/systemd/system/; mkdir -p /opt/cybercontrol-docker/scripts; cp /tmp/apply-private-dns-contract.sh /tmp/check-service-connectivity.sh /opt/cybercontrol-docker/scripts/; chmod 0755 /opt/cybercontrol-docker/scripts/*.sh; LOGICAL_INSTANCE_ID=$HOST bash /opt/cybercontrol-docker/scripts/apply-private-dns-contract.sh; bash /opt/cybercontrol-docker/scripts/check-service-connectivity.sh'"
  echo "applied private DNS contract on $HOST"
else
  echo "WARN: skip remote DNS contract (set DEPLOY_SSH_USER + DEPLOY_SSH_KEY to auto-apply); ensure provision script installed resolved stub"
fi

# 3. deploy the whatsapp-service onto the new VM (generic target; WA_INSTANCE_NAME = host)
gh workflow run deploy.yml -R "$REPO" -f target=whatsapp-instance -f wa_host="$HOST"
echo "triggered: deploy whatsapp-service -> $HOST"

# 4. re-deploy the backend so it picks up the enlarged pool
echo "waiting 60s before backend redeploy..."
sleep 60
gh workflow run deploy.yml -R "$REPO" -f target=backend
echo "triggered: backend redeploy (now routes to $HOST too)"
echo "done. watch: gh run list --workflow=deploy.yml -R $REPO"
echo "also: gh workflow run service-connectivity.yml -R $REPO"
