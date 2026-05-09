import { Router } from 'express';
import { getHubStatus } from '../../server.js';
const router = Router();
router.get('/status', (_req, res) => {
    res.json({ connected: getHubStatus().connected });
});
export default router;
//# sourceMappingURL=whatsapp.routes.js.map