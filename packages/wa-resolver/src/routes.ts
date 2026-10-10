import type { Express, NextFunction, Request, Response } from 'express';
import wwebjs from 'whatsapp-web.js';
import type { ResolverConfig } from './config.js';
import type { ResolverClient } from './client.js';

const { MessageMedia } = wwebjs as {
  MessageMedia: new (type: string, data: string, filename: string) => unknown;
};

type ResolverApi = {
  getContactLidAndPhone: (jids: string[]) => Promise<Array<{ pn?: string } | undefined>>;
  getContactById: (id: string) => Promise<{
    isMyContact?: boolean;
    name?: string;
    pushname?: string;
    getProfilePicUrl: () => Promise<string | undefined>;
  }>;
  getNumberId: (digits: string) => Promise<{ _serialized: string } | null>;
  sendMessage: (to: string, content: unknown, opts?: object) => Promise<unknown>;
};

export function registerRoutes(
  app: Express,
  {
    config,
    resolver,
  }: {
    config: ResolverConfig;
    resolver: ResolverClient;
  },
) {
  const { SECRET } = config;
  const { getClient, isReady, getQr } = resolver;

  function auth(req: Request, res: Response, next: NextFunction) {
    if (req.headers['x-service-secret'] !== SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  app.get('/resolve', auth, async (req, res) => {
    const { lid } = req.query;
    if (!lid || typeof lid !== 'string') return res.status(400).json({ error: 'lid required' });
    if (!isReady()) return res.status(503).json({ error: 'Not connected' });

    try {
      const client = getClient() as ResolverApi;
      const lidJid = lid.includes('@') ? lid : `${lid}@lid`;
      const results = await client.getContactLidAndPhone([lidJid]);
      const result = results?.[0];
      const phone = result?.pn?.replace('@c.us', '').replace('@s.whatsapp.net', '') || null;

      let dpUrl: string | null = null;
      let savedName: string | null = null;
      let pushname: string | null = null;
      let isMyContact = false;
      try {
        const contact = await client.getContactById(phone ? `${phone}@c.us` : lidJid);
        isMyContact = !!contact?.isMyContact;
        // `name` = address-book entry; `pushname` = their WhatsApp display name.
        savedName = contact?.name || null;
        pushname = contact?.pushname || null;
        try {
          dpUrl = (await contact.getProfilePicUrl()) || null;
        } catch {
          /* privacy */
        }
      } catch {
        /* ignore enrichment failures */
      }

      res.json({
        lid,
        phone,
        // Back-compat: `name` prefers saved contact-list name only.
        name: savedName || null,
        savedName,
        pushname,
        isMyContact,
        dpUrl,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Resolver] Error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/resolve-bulk', auth, async (req, res) => {
    const { lids } = req.body as { lids?: string[] };
    if (!lids?.length) return res.status(400).json({ error: 'lids array required' });
    if (!isReady()) return res.status(503).json({ error: 'Not connected' });

    try {
      const client = getClient() as ResolverApi;
      const lidJids = lids.map((l) => (l.includes('@') ? l : `${l}@lid`));
      const results = await client.getContactLidAndPhone(lidJids);
      const resolved = lids.map((lid, i) => {
        const r = results?.[i];
        return {
          lid,
          phone: r?.pn?.replace('@c.us', '').replace('@s.whatsapp.net', '') || null,
        };
      });
      res.json({ resolved });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: msg });
    }
  });

  app.get('/dp', auth, async (req, res) => {
    const { phone } = req.query;
    if (!phone || typeof phone !== 'string') return res.status(400).json({ error: 'phone required' });
    if (!isReady()) return res.status(503).json({ error: 'Not connected' });

    try {
      const contact = await (getClient() as ResolverApi).getContactById(`${phone}@c.us`);
      const dpUrl = await contact.getProfilePicUrl();
      const name = contact?.name || contact?.pushname || null;
      res.json({ phone, name, dpUrl: dpUrl || null });
    } catch {
      res.json({ phone, name: null, dpUrl: null });
    }
  });

  app.get('/contact', auth, async (req, res) => {
    const { phone } = req.query;
    if (!phone || typeof phone !== 'string') return res.status(400).json({ error: 'phone required' });
    if (!isReady()) return res.status(503).json({ error: 'Not connected' });

    try {
      const contact = await (getClient() as ResolverApi).getContactById(`${phone}@c.us`);
      const isMyContact = !!contact?.isMyContact;
      // Address-book name only — never fall back to pushname here.
      const savedName = contact?.name || null;
      const pushname = contact?.pushname || null;
      let dpUrl: string | null = null;
      try {
        dpUrl = (await contact.getProfilePicUrl()) || null;
      } catch {
        /* privacy / not available */
      }
      res.json({
        phone,
        name: savedName,
        savedName,
        pushname,
        dpUrl,
        isMyContact,
      });
    } catch {
      res.json({ phone, name: null, savedName: null, pushname: null, dpUrl: null, isMyContact: false });
    }
  });

  app.post('/send', auth, async (req, res) => {
    const { phone, message, media, caption } = (req.body || {}) as {
      phone?: string;
      message?: string;
      media?: string;
      caption?: string;
    };
    if (!phone || (!message && !media)) {
      return res.status(400).json({ error: 'phone and message or media required' });
    }
    if (!isReady()) return res.status(503).json({ error: 'Not connected' });
    try {
      const digits = String(phone).replace(/[^0-9]/g, '');
      if (digits.length < 10) return res.status(400).json({ error: 'invalid phone' });
      const client = getClient() as ResolverApi;
      const numberId = await client.getNumberId(digits);
      if (!numberId) return res.status(422).json({ error: 'number not on WhatsApp' });
      if (media) {
        const m = new MessageMedia('image/png', media, 'cybercontrol.png');
        await client.sendMessage(numberId._serialized, m, caption ? { caption } : {});
      } else {
        await client.sendMessage(numberId._serialized, message);
      }
      res.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Resolver] send error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok', connected: isReady() }));
  app.get('/qr', auth, (_req, res) => res.json({ qr: getQr() }));

  app.get('/qr-page', (req, res) => {
    if (req.query.secret !== SECRET) return res.status(401).send('unauthorized');
    if (isReady()) return res.send('<h2>✓ Resolver is already connected — no QR needed.</h2>');
    const currentQr = getQr();
    if (!currentQr) {
      return res.send(
        '<h2>QR not yet generated. Refresh in a few seconds.</h2><script>setTimeout(()=>location.reload(),3000)</script>',
      );
    }
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(currentQr)}`;
    res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Resolver QR</title>
<meta http-equiv="refresh" content="20">
<style>body{font-family:system-ui;text-align:center;padding:40px;background:#0d1220;color:#fff}img{background:#fff;padding:12px;border-radius:8px}h1{font-size:18px}p{color:#aaa;font-size:13px}</style>
</head><body>
<h1>Scan with WhatsApp to connect Resolver</h1>
<img src="${qrUrl}" alt="QR">
<p>This QR auto-refreshes every 20 seconds.<br>Once scanned, you'll see "✓ Connected" on next reload.</p>
</body></html>`);
  });
}
