import { pool } from '../db.js';

const EXTRACT_PROMPT = `Analyze this Indian document/identity image and extract ALL relevant information. Return ONLY a valid JSON object (no markdown, no explanation) with keys: document_type, name, father_name, mother_name, husband_name, spouse_name, guardian_name, dob, gender, category, religion, nationality, marital_status, blood_group, phone, alt_phone, email, address, permanent_address, city, district, state, pincode, country, aadhaar_number, pan_number, passport_number, voter_id_number, driving_license_number, ration_card_number, bank_account_number, ifsc_code, bank_name, branch_name, account_holder_name, roll_number, registration_number, enrollment_number, application_number, exam_name, exam_date, exam_center, exam_seat_number, subject, qualification, school_name, college_name, university_name, board_name, course, stream, branch_subject, passing_year_10th, marks_10th, percentage_10th, board_10th, passing_year_12th, marks_12th, percentage_12th, board_12th, stream_12th, passing_year_graduation, marks_graduation, percentage_graduation, graduation_university, graduation_subject, occupation, employer, designation, annual_income, expiry_date, issue_date, place_of_issue.

Rules: Fill only fields present in the document, leave others empty. Transcribe names EXACTLY as printed, letter by letter — do NOT guess phonetic spellings or normalize (e.g. if printed "SADHNA" do not write "SADDHNA"). dob format DD/MM/YYYY. aadhaar_number is 12 digits no spaces. pan_number is 10 chars uppercase. Split city/state/district/pincode separately but keep full string in address. DO NOT mix unrelated IDs into one field. document_type one of: aadhaar, pan, passport, voter_id, driving_license, ration_card, marksheet_10th, marksheet_12th, marksheet_graduation, marksheet_postgrad, admit_card, result, certificate, bank_passbook, photo, signature, form, other. Return ONLY the JSON.`;

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
      temperature: 0,
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

// Fuzzy name match (same logic as group-docs) for find-or-create
function namesMatch(a: string, b: string): boolean {
  const norm = (x: string) => (x || '').toLowerCase().replace(/[^a-z\u0900-\u097F]/g, '').trim();
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  const lev = (x: string, y: string): number => {
    const m = x.length, n = y.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0)));
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1] + (x[i-1] === y[j-1] ? 0 : 1));
    return dp[m][n];
  };
  const maxLen = Math.max(na.length, nb.length);
  const dist = lev(na, nb);
  if (maxLen >= 6 && dist <= 2) return true;
  if (maxLen >= 10 && dist <= 3) return true;
  return false;
}

/**
 * Auto-build/update a profile from extracted data.
 * - New name on this phone → create profile.
 * - Existing (fuzzy-matched) name → merge ONLY missing fields (source 'auto').
 * - Never overwrites operator-confirmed fields (manual / document_corrected).
 * Skipped if no name (photo/signature docs have no identity).
 */
export async function upsertProfileFromExtraction(workspaceId: string, phone: string, suggested: any): Promise<void> {
  try {
    const nameField = suggested?.name;
    const name = (nameField && typeof nameField === 'object' ? nameField.value : nameField) || '';
    if (!name || String(name).trim().length < 2) return; // no identity → skip
    // Skip if "phone" is actually an unresolved LID (15+ digits). Extraction stays
    // cached, so the profile builds correctly once the resolver maps LID→phone.
    if (!/^\d{7,13}$/.test(String(phone || ''))) return;

    // Find existing profiles for this phone
    const { rows } = await pool.query(
      `SELECT id, name, display_label, data FROM profiles WHERE workspace_id = $1 AND primary_contact_phone = $2 AND deleted_at IS NULL`,
      [workspaceId, phone]
    );
    const match = rows.find((p: any) => namesMatch(p.display_label || p.name || '', name));

    if (!match) {
      // New applicant → create profile (relationship 'self' by default)
      await pool.query(
        `INSERT INTO profiles (workspace_id, primary_contact_phone, name, display_label, relationship, data)
         VALUES ($1,$2,$3,$4,'self',$5)`,
        [workspaceId, phone, name, name, JSON.stringify(suggested)]
      );
      console.log(`[AutoProfile] created "${name}" (${phone})`);
      return;
    }

    // Existing → merge only MISSING fields; never touch confirmed ones
    const current = match.data || {};
    const merged: any = { ...current };
    let added = 0;
    for (const [k, v] of Object.entries(suggested)) {
      const existing = current[k];
      const existingVal = existing && typeof existing === 'object' ? existing.value : existing;
      const existingSrc = existing && typeof existing === 'object' ? existing.source : null;
      // Skip if operator already confirmed this field
      if (existingSrc === 'manual' || existingSrc === 'document_corrected') continue;
      // Only fill if currently empty
      if (!existingVal) { merged[k] = v; added++; }
    }
    if (added > 0) {
      await pool.query(
        `UPDATE profiles SET data = $1::jsonb, updated_at = now() WHERE id = $2`,
        [JSON.stringify(merged), match.id]
      );
      console.log(`[AutoProfile] updated "${match.display_label || match.name}" +${added} fields`);
    }
  } catch (e: any) { console.warn('[AutoProfile] failed:', e.message); }
}

// Serial queue — process auto-extracts ONE AT A TIME to avoid Groq rate-limit
// degradation when a customer sends a batch of documents at once.
const _extractQueue: Array<() => Promise<void>> = [];
let _extractRunning = false;
async function _drainQueue() {
  if (_extractRunning) return;
  _extractRunning = true;
  while (_extractQueue.length) {
    const job = _extractQueue.shift()!;
    try { await job(); } catch {}
  }
  _extractRunning = false;
}

/** Fire-and-forget background extraction after a document arrives. */
export function autoExtractInBackground(buffer: Buffer, fileId: string, workspaceId: string, mimetype: string, phone?: string) {
  // Detect type by magic bytes (WhatsApp uploads often arrive as octet-stream)
  const b = buffer;
  const isJpeg = b[0] === 0xFF && b[1] === 0xD8;
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
  const isPdf = b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
  const isImageMime = (mimetype || '').startsWith('image/') || mimetype === 'application/pdf';
  if (!isJpeg && !isPng && !isPdf && !isImageMime) return; // skip video/audio/unknown
  const buf = Buffer.from(buffer);
  _extractQueue.push(async () => {
    try {
      const { suggested, raw } = await extractFromBuffer(buf, fileId);
      // Persist AI-detected document type as the file's tag (drives chat badge + smart selection)
      const docType = (raw?.document_type || '').toString().trim();
      if (docType) {
        const label = DOC_TYPE_LABELS[docType] || null;
        try { await pool.query('UPDATE drive_files SET tag = $1 WHERE id = $2 AND tag IS NULL', [label, fileId]); } catch {}
      }
      if (Object.keys(suggested).length > 0) {
        await cacheExtraction(fileId, workspaceId, suggested);
        // Auto-build/update the customer's profile (find-or-create by name)
        if (phone) await upsertProfileFromExtraction(workspaceId, phone, suggested);
        console.log(`[AutoExtract] ✓ ${fileId} → ${docType || '?'}, ${Object.keys(suggested).length} fields`);
      } else {
        console.log(`[AutoExtract] ${fileId} → ${docType || 'no-data'} (not an ID doc)`);
      }
    } catch (e: any) { console.warn(`[AutoExtract] ✗ ${fileId}:`, e.message); }
  });
  setTimeout(_drainQueue, 500);
}

// Map raw document_type → human label used as the file tag
const DOC_TYPE_LABELS: Record<string, string> = {
  aadhaar: 'Aadhaar', pan: 'PAN', passport: 'Passport', voter_id: 'Voter ID',
  driving_license: 'Driving License', ration_card: 'Ration Card',
  marksheet_10th: '10th Marksheet', marksheet_12th: '12th Marksheet',
  marksheet_graduation: 'Graduation', marksheet_postgrad: 'Post-Grad',
  admit_card: 'Admit Card', result: 'Result', certificate: 'Certificate',
  bank_passbook: 'Bank', photo: 'Photo', signature: 'Signature',
  form: 'Form', other: 'Other',
};
