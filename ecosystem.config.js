require('dotenv').config({ path: __dirname + '/.env' });
module.exports = {
  apps: [{
    name: 'cybercontrol-hub',
    script: '/opt/cybercontrol-hub/backend/dist/server.js',
    env: {
      PORT: process.env.PORT || 3000,
      WORKER_SECRET: process.env.WORKER_SECRET,
      PUBLIC_URL: process.env.PUBLIC_URL,
      REMOVE_BG_API_KEY: process.env.REMOVE_BG_API_KEY,
      APP_DIR: process.env.APP_DIR || '/opt/cybercontrol-hub',
    }
  }]
};
