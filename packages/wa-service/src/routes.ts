export function registerRoutes(app: any, {
  config,
  sessions,
  startSession,
  stopSession
}: any) {
  const { SERVICE_SECRET } = config;

  function authMiddleware(req: any, res: any, next: any) {
    const token = req.headers['x-service-secret'];
    if (token !== SERVICE_SECRET) return res.status(401).json({ error: 'Unauthorized' });
    next();
  }

  app.get('/health', (_: any, res: any) => res.json({ status: 'ok', sessions: sessions.size }));

  app.post('/sessions/start', authMiddleware, async (req: any, res: any) => {
    const { workspaceId, force } = req.body;
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
    if (force) {
      const existing = sessions.get(workspaceId);
      if (existing?.socket) {
        existing.stopping = true;
        if (existing.reconnectTimer) clearTimeout(existing.reconnectTimer);
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

  app.post('/sessions/stop', authMiddleware, async (req: any, res: any) => {
    const { workspaceId } = req.body;
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
    await stopSession(workspaceId);
    res.json({ ok: true });
  });

  app.get('/sessions/:workspaceId/status', authMiddleware, (req: any, res: any) => {
    const session = sessions.get(req.params.workspaceId);
    if (!session) return res.json({ connected: false, status: 'none' });
    res.json({
      connected: session.status === 'connected',
      status: session.status,
      phone: session.phone,
      qr: session.qr,
      reconnectAttempts: session.reconnectAttempts || 0,
      lastDisconnectReason: session.lastDisconnectReason || null,
      lastDisconnectAt: session.lastDisconnectAt || null,
      lastUploadAt: session.lastUploadAt || null,
      lastDesyncAt: session.lastDesyncAt || null,
      failedMediaDownloads: session.failedMediaDownloads || 0,
    });
  });

  app.get('/sessions/:workspaceId/qr', authMiddleware, (req: any, res: any) => {
    const session = sessions.get(req.params.workspaceId);
    res.json({ qr: session?.qr || null });
  });

  app.post('/sessions/:workspaceId/send', authMiddleware, async (req: any, res: any) => {
    const session = sessions.get(req.params.workspaceId);
    if (!session?.socket) return res.status(400).json({ error: 'Not connected' });
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
    try {
      const jid = phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      await session.socket.sendMessage(jid, { text: message });
      res.json({ ok: true });
    } catch (e) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/sessions', authMiddleware, (_: any, res: any) => {
    const list: any = [];
    sessions.forEach((s: any, id: any) => list.push({ workspaceId: id, status: s.status, phone: s.phone }));
    res.json(list);
  });

  // Debug/ops: inspect cafe address-book name for a phone (saved contact-list name only).
  app.get('/sessions/:workspaceId/contact', authMiddleware, (req: any, res: any) => {
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
