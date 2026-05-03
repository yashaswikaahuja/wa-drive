# GCP + PM2 Operations Guide

> VM: `34.134.111.239` (e2-micro, 1 vCPU, 1 GB RAM)  
> SSH: `ssh -i ~/.ssh/gcp_worker bharattvv542@34.134.111.239`

---

## 1. PM2 Process Management

### View all processes
```bash
pm2 list
```

### Start processes (first time)
```bash
# Hub
cd /opt/cybercontrol-hub/backend
pm2 start dist/server.js --name cybercontrol-hub

# Worker
cd /opt/whatsapp-worker/worker
pm2 start worker.ts --interpreter tsx --name whatsapp-worker

# Cloudflare tunnel
pm2 start "cloudflared tunnel --url http://localhost:3000" --name cloudflare-tunnel
```

### Restart / Stop / Delete
```bash
pm2 restart cybercontrol-hub
pm2 restart whatsapp-worker
pm2 restart cloudflare-tunnel

pm2 stop cybercontrol-hub       # stop without removing
pm2 delete cybercontrol-hub     # remove from PM2 list
```

### Save process list + auto-start on reboot
```bash
pm2 save                        # save current process list
pm2 startup                     # prints a command — run that command as root
# Example output: sudo env PATH=... pm2 startup systemd -u bharattvv542 --hp /home/bharattvv542
# Copy and run that exact command
```

### Monitor live (CPU, RAM, logs)
```bash
pm2 monit                       # interactive dashboard
pm2 logs                        # all logs, live
pm2 logs cybercontrol-hub       # hub logs only
pm2 logs whatsapp-worker        # worker logs only
pm2 logs cloudflare-tunnel --lines 30 --nostream   # last 30 lines, no follow
```

---

## 2. Deployment Workflow

### Deploy hub (build locally, copy dist to VM)
```bash
# On your local machine:
cd backend
npm run build                   # tsc compiles to dist/
scp -r dist gcp-worker:/opt/cybercontrol-hub/backend/dist

# On VM:
ssh gcp-worker "pm2 restart cybercontrol-hub"
```

> **Why build locally?** The e2-micro has 1 GB RAM. `tsc` OOMs on the VM.

### Deploy worker
```bash
# On your local machine:
scp worker/worker.ts gcp-worker:/opt/whatsapp-worker/worker/worker.ts

# On VM:
ssh gcp-worker "pm2 restart whatsapp-worker"
```

### Safe restart sequence (avoid downtime)
```bash
# 1. Restart hub first (worker reconnects automatically)
pm2 restart cybercontrol-hub

# 2. Wait 5 seconds, then restart worker
sleep 5 && pm2 restart whatsapp-worker
```

---

## 3. Server Monitoring

### RAM and CPU
```bash
free -h                         # RAM usage summary
htop                            # interactive process viewer (q to quit)
top                             # basic process viewer
df -h                           # disk usage
```

### Detect memory leaks
```bash
# Watch RAM every 5 seconds
watch -n 5 free -h

# Check if a PM2 process is growing
pm2 monit                       # watch RSS column — should stay stable
```

### Check if processes are running
```bash
pm2 list                        # status column: online / stopped / errored
curl http://localhost:3000/api/health   # hub health check
```

---

## 4. Log Management

### Log locations
```bash
# PM2 stores logs here:
~/.pm2/logs/cybercontrol-hub-out.log    # hub stdout
~/.pm2/logs/cybercontrol-hub-error.log  # hub stderr
~/.pm2/logs/whatsapp-worker-out.log
~/.pm2/logs/whatsapp-worker-error.log
~/.pm2/logs/cloudflare-tunnel-out.log
```

### Flush logs (clear without losing process)
```bash
pm2 flush                       # clears all PM2 log files
pm2 flush cybercontrol-hub      # clear one process logs only
```

### Rotate logs automatically (install once)
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 5
pm2 set pm2-logrotate:compress true
```

### Check disk usage
```bash
df -h /                         # root partition usage
du -sh ~/.pm2/logs/             # how much space logs are using
```

---

## 5. Debugging Crashes

### See why a process crashed
```bash
pm2 logs whatsapp-worker --lines 100 --nostream
pm2 logs cybercontrol-hub --err --lines 50 --nostream
```

### Check exit codes
```bash
pm2 list                        # look at "restarts" column — high = crash loop
pm2 describe whatsapp-worker    # detailed info including last exit code
```

### Common crash causes and fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot derive from empty media key` | WhatsApp CDN not ready | Fixed: 2s pre-download delay + 5 retry attempts |
| `Input buffer contains unsupported image format` | Corrupt/empty image buffer | Fixed: Sharp validation rejects before Drive upload |
| `ENOMEM` / OOM kill | e2-micro ran out of RAM | Restart: `pm2 restart all`; check for memory leaks with `pm2 monit` |
| Worker 500 disconnect loop | Hub not running | Start hub first: `pm2 restart cybercontrol-hub` |
| `ECONNREFUSED localhost:3000` | Hub crashed | `pm2 restart cybercontrol-hub` |

### Force restart everything
```bash
pm2 restart all
```

---

## 6. Basic Security

### SSH key-only login (disable password auth)
```bash
# On VM, edit sshd config:
sudo nano /etc/ssh/sshd_config

# Set these values:
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no

# Restart SSH (you stay connected, new sessions use key only):
sudo systemctl restart sshd
```

> ⚠️ Make sure your SSH key is in `~/.ssh/authorized_keys` BEFORE disabling passwords.

### Keep system updated
```bash
sudo apt update && sudo apt upgrade -y
sudo apt autoremove -y          # remove unused packages
```

### Check open ports
```bash
sudo ss -tlnp                   # show listening TCP ports
```

---

## 7. Cloudflare Tunnel URL Changed?

```bash
# Get new URL from tunnel logs:
pm2 logs cloudflare-tunnel --lines 30 --nostream | grep trycloudflare

# Update Vercel env vars and redeploy (run locally):
cd frontend
npx vercel env rm VITE_API_URL production --yes
npx vercel env rm VITE_SOCKET_URL production --yes
echo 'https://NEW-URL.trycloudflare.com/api' | npx vercel env add VITE_API_URL production
echo 'https://NEW-URL.trycloudflare.com' | npx vercel env add VITE_SOCKET_URL production
npx vercel --prod --yes
```

---

## 8. Quick Reference Cheatsheet

```bash
# SSH into VM
ssh -i ~/.ssh/gcp_worker bharattvv542@34.134.111.239

# Check everything is running
pm2 list

# Live logs
pm2 logs

# Restart all services
pm2 restart all

# RAM check
free -h

# Disk check
df -h

# Clear logs
pm2 flush

# Save process list (run after any pm2 start/delete)
pm2 save
```
