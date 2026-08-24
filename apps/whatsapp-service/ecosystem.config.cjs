module.exports = {
  apps: [{
    name: 'whatsapp-service',
    script: 'index.js',
    cwd: '/opt/whatsapp-service',
    env: {
      WA_PORT: 3100,
      PARENT_URL: 'https://api.cybercontrol.fun',
      SERVICE_SECRET: 'wa-service-secret-2024',
      AUTH_DIR: './sessions'
    }
  }]
};
