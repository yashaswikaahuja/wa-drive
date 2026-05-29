import { pool } from '../db.js';

const EXTRACT_PROMPT = `Analyze this Indian document/identity image and extract ALL relevant information. Return ONLY a valid JSON object (no markdown, no explanation) with keys: document_type, name, father_name, mother_name, husband_name, spouse_name, guardian_name, dob, gender, category, religion, nationality, marital_status, blood_group, phone, alt_phone, email, address, permanent_address, city, district, state, pincode, country, aadhaar_number, pan_number, passport_number, voter_id_number, driving_license_number, ration_card_number, bank_account_number, ifsc_code, bank_name, branch_name, account_holder_name, roll_number, registration_number, enrollment_number, application_number, exam_name, exam_date, exam_center, exam_seat_number, subject, qualification, school_name, college_name, university_name, board_name, course, stream, branch_subject, passing_year_10th, marks_10th, percentage_10th, board_10th, passing_year_12th, marks_12th, percentage_12th, board_12th, stream_12th, passing_year_graduation, marks_graduation, percentage_graduation, graduation_university, graduation_subject, occupation, employer, designation, annual_income, expiry_date, issue_date, place_of_issue.

Rules: Fill only fields present in the document, leave others empty. dob format DD/MM/YYYY. aadhaar_number is 12 digits no spaces. pan_number is 10 chars uppercase. Split city/state/district/pincode separately but keep full string in address. DO NOT mix unrelated IDs into one field. document_type one of: aadhaar, pan, passport, voter_id, driving_license, ration_card, marksheet_10th, marksheet_12th, marksheet_graduation, marksheet_postgrad, admit_card, result, certificate, bank_passbook, photo, signature, form, other. Return ONLY the JSON.`;

/** Convert PDF first page to JPEG buffer via pdftoppm. */
async function pdfToImage(buffer: Buffer): Promise<Buffer> {
  const { execSync } = await import('child_process');
  const { writeFileSync, readFileSync, unlinkSync } = await import('fs');
  const tmpPdf = '/tmp/extract_' + Date.now() + '.pdf';
  const tmpImg = '/tmp/extract_' + Date.now();
  writeFileSync(tmpPdf, buffer);
  execSync(`pdftoppm -jpeg -r 150 -f 1 -l 1 ${tmpPdf} ${tmpImg}`);
  const img = readFileSync(tmpImg + '-1.jpg');
  try { unlinkSync(tmpPdf); unlinkSync(tmpImg + '-1.jpg'); } catch {}
  return img;
}

/** Run Groq vision extraction on a document buffer. Returns { suggested, raw }. */
export async function extractFromBuffer(buffer: Buffer, fileId: string): Promise<{ suggested: any; raw: any }> {
  const GROQ_API_KEY = process.env['GROQ_API_KEY'];
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured');

  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    buffer = await pdfToImage(buffer);
  }
  const base64 = buffer.toString('base64');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{ role: 'user', content: [
        { type: 'text', text: EXTRACT_PROMPT },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
      ] }],
      max_tokens: 2000,
    }),
  });
  const data = await response.json() as any;
  const text = data?.choices?.[0]?.message?.content ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { suggested: {}, raw: {} };
  const fields = JSON.parse(jsonMatch[0]);
  const suggested: any = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v && String(v).trim()) suggested[k] = { value: v, source: 'document', documentId: fileId, confidence: 0.9 };
  }
  return { suggested, raw: fields };
}

/** Read cached extraction for a fileId (instant, no Groq call). */
export async function getCachedExtraction(fileId: string): Promise<any | null> {
  try {
    const { rows } = await pool.query('SELECT suggested FROM extraction_cache WHERE file_id = $1', [fileId]);
    return rows.length ? rows[0].suggested : null;
  } catch { return null; }
}

/** Store extraction result so the operator's Build Profile is instant. */
export async function cacheExtraction(fileId: string, workspaceId: string, suggested: any): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO extraction_cache (file_id, workspace_id, suggested, created_at)
       VALUES ($1, $2, $3, now()) ON CONFLICT (file_id) DO UPDATE SET suggested = $3, created_at = now()`,
      [fileId, workspaceId, JSON.stringify(suggested)]
    );
  } catch (e: any) { console.warn('[extract] cache write failed:', e.message); }
}

/** Fire-and-forget background extraction after a document arrives. */
export function autoExtractInBackground(buffer: Buffer, fileId: string, workspaceId: string, mimetype: string) {
  // Only auto-extract images and PDFs (skip video/audio)
  if (!mimetype.startsWith('image/') && mimetype !== 'application/pdf') return;
  // Copy buffer ref before caller releases it
  const buf = Buffer.from(buffer);
  setTimeout(async () => {
    try {
      const { suggested } = await extractFromBuffer(buf, fileId);
      if (Object.keys(suggested).length > 0) {
        await cacheExtraction(fileId, workspaceId, suggested);
        console.log(`[AutoExtract] ✓ ${fileId} → ${Object.keys(suggested).length} fields cached`);
      }
    } catch (e: any) { console.warn(`[AutoExtract] ✗ ${fileId}:`, e.message); }
  }, 500);
}
