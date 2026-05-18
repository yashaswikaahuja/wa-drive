import { Router } from 'express';
import { pool } from '../../db.js';
import { authMiddleware } from '../../middleware/auth.js';
import { WA_SERVICE, WA_SECRET } from '../../config.js';
import { getIO } from '../../socket/index.js';
const router = Router();
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const r = await fetch(WA_SERVICE + '/sessions/' + req.user.workspaceId + '/status', { headers: { 'x-service-secret': WA_SECRET } });
        res.json(await r.json());
    }
    catch {
        res.json({ connected: false, status: 'service_down' });
    }
});
router.get('/qr', authMiddleware, async (req, res) => {
    try {
        const r = await fetch(WA_SERVICE + '/sessions/' + req.user.workspaceId + '/status', { headers: { 'x-service-secret': WA_SECRET } });
        const data = await r.json();
        res.json({ qrCode: data.qr || null });
    }
    catch {
        res.json({ qrCode: null });
    }
});
router.post('/connect', authMiddleware, async (req, res) => {
    try {
        await fetch(WA_SERVICE + '/sessions/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-service-secret': WA_SECRET },
            body: JSON.stringify({ workspaceId: req.user.workspaceId }),
        });
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.post('/send', authMiddleware, async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (!phone || !message)
            return res.status(400).json({ error: 'phone and message required' });
        const r = await fetch(WA_SERVICE + '/sessions/' + req.user.workspaceId + '/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-service-secret': WA_SECRET },
            body: JSON.stringify({ phone, message }),
        });
        res.json(await r.json());
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
router.post('/link-lid', authMiddleware, async (req, res) => {
    try {
        const { lid, phone } = req.body;
        if (!lid || !phone)
            return res.status(400).json({ error: 'lid and phone required' });
        await fetch(WA_SERVICE + '/sessions/' + req.user.workspaceId + '/link-lid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-service-secret': WA_SECRET },
            body: JSON.stringify({ lid, phone }),
        });
        await pool.query('UPDATE drive_files SET customer_id = $1 WHERE workspace_id = $2 AND customer_id = $3', [phone, req.user.workspaceId, lid]);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Worker event relay (WhatsApp service → frontend socket.io)
router.post('/event', (req, res) => {
    const secret = req.headers['x-worker-secret'] || req.headers['x-service-secret'];
    if (secret !== WA_SECRET)
        return res.status(401).json({ error: 'unauthorized' });
    const { workspaceId, event, qr, phone } = req.body;
    const io = getIO();
    if (event === 'qr')
        io.emit('qr', { qr, workspaceId });
    else if (event === 'connected')
        io.emit('connection:status', { connected: true, phone, workspaceId });
    else if (event === 'disconnected')
        io.emit('connection:status', { connected: false, workspaceId });
    res.json({ ok: true });
});
// Worker update-dp
router.post('/update-dp', async (req, res) => {
    const secret = req.headers['x-worker-secret'];
    if (secret !== WA_SECRET)
        return res.status(401).json({ error: 'Unauthorized' });
    const { phone, dpUrl, workspaceId } = req.body;
    if (!phone || !dpUrl || !workspaceId)
        return res.status(400).json({ error: 'missing fields' });
    try {
        await pool.query('UPDATE drive_files SET profile_pic_url = $1 WHERE workspace_id = $2 AND customer_id = $3', [dpUrl, workspaceId, phone]);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
export default router;
//# sourceMappingURL=routes.js.map