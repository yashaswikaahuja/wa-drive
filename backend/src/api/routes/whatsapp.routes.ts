import { Router, Request, Response } from 'express';
import { whatsappService } from '../../services/whatsapp.service.js';
import { getWhatsAppFiles, deleteFile } from '../../db.js';

const router = Router();

/**
 * GET /api/whatsapp/status
 * Get WhatsApp connection status
 */
router.get('/status', (req: Request, res: Response) => {
  const connected = whatsappService.getStatus();
  res.json({ connected });
});

export default router;
