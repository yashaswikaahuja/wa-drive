const { Client, LocalAuth } = require('whatsapp-web.js');
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

app.get('/health', (_, res) => res.json({ status: 'ok', connected: ready }));
app.get('/qr', auth, (_, res) => res.json({ qr: currentQr }));

app.listen(PORT, () => {
  console.log(`[Resolver] Running on port ${PORT}`);
  initClient();
});
