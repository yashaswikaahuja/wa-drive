module.exports = {
  apps: [
    {
      name: 'cybercontrol-hub',
      script: '/opt/cybercontrol-hub/backend/dist/server.js',
      cwd: '/opt/cybercontrol-hub/backend',
      interpreter: 'node',
      interpreter_args: '--max-old-space-size=256',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      // Restart if process exceeds 300MB RSS
      max_memory_restart: '300M',
      // Wait 5s before restarting after a crash
      restart_delay: 5000,
      // Stop restarting after 10 crashes in a row (prevents crash loop)
      max_restarts: 10,
      min_uptime: '10s',
      // Merge stdout + stderr into one log file
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '/home/bharattvv542/.pm2/logs/hub-out.log',
      error_file: '/home/bharattvv542/.pm2/logs/hub-error.log',
      // Kill timeout before SIGKILL (give app time to close connections)
      kill_timeout: 5000,
      // Don't auto-restart on intentional stop
      autorestart: true,
      watch: false,
    },
    {
      name: 'whatsapp-worker',
      script: '/opt/whatsapp-worker/worker/worker.ts',
      cwd: '/opt/whatsapp-worker/worker',
      interpreter: 'tsx',
      interpreter_args: '',
      env: {
        NODE_ENV: 'production',
        PORT: '3002',
        HUB_URL: 'http://localhost:3000',
        WORKER_SECRET: 'cybercontrol-worker-secret-2024',
      },
      max_memory_restart: '300M',
      restart_delay: 8000,
      max_restarts: 10,
      min_uptime: '15s',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '/home/bharattvv542/.pm2/logs/worker-out.log',
      error_file: '/home/bharattvv542/.pm2/logs/worker-error.log',
      kill_timeout: 8000,
      autorestart: true,
      watch: false,
    },
    {
      name: 'cloudflare-tunnel',
      script: 'cloudflared',
      args: 'tunnel --url http://localhost:3000',
      interpreter: 'none',
      max_memory_restart: '100M',
      restart_delay: 5000,
      max_restarts: 20,
      min_uptime: '5s',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '/home/bharattvv542/.pm2/logs/tunnel-out.log',
      error_file: '/home/bharattvv542/.pm2/logs/tunnel-error.log',
      autorestart: true,
      watch: false,
    },
  ],
};
