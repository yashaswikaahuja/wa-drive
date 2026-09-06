import wwebjs from 'whatsapp-web.js';
const { MessageMedia } = wwebjs;

export function registerRoutes(app, { config, resolver }) {
  const { SECRET } = config;
  const { getClient, isReady, getQr } = resolver;

  function auth(req, res, next) {
    if (req.headers['x-service-secret'] !== SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  app.get('/resolve', auth, async (req, res) => {
    const { lid } = req.query;
    if (!lid) return res.status(400).json({ error: 'lid required' });
    if (!isReady()) return res.status(503).json({ error: 'Not connected' });

    try {
      const client = getClient();
      const lidJid = lid.includes('@') ? lid : `${lid}@lid`;
      const results = await client.getContactLidAndPhone([lidJid]);
      const result = results?.[0];
      const phone = result?.pn?.replace('@c.us', '').replace('@s.whatsapp.net', '') || null;

      let dpUrl = null;
      let name = null;
      try {
        const contact = await client.getContactById(phone ? `${phone}@c.us` : lidJid);
        name = contact?.name || contact?.pushname || null;
        dpUrl = await contact.getProfilePicUrl();
      } catch {
        /* ignore enrichment failures */
      }

      res.json({ lid, phone, name, dpUrl });
    } catch (e) {
      console.error('[Resolver] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/resolve-bulk', auth, async (req, res) => {
    const { lids } = req.body;
    if (!lids?.length) return res.status(400).json({ error: 'lids array required' });
    if (!isReady()) return res.status(503).json({ error: 'Not connected' });

    try {
      const client = getClient();
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
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/dp', auth, async (req, res) => {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: 'phone required' });
    if (!isReady()) return res.status(503).json({ error: 'Not connected' });

    try {
      const contact = await getClient().getContactById(`${phone}@c.us`);
      const dpUrl = await contact.getProfilePicUrl();
      const name = contact?.name || contact?.pushname || null;
      res.json({ phone, name, dpUrl: dpUrl || null });
    } catch {
      res.json({ phone, name: null, dpUrl: null });
    }
  });

  app.get('/contact', auth, async (req, res) => {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: 'phone required' });
    if (!isReady()) return res.status(503).json({ error: 'Not connected' });

    try {
      const contact = await getClient().getContactById(`${phone}@c.us`);
      // Prefer address-book name (saved contact) over WhatsApp push name / @username.
      const name = contact?.name || contact?.verifiedName || contact?.pushname || null;
      let dpUrl = null;
      try {
        dpUrl = (await contact.getProfilePicUrl()) || null;
      } catch {
        /* privacy / not available */
      }
      res.json({
        phone,
        name,
        dpUrl,
        isMyContact: !!contact?.isMyContact,
        pushname: contact?.pushname || null,
      });
    } catch {
      res.json({ phone, name: null, dpUrl: null, isMyContact: false });
    }
  });

  app.post('/send', auth, async (req, res) => {
    const { phone, message, media, caption } = req.body || {};
    if (!phone || (!message && !media)) {
      return res.status(400).json({ error: 'phone and message or media required' });
    }
    if (!isReady()) return res.status(503).json({ error: 'Not connected' });
    try {
      const digits = String(phone).replace(/[^0-9]/g, '');
      if (digits.length < 10) return res.status(400).json({ error: 'invalid phone' });
      const numberId = await getClient().getNumberId(digits);
      if (!numberId) return res.status(422).json({ error: 'number not on WhatsApp' });
      if (media) {
        const m = new MessageMedia('image/png', media, 'cybercontrol.png');
        await getClient().sendMessage(numberId._serialized, m, caption ? { caption } : {});
      } else {
        await getClient().sendMessage(numberId._serialized, message);
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('[Resolver] send error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/health', (_, res) => res.json({ status: 'ok', connected: isReady() }));
  app.get('/qr', auth, (_, res) => res.json({ qr: getQr() }));

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
