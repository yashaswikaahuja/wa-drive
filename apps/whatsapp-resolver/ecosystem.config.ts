module.exports = {
  apps: [{
    name: 'whatsapp-resolver',
    script: 'index.js',
    env: {
      PORT: 3200,
      SERVICE_SECRET: 'wa-service-secret-2024'
    }
  }]
};
