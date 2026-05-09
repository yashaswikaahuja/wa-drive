import { Router } from 'express';
import { google } from 'googleapis';
import multer from 'multer';
import { generateAadhaarLayout, generatePassportSheet, generateSingleSheet } from '../../services/processor/layout.js';
import { cropAndAlignFace, setLastImage, getLastImage } from '../../services/processor/faceDetect.js';
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });
async function downloadDriveFile(fileId, accessToken) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return Buffer.from(res.data);
}
router.post('/', async (req, res) => {
    const { fileIds, action } = req.body;
    if (!fileIds || fileIds.length !== 2) {
        res.status(400).json({ error: 'Provide exactly 2 fileIds' });
        return;
    }
    if (action !== 'aadhaar_layout') {
        res.status(400).json({ error: 'Unknown action' });
        return;
    }
    // Access token is stored on the hub — retrieve from module-level state
    const { driveAccessToken } = req.app.locals;
    if (!driveAccessToken) {
        res.status(401).json({ error: 'Not connected to Google Drive' });
        return;
    }
    try {
        console.log(`[Process] Aadhaar layout for files: ${fileIds.join(', ')}`);
        const buffers = await Promise.all(fileIds.map(id => downloadDriveFile(id, driveAccessToken)));
        const output = await generateAadhaarLayout(buffers);
        console.log(`[Process] Layout generated: ${output.length} bytes`);
        res.set('Content-Type', 'image/jpeg');
        res.set('Content-Disposition', 'inline; filename="aadhaar_layout.jpg"');
        res.send(output);
    }
    catch (e) {
        console.error('[Process] Error:', e);
        res.status(500).json({ error: 'Processing failed' });
    }
});
// POST /api/process/passport-sheet
// Accepts: JSON { fileId } OR multipart image_file (for bg-removed images)
router.post('/passport-sheet', upload.single('image_file'), async (req, res) => {
    const { fileId, preset = '4x6-8', spec = 'standard', name, date, signature, font = 'bold' } = req.body;
    const validPresets = ['4x6-8', '4x6-12', '4x6-4', 'a4-24', 'single'];
    const validSpecs = ['standard', 'small', 'stamp'];
    if (!validPresets.includes(preset)) {
        res.status(400).json({ error: `preset must be one of: ${validPresets.join(', ')}` });
        return;
    }
    if (!validSpecs.includes(spec)) {
        res.status(400).json({ error: `spec must be one of: ${validSpecs.join(', ')}` });
        return;
    }
    let buffer;
    try {
        if (req.file) {
            // Multipart upload — bg-removed image from frontend
            buffer = req.file.buffer;
        }
        else if (fileId) {
            const { driveAccessToken } = req.app.locals;
            if (!driveAccessToken) {
                res.status(401).json({ error: 'Not connected to Google Drive' });
                return;
            }
            buffer = await downloadDriveFile(fileId, driveAccessToken);
        }
        else {
            res.status(400).json({ error: 'Provide image_file (multipart) or fileId' });
            return;
        }
        const textOpts = (name || date || signature) ? { name, date, signature } : undefined;
        const output = preset === 'single'
            ? await generateSingleSheet(buffer, spec)
            : await generatePassportSheet(buffer, preset, spec, textOpts, font);
        res.set('Content-Type', 'image/jpeg');
        res.set('Content-Disposition', `inline; filename="photos_${preset}_${spec}.jpg"`);
        res.send(output);
    }
    catch (e) {
        console.error('[Process] passport-sheet error:', e.message);
        res.status(500).json({ error: e.message ?? 'Sheet generation failed' });
    }
});
// POST /api/process/face-align
// Accepts: multipart image_file OR JSON { fileId }
// Query params: ?pad=0.9 (crop padding), ?debug=true (draw face box overlay)
// Returns: aligned passport photo (600×600 JPEG)
router.post('/face-align', upload.single('image_file'), async (req, res) => {
    const pad = parseFloat(req.query.pad) || 0.9;
    const debug = req.query.debug === 'true';
    let imageBuffer;
    try {
        if (req.file) {
            imageBuffer = req.file.buffer;
        }
        else if (req.body?.fileId) {
            const { driveAccessToken } = req.app.locals;
            if (!driveAccessToken) {
                res.status(401).json({ error: 'Not connected to Google Drive' });
                return;
            }
            imageBuffer = await downloadDriveFile(req.body.fileId, driveAccessToken);
        }
        else {
            res.status(400).json({ error: 'Provide image_file (multipart) or fileId (JSON)' });
            return;
        }
        setLastImage(imageBuffer);
        const aligned = await cropAndAlignFace(imageBuffer, 600, 600, { pad, debug });
        res.set('Content-Type', 'image/jpeg');
        res.send(aligned);
    }
    catch (e) {
        console.error('[Process] face-align error:', e.message);
        res.status(500).json({ error: e.message ?? 'Face alignment failed' });
    }
});
// GET /api/process/debug/last-image
// Re-runs face detection + crop on the last uploaded image — no re-upload needed
// Query params: ?pad=0.9&debug=true
router.get('/debug/last-image', async (req, res) => {
    const buf = getLastImage();
    if (!buf) {
        res.status(404).json({ error: 'No image uploaded yet' });
        return;
    }
    const pad = parseFloat(req.query.pad) || 0.9;
    const debug = req.query.debug !== 'false'; // debug=true by default for this endpoint
    try {
        const result = await cropAndAlignFace(buf, 600, 600, { pad, debug });
        res.set('Content-Type', 'image/jpeg');
        res.send(result);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
export default router;
// POST /api/process/extract
// Body: { fileId } — downloads from Drive, sends to Groq Vision, returns extracted fields
router.post('/extract', async (req, res) => {
    const { fileId } = req.body;
    if (!fileId) {
        res.status(400).json({ error: 'fileId required' });
        return;
    }
    const { driveAccessToken } = req.app.locals;
    if (!driveAccessToken) {
        res.status(401).json({ error: 'Not connected to Google Drive' });
        return;
    }
    const GROQ_API_KEY = process.env['GROQ_API_KEY'];
    if (!GROQ_API_KEY) {
        res.status(500).json({ error: 'GROQ_API_KEY not configured' });
        return;
    }
    try {
        const buffer = await downloadDriveFile(fileId, driveAccessToken);
        const base64 = buffer.toString('base64');
        const prompt = `You are an OCR assistant. Extract information from this Indian identity document and return ONLY a valid JSON object with these fields:
{ name: , dob: , gender: , id_number: , address: , father_name: , expiry:  }
Rules:
- Fill only fields visible in the document. Leave others as empty string.
- dob format: DD/MM/YYYY
- id_number: Aadhaar (12 digits), PAN (10 chars), Passport number, Voter ID etc.
- Do NOT include any explanation, only the JSON object.`;
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: [{ role: 'user', content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
                        ] }],
                max_tokens: 300,
            }),
        });
        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content ?? '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            res.status(500).json({ error: 'Could not parse AI response', raw: text });
            return;
        }
        const fields = JSON.parse(jsonMatch[0]);
        res.json(fields);
    }
    catch (e) {
        console.error('[Process] extract error:', e.message);
        res.status(500).json({ error: e.message ?? 'Extraction failed' });
    }
});
//# sourceMappingURL=process.routes.js.map