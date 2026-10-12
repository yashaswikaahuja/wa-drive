// whatsapp-web.js is CJS — use default import under ESM.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import wwebjs from 'whatsapp-web.js';
import fs from 'node:fs';
import path from 'node:path';

type WwebClient = {
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  initialize: () => Promise<void>;
  destroy: () => Promise<void>;
  pupBrowser?: { close?: () => Promise<void> } | null;
};

const { Client, LocalAuth } = wwebjs as {
  Client: new (opts: object) => WwebClient;
  LocalAuth: new (opts: { dataPath: string }) => unknown;
};

export interface ResolverClient {
  initClient: () => void;
  getClient: () => unknown;
  isReady: () => boolean;
  getQr: () => string | null;
}

const INIT_BACKOFF_MS = [10_000, 20_000, 40_000, 60_000, 120_000];

/** Stale Chromium profile locks left after crash/restart block relaunch. */
function clearChromiumProfileLocks(sessionPath: string): void {
  const roots = [sessionPath, path.join(sessionPath, 'session')];
  const lockNames = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  for (const root of roots) {
    for (const name of lockNames) {
      const full = path.join(root, name);
      try {
        if (fs.existsSync(full)) {
          fs.unlinkSync(full);
          console.log(`[Resolver] Removed stale ${name} under ${root}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[Resolver] Could not remove ${full}:`, msg);
      }
    }
    // LocalAuth nests under session/<clientId>/ — walk one level for locks.
    try {
      if (!fs.existsSync(root)) continue;
      for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        for (const name of lockNames) {
          const full = path.join(root, ent.name, name);
          try {
            if (fs.existsSync(full)) {
              fs.unlinkSync(full);
              console.log(`[Resolver] Removed stale ${name} under ${path.join(root, ent.name)}`);
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Singleton wwebjs client lifecycle for the resolver oracle.
 */
export function createResolverClient({
  sessionPath = './session',
}: { sessionPath?: string } = {}): ResolverClient {
  let client: WwebClient | null = null;
  let ready = false;
  let currentQr: string | null = null;
  let initAttempt = 0;
  let initTimer: ReturnType<typeof setTimeout> | null = null;
  let initializing = false;

  function puppeteerOptions() {
    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      process.env.CHROME_PATH ||
      undefined;

    // Do NOT use --single-process or --no-zygote in Docker: they interact badly
    // with Debian chromium + crashpad and exhaust the container process table
    // when initialize() is retried without destroy().
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--mute-audio',
      '--disable-features=TranslateUI',
      '--disable-crash-reporter',
      '--disable-breakpad',
    ];

    return {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args,
    };
  }

  function createClientInstance(): WwebClient {
    return new Client({
      authStrategy: new LocalAuth({ dataPath: sessionPath }),
      puppeteer: puppeteerOptions(),
    });
  }

  async function destroyClient(): Promise<void> {
    const prev = client;
    client = null;
    ready = false;
    currentQr = null;
    if (!prev) return;
    try {
      await prev.destroy();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[Resolver] destroy() failed:', msg);
      try {
        await prev.pupBrowser?.close?.();
      } catch {
        /* ignore */
      }
    }
  }

  function scheduleInit(delayMs: number) {
    if (initTimer) clearTimeout(initTimer);
    initTimer = setTimeout(() => {
      initTimer = null;
      void initClient();
    }, delayMs);
  }

  async function initClient() {
    if (initializing) return;
    initializing = true;
    try {
      if (initTimer) {
        clearTimeout(initTimer);
        initTimer = null;
      }

      await destroyClient();
      clearChromiumProfileLocks(sessionPath);

      client = createClientInstance();

      client.on('qr', (qr) => {
        currentQr = String(qr ?? '');
        initAttempt = 0;
        console.log('[Resolver] QR generated — scan to connect');
      });

      client.on('ready', () => {
        ready = true;
        currentQr = null;
        initAttempt = 0;
        console.log('[Resolver] WhatsApp connected ✅');
      });

      client.on('authenticated', () => {
        console.log('[Resolver] Authenticated');
      });

      client.on('auth_failure', (msg) => {
        ready = false;
        currentQr = null;
        console.error('[Resolver] Auth failure:', msg);
        // Corrupt LocalAuth — wipe locks and retry after backoff; operator may
        // need to clear the volume if this loops.
        scheduleInit(INIT_BACKOFF_MS[Math.min(initAttempt, INIT_BACKOFF_MS.length - 1)]);
      });

      client.on('disconnected', (reason) => {
        ready = false;
        console.log('[Resolver] Disconnected:', reason);
        scheduleInit(5_000);
      });

      await client.initialize();
      initAttempt = 0;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Resolver] Init failed:', msg);
      await destroyClient();
      clearChromiumProfileLocks(sessionPath);
      const delay = INIT_BACKOFF_MS[Math.min(initAttempt, INIT_BACKOFF_MS.length - 1)];
      initAttempt += 1;
      console.log(`[Resolver] Retrying init in ${delay / 1000}s (attempt ${initAttempt})`);
      scheduleInit(delay);
    } finally {
      initializing = false;
    }
  }

  return {
    initClient: () => {
      void initClient();
    },
    getClient: () => client,
    isReady: () => ready,
    getQr: () => currentQr,
  };
}
