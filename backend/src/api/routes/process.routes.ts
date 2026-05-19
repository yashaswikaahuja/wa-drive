import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import multer from 'multer';
import { generateAadhaarLayout, generatePassportSheet, generateSingleSheet, SheetPreset, PhotoSpec } from '../../services/processor/layout.js';
import { cropAndAlignFace, setLastImage, getLastImage } from '../../services/processor/faceDetect.js';
import { getDriveForWorkspace } from '../../modules/drive/service.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

async function downloadDriveFile(fileId: string, req: any): Promise<Buffer> {
  const drive = await getDriveForWorkspace(req.user?.workspaceId);
  if (!drive) throw new Error('Drive not connected for this workspace');
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return Buffer.from(res.data as ArrayBuffer);
}

router.post('/', async (req: Request, res: Response) => {
  const { fileIds, action } = req.body as { fileIds?: string[]; action?: string };

  if (!fileIds || fileIds.length !== 2) {
    res.status(400).json({ error: 'Provide exactly 2 fileIds' }); return;
  }
  if (action !== 'aadhaar_layout') {
    res.status(400).json({ error: 'Unknown action' }); return;
  }

  // Access token is stored on the hub — retrieve from module-level state
  // Drive access handled per-workspace in downloadDriveFile

  try {
    console.log(`[Process] Aadhaar layout for files: ${fileIds.join(', ')}`);
    const buffers = await Promise.all(fileIds.map(id => downloadDriveFile(id, req)));
    const output = await generateAadhaarLayout(buffers);
    console.log(`[Process] Layout generated: ${output.length} bytes`);
    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Disposition', 'inline; filename="aadhaar_layout.jpg"');
    res.send(output);
  } catch (e) {
    console.error('[Process] Error:', e);
    res.status(500).json({ error: 'Processing failed' });
  }
});

// POST /api/process/passport-sheet
// Accepts: JSON { fileId } OR multipart image_file (for bg-removed images)
router.post('/passport-sheet', upload.single('image_file') as any, async (req: Request, res: Response) => {
  const { fileId, preset = '4x6-8', spec = 'standard', name, date, signature, font = 'bold' } = req.body as {
    fileId?: string; preset?: string; spec?: string;
    name?: string; date?: string; signature?: boolean; font?: string;
  };
  const validPresets = ['4x6-8', '4x6-12', '4x6-4', 'a4-24', 'single'];
  const validSpecs   = ['standard', 'small', 'stamp'];
  if (!validPresets.includes(preset)) { res.status(400).json({ error: `preset must be one of: ${validPresets.join(', ')}` }); return; }
  if (!validSpecs.includes(spec))     { res.status(400).json({ error: `spec must be one of: ${validSpecs.join(', ')}` }); return; }

  let buffer: Buffer;
  try {
    if ((req as any).file) {
      // Multipart upload — bg-removed image from frontend
      buffer = (req as any).file.buffer;
    } else if (fileId) {
      // Drive handled per-workspace
      buffer = await downloadDriveFile(fileId, req);
    } else {
      res.status(400).json({ error: 'Provide image_file (multipart) or fileId' }); return;
    }
    const textOpts = (name || date || signature) ? { name, date, signature } : undefined;
    const output = preset === 'single'
      ? await generateSingleSheet(buffer, spec as PhotoSpec)
      : await generatePassportSheet(buffer, preset as SheetPreset, spec as PhotoSpec, textOpts, font as any);
    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Disposition', `inline; filename="photos_${preset}_${spec}.jpg"`);
    res.send(output);
  } catch (e: any) {
    console.error('[Process] passport-sheet error:', e.message);
    res.status(500).json({ error: e.message ?? 'Sheet generation failed' });
  }
});

// POST /api/process/face-align
// Accepts: multipart image_file OR JSON { fileId }
// Query params: ?pad=0.9 (crop padding), ?debug=true (draw face box overlay)
// Returns: aligned passport photo (600×600 JPEG)
router.post('/face-align', upload.single('image_file') as any, async (req: any, res: Response) => {
  const pad   = parseFloat(req.query.pad as string)   || 0.9;
  const debug = req.query.debug === 'true';

  let imageBuffer: Buffer;
  try {
    if (req.file) {
      imageBuffer = req.file.buffer;
    } else if (req.body?.fileId) {
      // Drive handled per-workspace
      imageBuffer = await downloadDriveFile(req.body.fileId, req);
    } else {
      res.status(400).json({ error: 'Provide image_file (multipart) or fileId (JSON)' }); return;
    }

    setLastImage(imageBuffer);
    const aligned = await cropAndAlignFace(imageBuffer, 600, 600, { pad, debug });
    res.set('Content-Type', 'image/jpeg');
    res.send(aligned);
  } catch (e: any) {
    console.error('[Process] face-align error:', e.message);
    res.status(500).json({ error: e.message ?? 'Face alignment failed' });
  }
});

// GET /api/process/debug/last-image
// Re-runs face detection + crop on the last uploaded image — no re-upload needed
// Query params: ?pad=0.9&debug=true
router.get('/debug/last-image', async (req: Request, res: Response) => {
  const buf = getLastImage();
  if (!buf) { res.status(404).json({ error: 'No image uploaded yet' }); return; }
  const pad   = parseFloat(req.query.pad as string)   || 0.9;
  const debug = req.query.debug !== 'false';  // debug=true by default for this endpoint
  try {
    const result = await cropAndAlignFace(buf, 600, 600, { pad, debug });
    res.set('Content-Type', 'image/jpeg');
    res.send(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

// POST /api/process/extract
router.post('/extract', async (req: any, res: Response) => {
  const { fileId } = req.body as { fileId?: string };
  if (!fileId) { res.status(400).json({ error: 'fileId required' }); return; }

  const GROQ_API_KEY = process.env['GROQ_API_KEY'];
  if (!GROQ_API_KEY) { res.status(500).json({ error: 'GROQ_API_KEY not configured' }); return; }

  try {
    let buffer = await downloadDriveFile(fileId, req);
    
    // Detect if PDF and convert first page to image
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      try {
        const { execSync } = await import('child_process');
        const { writeFileSync, readFileSync, unlinkSync } = await import('fs');
        const tmpPdf = '/tmp/extract_' + Date.now() + '.pdf';
        const tmpImg = '/tmp/extract_' + Date.now();
        writeFileSync(tmpPdf, buffer);
        execSync(`pdftoppm -jpeg -r 150 -f 1 -l 1 ${tmpPdf} ${tmpImg}`);
        buffer = readFileSync(tmpImg + '-1.jpg');
        try { unlinkSync(tmpPdf); unlinkSync(tmpImg + '-1.jpg'); } catch {}
      } catch (e: any) {
        console.error('[Process] PDF conversion failed:', e.message);
        res.json({ ok: false, error: 'pdf_conversion_failed', message: 'PDF could not be converted' });
        return;
      }
    }

    const base64 = buffer.toString('base64');
    const prompt = `Analyze this Indian document/identity image and extract ALL relevant information. Return ONLY a valid JSON object (no markdown, no explanation):

{
  "document_type": "",
  "name": "",
  "father_name": "",
  "mother_name": "",
  "husband_name": "",
  "spouse_name": "",
  "guardian_name": "",
  "dob": "",
  "gender": "",
  "category": "",
  "religion": "",
  "nationality": "",
  "marital_status": "",
  "blood_group": "",
  "phone": "",
  "alt_phone": "",
  "email": "",
  "address": "",
  "permanent_address": "",
  "city": "",
  "district": "",
  "state": "",
  "pincode": "",
  "country": "",
  "aadhaar_number": "",
  "pan_number": "",
  "passport_number": "",
  "voter_id_number": "",
  "driving_license_number": "",
  "ration_card_number": "",
  "bank_account_number": "",
  "ifsc_code": "",
  "bank_name": "",
  "branch_name": "",
  "account_holder_name": "",
  "roll_number": "",
  "registration_number": "",
  "enrollment_number": "",
  "application_number": "",
  "exam_name": "",
  "exam_date": "",
  "exam_center": "",
  "exam_seat_number": "",
  "subject": "",
  "qualification": "",
  "school_name": "",
  "college_name": "",
  "university_name": "",
  "board_name": "",
  "course": "",
  "stream": "",
  "branch_subject": "",
  "passing_year_10th": "",
  "marks_10th": "",
  "percentage_10th": "",
  "board_10th": "",
  "passing_year_12th": "",
  "marks_12th": "",
  "percentage_12th": "",
  "board_12th": "",
  "stream_12th": "",
  "passing_year_graduation": "",
  "marks_graduation": "",
  "percentage_graduation": "",
  "graduation_university": "",
  "graduation_subject": "",
  "passing_year_postgrad": "",
  "marks_postgrad": "",
  "percentage_postgrad": "",
  "postgrad_university": "",
  "postgrad_subject": "",
  "occupation": "",
  "employer": "",
  "designation": "",
  "annual_income": "",
  "expiry_date": "",
  "issue_date": "",
  "place_of_issue": ""
}

document_type values:
- "aadhaar" - Aadhaar card
- "pan" - PAN card
- "passport" - Passport
- "voter_id" - Voter ID / EPIC
- "driving_license" - Driving licence
- "ration_card" - Ration card
- "marksheet_10th" - 10th class marksheet
- "marksheet_12th" - 12th class marksheet
- "marksheet_graduation" - Graduation/degree marksheet
- "marksheet_postgrad" - Post-graduation marksheet
- "admit_card" - Examination admit card / hall ticket
- "result" - Result document
- "certificate" - Certificate (caste, income, domicile, character, etc.)
- "bank_passbook" - Bank passbook / cancelled cheque
- "photo" - Personal photograph
- "signature" - Signature image
- "form" - Application form
- "other" - Anything else

Extraction rules:
- Fill only fields present in the document. Leave others as empty string.
- dob format: DD/MM/YYYY
- For marksheets: extract passing year, marks/percentage, board/university, subjects/stream into the appropriate slot (board_10th, percentage_10th, etc.)
- For admit cards: extract roll_number, registration_number, exam_name, exam_date, exam_center, application_number
- For Aadhaar: aadhaar_number is 12 digits (no spaces)
- For PAN: pan_number is 10 chars uppercase
- Address fields: prefer to split city/state/district/pincode separately. Keep full string in 'address' too.
- Bank documents: extract account_number, ifsc, bank_name, branch_name
- DO NOT mix unrelated IDs into one field. Aadhaar number goes into aadhaar_number, roll number into roll_number, etc.
- For category: SC/ST/OBC/General/EWS etc.
- Return ONLY the JSON, no surrounding text.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
        ]}],
        max_tokens: 2000,
      }),
    });

    const data = await response.json() as any;
    const text = data?.choices?.[0]?.message?.content ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { res.json({ ok: true, suggested: {} }); return; }
    try {
      const fields = JSON.parse(jsonMatch[0]);
      const suggested: any = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v && String(v).trim()) suggested[k] = { value: v, source: 'document', documentId: fileId, confidence: 0.9 };
      }
      res.json({ ok: true, suggested, raw: fields });
    } catch {
      res.json({ ok: true, suggested: {} });
    }
  } catch (e: any) {
    console.error('[Process] extract error:', e.message);
    res.status(500).json({ error: e.message ?? 'Extraction failed' });
  }
});
