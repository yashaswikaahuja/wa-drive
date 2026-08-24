// whatsapp-web.js is CJS — use default import under ESM.
import wwebjs from 'whatsapp-web.js';
const { Client, LocalAuth } = wwebjs;

/**
 * Singleton wwebjs client lifecycle for the resolver oracle.
 */
export function createResolverClient({ sessionPath = './session' } = {}) {
  let client = null;
  let ready = false;
  let currentQr = null;

  function initClient() {
    client = new Client({
      authStrategy: new LocalAuth({ dataPath: sessionPath }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--single-process',
        ],
      },
    });

    client.on('qr', (qr) => {
      currentQr = qr;
      console.log('[Resolver] QR generated — scan to connect');
    });

    client.on('ready', () => {
      ready = true;
      currentQr = null;
      console.log('[Resolver] WhatsApp connected ✅');
    });

    client.on('disconnected', (reason) => {
      ready = false;
      console.log('[Resolver] Disconnected:', reason);
      setTimeout(initClient, 5000);
    });

    client.initialize().catch((e) => {
      console.error('[Resolver] Init failed:', e.message);
      setTimeout(initClient, 10000);
    });
  }

  return {
    initClient,
    getClient: () => client,
    isReady: () => ready,
    getQr: () => currentQr,
  };
}
