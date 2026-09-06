export function registerRoutes(app, { config, sessions, startSession, stopSession }) {
  const { SERVICE_SECRET } = config;

  function authMiddleware(req, res, next) {
    const token = req.headers['x-service-secret'];
    if (token !== SERVICE_SECRET) return res.status(401).json({ error: 'Unauthorized' });
    next();
  }

  app.get('/health', (_, res) => res.json({ status: 'ok', sessions: sessions.size }));

  app.post('/sessions/start', authMiddleware, async (req, res) => {
    const { workspaceId, force } = req.body;
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
    if (force) {
      const existing = sessions.get(workspaceId);
      if (existing?.socket) {
        console.log(`[WA:${workspaceId.slice(0, 8)}] Force restart — tearing down existing socket`);
        try {
          existing.socket.end();
        } catch {
          /* ignore */
        }
      }
      sessions.delete(workspaceId);
    }
    await startSession(workspaceId);
    res.json({ ok: true, forced: !!force });
  });

  app.post('/sessions/stop', authMiddleware, async (req, res) => {
    const { workspaceId } = req.body;
    await stopSession(workspaceId);
    res.json({ ok: true });
  });

  app.get('/sessions/:workspaceId/status', authMiddleware, (req, res) => {
    const session = sessions.get(req.params.workspaceId);
    if (!session) return res.json({ connected: false, status: 'none' });
    res.json({
      connected: session.status === 'connected',
      status: session.status,
      phone: session.phone,
      qr: session.qr,
    });
  });

  app.get('/sessions/:workspaceId/qr', authMiddleware, (req, res) => {
    const session = sessions.get(req.params.workspaceId);
    res.json({ qr: session?.qr || null });
  });

  app.post('/sessions/:workspaceId/send', authMiddleware, async (req, res) => {
    const session = sessions.get(req.params.workspaceId);
    if (!session?.socket) return res.status(400).json({ error: 'Not connected' });
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
    try {
      const jid = phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      await session.socket.sendMessage(jid, { text: message });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/sessions', authMiddleware, (_, res) => {
    const list = [];
    sessions.forEach((s, id) => list.push({ workspaceId: id, status: s.status, phone: s.phone }));
    res.json(list);
  });

  // Debug/ops: inspect cafe address-book name for a phone (saved contact-list name only).
  app.get('/sessions/:workspaceId/contact', authMiddleware, (req, res) => {
    const session = sessions.get(req.params.workspaceId);
    if (!session) return res.status(404).json({ error: 'session not found' });
    const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'phone required' });
    const entry = session.contacts?.get(`pn:${phone}`) || null;
    res.json({
      phone,
      savedName: entry?.name || null,
      pushname: entry?.notify || null,
      contactsIndexed: session.contacts?.size || 0,
    });
  });
}
