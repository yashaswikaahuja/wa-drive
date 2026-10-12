// whatsapp-web.js is CJS — use default import under ESM.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import wwebjs from 'whatsapp-web.js';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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
const LOCK_NAMES = new Set(['SingletonLock', 'SingletonCookie', 'SingletonSocket']);

/**
 * Chromium Singleton* entries are often dangling symlinks after a container
 * restart. fs.existsSync follows the target and returns false, so we must
 * lstat/rm without that check.
 */
function clearChromiumProfileLocks(sessionPath: string): void {
  const absRoot = path.resolve(sessionPath);

  function unlinkLock(full: string): void {
    try {
      fs.lstatSync(full);
    } catch {
      return;
    }
    try {
      fs.rmSync(full, { force: true });
      console.log(`[Resolver] Removed stale ${path.basename(full)} at ${full}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[Resolver] Could not remove ${full}:`, msg);
    }
  }

  function walk(dir: string, depth: number): void {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (LOCK_NAMES.has(ent.name)) {
        unlinkLock(full);
        continue;
      }
      if (ent.isDirectory()) walk(full, depth + 1);
    }
  }

  walk(absRoot, 0);
}

/** Kill leftover Chromium from a failed initialize() that never bound pupBrowser. */
async function killOrphanChromium(): Promise<void> {
  try {
    await execFileAsync('pkill', ['-9', '-f', '/usr/lib/chromium/chromium'], {
      timeout: 5_000,
    });
    console.log('[Resolver] Killed orphan chromium processes');
  } catch (e: unknown) {
    // pkill exits 1 when nothing matched — that is fine.
    const code =
      e && typeof e === 'object' && 'code' in e ? (e as { code?: number }).code : undefined;
    if (code !== 1) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[Resolver] pkill chromium:', msg);
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
    if (prev) {
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
    await killOrphanChromium();
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
        const delay = INIT_BACKOFF_MS[Math.min(initAttempt, INIT_BACKOFF_MS.length - 1)];
        initAttempt += 1;
        scheduleInit(delay);
      });

      client.on('disconnected', (reason) => {
        ready = false;
        console.log('[Resolver] Disconnected:', reason);
        // Only auto-reinit when idle; overlapping initClient is gated by `initializing`.
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
