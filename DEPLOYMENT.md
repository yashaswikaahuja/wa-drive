# Deployment Guide - CyberControl WhatsApp Inbox

## Overview
Guide for deploying the WhatsApp Inbox feature to a production environment.

## Pre-Deployment Checklist

- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Database migrations completed
- [ ] SSL certificates obtained
- [ ] Backups configured
- [ ] Monitoring set up
- [ ] Error logging configured
- [ ] CORS settings verified

---

## Production Environment Setup

### 1. Server Requirements

**Minimum Specs**
- CPU: 2 cores (4+ recommended)
- RAM: 2GB (4GB+ recommended)
- Storage: 20GB (for file uploads)
- Bandwidth: Depends on usage

**Recommended Services**
- Node.js 20 LTS
- PostgreSQL 14+
- Redis (for session management)
- Nginx (reverse proxy)
- PM2 (process manager)

---

### 2. Backend Deployment

#### Option A: Docker

**Dockerfile**
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

**Build and Run**
```bash
docker build -t cybercontrol-backend .
docker run -p 3000:3000 \
  -e PORT=3000 \
  -e DB_HOST=db \
  -e DB_USER=postgres \
  -e DB_PASSWORD=secure_password \
  -v uploads:/app/uploads \
  cybercontrol-backend
```

#### Option B: PM2

**pm2.config.js**
```javascript
module.exports = {
  apps: [
    {
      name: 'cybercontrol-backend',
      script: './dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
```

**Start**
```bash
npm run build
pm2 start pm2.config.js
pm2 save
pm2 startup
```

#### Option C: Systemd Service

**/etc/systemd/system/cybercontrol-backend.service**
```ini
[Unit]
Description=CyberControl Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/cybercontrol/backend
ExecStart=/usr/bin/node /opt/cybercontrol/backend/dist/server.js
Restart=always
RestartSec=10
Environment="NODE_ENV=production"
Environment="PORT=3000"

[Install]
WantedBy=multi-user.target
```

**Enable and Start**
```bash
sudo systemctl daemon-reload
sudo systemctl enable cybercontrol-backend
sudo systemctl start cybercontrol-backend
```

---

### 3. Frontend Deployment

#### Option A: Static Hosting (Recommended)

**Build**
```bash
npm run build
```

**Deploy to**
- Vercel: `vercel deploy`
- Netlify: `netlify deploy --prod`
- AWS S3 + CloudFront
- GitHub Pages

**.env.production**
```
VITE_API_URL=https://api.cybercontrol.com/api
VITE_SOCKET_URL=https://api.cybercontrol.com
```

**Nginx Config**
```nginx
server {
    listen 80;
    server_name app.cybercontrol.com;
    
    root /var/www/cybercontrol-frontend/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://backend:3000;
    }
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}
```

#### Option B: Docker

**Dockerfile**
```dockerfile
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

### 4. Database Setup (PostgreSQL)

**Create Database**
```sql
CREATE DATABASE cybercontrol;
CREATE USER cybercontrol_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE cybercontrol TO cybercontrol_user;
```

**Run Migrations**
```sql
-- From backend/db.sql or migrations directory
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  whatsapp VARCHAR(20) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customers_whatsapp ON customers(whatsapp);
CREATE INDEX idx_files_customer_id ON files(customer_id);
CREATE INDEX idx_files_type ON files(type);
```

**Backup Strategy**
```bash
# Daily backup
0 2 * * * pg_dump -U cybercontrol_user cybercontrol | gzip > /backups/cybercontrol_$(date +%Y%m%d).sql.gz

# Keep last 30 days
find /backups -name "cybercontrol_*.sql.gz" -mtime +30 -delete
```

---

### 5. SSL/HTTPS Configuration

**Using Let's Encrypt**
```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --nginx -d api.cybercontrol.com

# Auto-renew
sudo certbot renew --dry-run
```

**Nginx SSL Config**
```nginx
server {
    listen 443 ssl http2;
    server_name api.cybercontrol.com;
    
    ssl_certificate /etc/letsencrypt/live/api.cybercontrol.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.cybercontrol.com/privkey.pem;
    
    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

### 6. Environment Variables

**Production .env**
```env
# Server
NODE_ENV=production
PORT=3000

# Database
DB_HOST=db.example.com
DB_PORT=5432
DB_NAME=cybercontrol
DB_USER=cybercontrol_user
DB_PASSWORD=very_secure_password

# WhatsApp
WHATSAPP_CLIENT_ID=cybercafe_main_prod
WHATSAPP_SESSIONS_DIR=/data/whatsapp_sessions

# File Upload
UPLOAD_DIR=/data/uploads
MAX_FILE_SIZE=50000000

# Security
JWT_SECRET=your_jwt_secret_key_here
CORS_ORIGIN=https://app.cybercontrol.com

# Redis (optional)
REDIS_URL=redis://redis:6379

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

---

### 7. Monitoring & Logging

**PM2 Monitoring**
```bash
pm2 monit
pm2 logs cybercontrol-backend
```

**Docker Logging**
```bash
docker logs -f container_name
```

**Systemd Logging**
```bash
journalctl -u cybercontrol-backend -f
```

**Application Logging (Add to server.ts)**
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

---

### 8. Performance Optimization

**Database Optimization**
```sql
-- Add indexes
CREATE INDEX idx_files_timestamp ON files(timestamp DESC);
CREATE INDEX idx_files_customer_type ON files(customer_id, type);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM files WHERE type = 'whatsapp_image';
```

**File Upload Optimization**
```typescript
// Compress images
import sharp from 'sharp';

export async function compressImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}
```

**Socket.IO Optimization**
```typescript
// Use namespaces and rooms
io.of('/whatsapp').on('connection', (socket) => {
  socket.join('inbox');
  
  io.of('/whatsapp').to('inbox').emit('new_whatsapp_file', file);
});
```

---

### 9. Scaling Considerations

**Horizontal Scaling**
1. Run multiple backend instances behind load balancer
2. Use Redis for session persistence
3. Configure Socket.IO with Redis adapter
4. Store files in S3 or object storage

**Redis Adapter Setup**
```typescript
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ host: 'redis', port: 6379 });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

---

### 10. Disaster Recovery

**Automated Backups**
- Database: Daily incremental, weekly full
- File uploads: Daily to S3
- Config files: Version controlled in Git

**Recovery Procedure**
```bash
# Restore database
pg_restore -U cybercontrol_user -d cybercontrol backup.sql

# Restore files from S3
aws s3 sync s3://cybercontrol-backups/uploads ./uploads

# Restart services
systemctl restart cybercontrol-backend
```

---

### 11. Security Checklist

- [ ] HTTPS/SSL enabled
- [ ] Firewall rules configured
- [ ] Strong database password
- [ ] JWT secrets rotated
- [ ] CORS properly configured
- [ ] Rate limiting enabled
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS protection headers
- [ ] Regular security updates
- [ ] Access logs monitored
- [ ] Sensitive data not logged

---

### 12. Health Checks

**Add Health Check Endpoint**
```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    database: isDatabaseConnected ? 'ok' : 'error',
    whatsapp: whatsappService.getStatus() ? 'ok' : 'error'
  });
});
```

**Kubernetes Health Probe**
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30
  
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

---

### 13. Deployment Commands

**Development to Production**
```bash
# On local machine
git add .
git commit -m "Release v1.0.0"
git tag v1.0.0
git push origin main --tags

# On production server
git pull origin main
npm install
npm run build
pm2 restart cybercontrol-backend
npm run migrate:prod
```

---

## Troubleshooting

### Service Won't Start
```bash
pm2 logs cybercontrol-backend
journalctl -u cybercontrol-backend -n 50
```

### Database Connection Issues
```bash
psql -h db.example.com -U cybercontrol_user -d cybercontrol -c "SELECT 1"
```

### Socket.IO Connection Failed
- Check firewall rules (port 3000)
- Verify CORS settings
- Check proxy configuration

### High Memory Usage
- Check for file leaks: `pm2 monit`
- Restart service: `pm2 restart cybercontrol-backend`
- Increase available memory

---

## Support & Rollback

**Quick Rollback**
```bash
git revert HEAD
npm run build
pm2 restart cybercontrol-backend
```

For emergency support, check logs and refer to troubleshooting section.
