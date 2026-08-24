import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Host on 0.0.0.0 so the dev/preview server is reachable over the tailnet from other devices.
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5180 },
  preview: { host: true, port: 5180 },
});
