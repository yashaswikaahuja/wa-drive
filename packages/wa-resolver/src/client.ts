// whatsapp-web.js is CJS — use default import under ESM.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import wwebjs from 'whatsapp-web.js';

const { Client, LocalAuth } = wwebjs as {
  Client: new (opts: object) => {
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    initialize: () => Promise<void>;
  };
  LocalAuth: new (opts: { dataPath: string }) => unknown;
};

export interface ResolverClient {
  initClient: () => void;
  getClient: () => unknown;
  isReady: () => boolean;
  getQr: () => string | null;
}

/**
 * Singleton wwebjs client lifecycle for the resolver oracle.
 */
export function createResolverClient({
  sessionPath = './session',
}: { sessionPath?: string } = {}): ResolverClient {
  let client: ReturnType<typeof createClientInstance> | null = null;
  let ready = false;
  let currentQr: string | null = null;

  function createClientInstance() {
    return new Client({
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
  }

  function initClient() {
    client = createClientInstance();

    client.on('qr', (qr) => {
      currentQr = String(qr ?? '');
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

    client.initialize().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Resolver] Init failed:', msg);
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
