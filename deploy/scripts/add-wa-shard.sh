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

# 2. deploy the whatsapp-service onto the new VM (generic target; WA_INSTANCE_NAME = host)
gh workflow run deploy.yml -R "$REPO" -f target=whatsapp-instance -f wa_host="$HOST"
echo "triggered: deploy whatsapp-service -> $HOST"

# 3. re-deploy the backend so it picks up the enlarged pool
echo "waiting 60s before backend redeploy..."
sleep 60
gh workflow run deploy.yml -R "$REPO" -f target=backend
echo "triggered: backend redeploy (now routes to $HOST too)"
echo "done. watch: gh run list --workflow=deploy.yml -R $REPO"
