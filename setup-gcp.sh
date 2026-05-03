#!/bin/bash
# GCP e2-micro Server Setup Script
# Run once after SSH into the VM: bash setup-gcp.sh
# Safe to re-run — all steps are idempotent.

set -e
echo "=== CyberControl GCP Setup ==="

# ─────────────────────────────────────────────────────────────────────────────
# 1. SWAP MEMORY (critical for e2-micro with 1GB RAM)
# ─────────────────────────────────────────────────────────────────────────────
echo "[1/7] Setting up swap..."

if swapon --show | grep -q '/swapfile'; then
  echo "  Swap already exists — skipping"
else
  sudo fallocate -l 1G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  # Make swap permanent across reboots
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  # Reduce swap aggressiveness (only use swap when RAM is 90%+ full)
  echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
  sudo sysctl -p
  echo "  Swap enabled: $(free -h | grep Swap)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. SYSTEM PACKAGES
# ─────────────────────────────────────────────────────────────────────────────
echo "[2/7] Installing system tools..."
sudo apt-get update -qq
sudo apt-get install -y -qq htop curl ufw

# ─────────────────────────────────────────────────────────────────────────────
# 3. FIREWALL (ufw)
# ─────────────────────────────────────────────────────────────────────────────
echo "[3/7] Configuring firewall..."
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh          # port 22
sudo ufw allow 3000/tcp     # hub (internal, but allow for debugging)
sudo ufw --force enable
echo "  Firewall status:"
sudo ufw status

# ─────────────────────────────────────────────────────────────────────────────
# 4. SSH HARDENING (key-only login)
# ─────────────────────────────────────────────────────────────────────────────
echo "[4/7] Hardening SSH..."

# Only apply if authorized_keys exists (safety check)
if [ -f ~/.ssh/authorized_keys ] && [ -s ~/.ssh/authorized_keys ]; then
  sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sudo sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
  sudo sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
  sudo systemctl restart sshd
  echo "  SSH hardened: password login disabled"
else
  echo "  SKIPPED: ~/.ssh/authorized_keys not found — add your key first!"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 5. PM2 LOG ROTATION
# ─────────────────────────────────────────────────────────────────────────────
echo "[5/7] Setting up PM2 log rotation..."
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 5
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'   # rotate daily at midnight

# ─────────────────────────────────────────────────────────────────────────────
# 6. PM2 STARTUP (auto-start on reboot)
# ─────────────────────────────────────────────────────────────────────────────
echo "[6/7] Configuring PM2 startup..."
# Generate and run the startup command automatically
PM2_STARTUP=$(pm2 startup systemd -u $USER --hp $HOME | tail -1)
echo "  Running: $PM2_STARTUP"
eval "$PM2_STARTUP" || sudo env PATH=$PATH:$(which node) $(which pm2) startup systemd -u $USER --hp $HOME

# ─────────────────────────────────────────────────────────────────────────────
# 7. NODE.JS MEMORY OPTIMIZATION
# ─────────────────────────────────────────────────────────────────────────────
echo "[7/7] Optimizing Node.js..."
# Set default Node.js heap size for all processes (256MB per process)
echo 'export NODE_OPTIONS="--max-old-space-size=256"' >> ~/.bashrc

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. Copy ecosystem.config.cjs to /opt/cybercontrol-hub/"
echo "  2. Run: pm2 start /opt/cybercontrol-hub/ecosystem.config.cjs"
echo "  3. Run: pm2 save"
echo "  4. Check: pm2 list"
