// PM2 ecosystem — runs hub + worker + resolver on the same VM (GCP#1).
// Deploy: pm2 start ecosystem.config.cjs --env production
// All apps share the same .env via dotenv (each app loads its own).
// SECRETS: WA_SECRET must be identical across hub and worker.
module.exports = {
  apps: [
    {
      name: 'cybercontrol-hub',
      script: '/opt/cybercontrol-hub/backend/dist/index.js',
      cwd: '/opt/cybercontrol-hub/backend',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        // WA_SECRET, JWT_SECRET, DATABASE_URL, GOOGLE_*, GROQ_API_KEY come from .env
      },
      autorestart: true,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'whatsapp-service',
      script: '/opt/whatsapp/service/index.js',
      cwd: '/opt/whatsapp/service',
      env: {
        NODE_ENV: 'production',
        WA_PORT: '3100',
        // Co-located: localhost = no DNS, no TLS, no nginx
        PARENT_URL: 'http://localhost:3000',
        AUTH_DIR: '/opt/whatsapp/service/sessions',
        RESOLVER_URL: 'http://localhost:3200',
        // SERVICE_SECRET must be identical to hub's WA_SECRET
      },
      autorestart: true,
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'whatsapp-resolver',
      script: '/opt/whatsapp/resolver/index.js',
      cwd: '/opt/whatsapp/resolver',
      env: {
        NODE_ENV: 'production',
        RESOLVER_PORT: '3200',
      },
      autorestart: true,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
