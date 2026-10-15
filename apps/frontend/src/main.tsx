import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import './globals.css';

const rootEl = document.getElementById('root');

ReactDOM.createRoot(rootEl!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId='62092486976-jhsn62q3ufj4dvr42c1hpubnujasaqok.apps.googleusercontent.com'>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);

// Signal the index.html boot watchdog that the module ran (React replaced #cc-boot).
if (rootEl) rootEl.dataset.booted = '1';

// Kill stale service workers / Cache API shells that leave phone Chrome on a white screen
// after deploys (old index.html pointing at deleted /assets/*.js hashes).
async function clearStaleClientCaches() {
  try {
    if ('serviceWorker' in navigator) {
      // Register the self-destructing SW so activate clears Cache Storage, then unregisters.
      await navigator.serviceWorker.register('/sw.js').catch(() => {});
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
  } catch { /* private mode */ }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }
}
void clearStaleClientCaches();
