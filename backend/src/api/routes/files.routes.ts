import { Router, Request, Response } from 'express';
import { getWhatsAppFiles, deleteFile } from '../../db.js';

const router = Router();

/**
 * GET /api/files
 * Get files (optionally filtered by type)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    const files = await getWhatsAppFiles(type as string | undefined);
    res.json(files);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

/**
 * DELETE /api/files/:id
 * Delete a file by ID
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await deleteFile(id);
    
    if (deleted) {
      res.json({ success: true, message: 'File deleted' });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
