#!/bin/bash
# === CyberControl WhatsApp - GCP #2 Setup ===
# Run this on a fresh GCP e2-micro (Ubuntu 22.04)

set -e

echo "=== Installing Node.js 20 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "=== Installing Chromium dependencies ==="
sudo apt-get install -y \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
  fonts-liberation chromium-browser

echo "=== Installing PM2 ==="
sudo npm install -g pm2

echo "=== Setting up app directory ==="
sudo mkdir -p /opt/whatsapp
cd /opt/whatsapp

# Clone just the whatsapp folders
git clone --depth 1 https://github.com/yashaswikaahuja/wa-drive.git /tmp/wa-drive
sudo cp -r /tmp/wa-drive/whatsapp-service /opt/whatsapp/service
sudo cp -r /tmp/wa-drive/whatsapp-resolver /opt/whatsapp/resolver
rm -rf /tmp/wa-drive

echo "=== Installing dependencies ==="
cd /opt/whatsapp/service && npm install
cd /opt/whatsapp/resolver && npm install

echo "=== Creating .env files ==="
cat > /opt/whatsapp/service/.env << 'EOF'
WA_PORT=3100
PARENT_URL=https://api.cybercontrol.fun
SERVICE_SECRET=wa-service-secret-2024
AUTH_DIR=./sessions
RESOLVER_URL=http://localhost:3200
EOF

cat > /opt/whatsapp/resolver/.env << 'EOF'
PORT=3200
SERVICE_SECRET=wa-service-secret-2024
EOF

echo "=== Starting services with PM2 ==="
cd /opt/whatsapp/resolver && pm2 start index.js --name whatsapp-resolver
cd /opt/whatsapp/service && pm2 start index.js --name whatsapp-service
pm2 save
pm2 startup | tail -1 | sudo bash

echo "=== Opening firewall ==="
# Allow parent backend to reach this instance
sudo ufw allow 3100/tcp 2>/dev/null || true
sudo ufw allow 3200/tcp 2>/dev/null || true

echo ""
echo "=== DONE ==="
echo "WhatsApp Service: http://$(curl -s ifconfig.me):3100"
echo "Resolver: http://$(curl -s ifconfig.me):3200"
echo ""
echo "NEXT STEPS:"
echo "1. Open GCP firewall for ports 3100, 3200"
echo "2. Scan QR for resolver: curl http://localhost:3200/qr -H 'x-service-secret: wa-service-secret-2024'"
echo "3. Update parent backend WA_SERVICE to point to this IP"
