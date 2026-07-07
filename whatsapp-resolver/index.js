const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');

const PORT = process.env.PORT || 3200;
const SECRET = process.env.SERVICE_SECRET || 'wa-service-secret-2024';

const app = express();
app.use(express.json());

let client = null;
let ready = false;
let currentQr = null;

// Auth middleware
function auth(req, res, next) {
  if (req.headers['x-service-secret'] !== SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Initialize wwebjs client
function initClient() {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './session' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--disable-gpu', '--single-process']
    }
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

  client.initialize().catch(e => {
    console.error('[Resolver] Init failed:', e.message);
    setTimeout(initClient, 10000);
  });
}

// Resolve LID → phone + saved name + DP
app.get('/resolve', auth, async (req, res) => {
  const { lid } = req.query;
  if (!lid) return res.status(400).json({ error: 'lid required' });
  if (!ready) return res.status(503).json({ error: 'Not connected' });

  try {
    const lidJid = lid.includes('@') ? lid : `${lid}@lid`;
    const results = await client.getContactLidAndPhone([lidJid]);
    const result = results?.[0];
    const phone = result?.pn?.replace('@c.us', '').replace('@s.whatsapp.net', '') || null;

    let dpUrl = null;
    let name = null;
    try {
      const contact = await client.getContactById(phone ? `${phone}@c.us` : lidJid);
      // Saved contact name from operator's phone book (preferred)
      // Falls back to push name (whatever the sender set as their WA display name)
      name = contact?.name || contact?.pushname || null;
      dpUrl = await contact.getProfilePicUrl();
    } catch {}

    res.json({ lid, phone, name, dpUrl });
  } catch (e) {
    console.error('[Resolver] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Bulk resolve
app.post('/resolve-bulk', auth, async (req, res) => {
  const { lids } = req.body;
  if (!lids?.length) return res.status(400).json({ error: 'lids array required' });
  if (!ready) return res.status(503).json({ error: 'Not connected' });

  try {
    const lidJids = lids.map(l => l.includes('@') ? l : `${l}@lid`);
    const results = await client.getContactLidAndPhone(lidJids);
    const resolved = lids.map((lid, i) => {
      const r = results?.[i];
      return { lid, phone: r?.pn?.replace('@c.us', '').replace('@s.whatsapp.net', '') || null };
    });
    res.json({ resolved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get DP + saved name by phone
app.get('/dp', auth, async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  if (!ready) return res.status(503).json({ error: 'Not connected' });

  try {
    const contact = await client.getContactById(`${phone}@c.us`);
    const dpUrl = await contact.getProfilePicUrl();
    const name = contact?.name || contact?.pushname || null;
    res.json({ phone, name, dpUrl: dpUrl || null });
  } catch (e) {
    res.json({ phone, name: null, dpUrl: null });
  }
});

// Get saved contact name by phone (cheap call — no DP fetch)
app.get('/contact', auth, async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  if (!ready) return res.status(503).json({ error: 'Not connected' });

  try {
    const contact = await client.getContactById(`${phone}@c.us`);
    const name = contact?.name || contact?.pushname || null;
    res.json({ phone, name });
  } catch (e) {
    res.json({ phone, name: null });
  }
});

// Send a WhatsApp message (used for signup OTPs — the resolver is the always-on system sender).
// Body: { phone, message?, media?, caption? }
//   • media present (base64 PNG, no data: prefix) → sends an image with an optional caption
//   • else → sends `message` as text
app.post('/send', auth, async (req, res) => {
  const { phone, message, media, caption } = req.body || {};
  if (!phone || (!message && !media)) return res.status(400).json({ error: 'phone and message or media required' });
  if (!ready) return res.status(503).json({ error: 'Not connected' });
  try {
    const digits = String(phone).replace(/[^0-9]/g, '');
    if (digits.length < 10) return res.status(400).json({ error: 'invalid phone' });
    // Resolve to the real WhatsApp id (handles LID addressing on newer WA; avoids "No LID for it").
    // getNumberId returns null if the number isn't on WhatsApp.
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
    console.error('[Resolver] send error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (_, res) => res.json({ status: 'ok', connected: ready }));
app.get('/qr', auth, (_, res) => res.json({ qr: currentQr }));

// Browser-friendly page to scan the resolver QR
app.get('/qr-page', (req, res) => {
  if (req.query.secret !== SECRET) return res.status(401).send('unauthorized');
  if (ready) return res.send('<h2>✓ Resolver is already connected — no QR needed.</h2>');
  if (!currentQr) return res.send('<h2>QR not yet generated. Refresh in a few seconds.</h2><script>setTimeout(()=>location.reload(),3000)</script>');
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

app.listen(PORT, () => {
  console.log(`[Resolver] Running on port ${PORT}`);
  initClient();
});
