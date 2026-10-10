module.exports = {
  apps: [{
    name: 'whatsapp-service',
    script: 'index.js',
    cwd: '/opt/whatsapp-service',
    env: {
      WA_PORT: 3100,
      // Prefer PARENT_URL / API_ORIGIN / PUBLIC_DOMAIN from the host env — no baked-in company host.
      PARENT_URL: process.env.PARENT_URL || process.env.API_ORIGIN || (process.env.PUBLIC_DOMAIN ? `https://api.${String(process.env.PUBLIC_DOMAIN).replace(/^\./, '')}` : ''),
      SERVICE_SECRET: process.env.WA_SECRET || process.env.SERVICE_SECRET || 'wa-service-secret-2024',
      AUTH_DIR: './sessions'
    }
  }]
};
