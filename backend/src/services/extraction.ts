import { pool } from '../db.js';

// ── Field GROUPS: a misclassification *within* a group loses no fields, because the
// whole group shares one superset. Classification only needs to pick the right group. ──
const ID_FIELDS = ['name','name_devanagari','father_name','mother_name','husband_name','dob','gender','category','religion','nationality','address','city','district','state','pincode','aadhaar_number','pan_number','passport_number','voter_id_number','driving_license_number','ration_card_number','issue_date','expiry_date','place_of_issue'];
const ACADEMIC_FIELDS = ['name','name_devanagari','father_name','mother_name','dob','roll_number','registration_number','enrollment_number','application_number','certificate_number','board_name','school_name','college_name','university_name','course','stream','subject','qualification','exam_name','exam_date','exam_center','exam_seat_number','marks_obtained','total_marks','percentage','division','board_10th','passing_year_10th','marks_10th','percentage_10th','board_12th','passing_year_12th','marks_12th','percentage_12th','stream_12th','passing_year_graduation','marks_graduation','percentage_graduation','graduation_subject','issue_date'];
const BANK_FIELDS = ['account_holder_name','bank_account_number','ifsc_code','bank_name','branch_name','address','city','state','pincode'];
const TYPE_FIELDS: Record<string, string[]> = {
  aadhaar: ID_FIELDS, pan: ID_FIELDS, passport: ID_FIELDS, voter_id: ID_FIELDS,
  driving_license: ID_FIELDS, ration_card: ID_FIELDS,
  marksheet_10th: ACADEMIC_FIELDS, marksheet_12th: ACADEMIC_FIELDS,
  marksheet_graduation: ACADEMIC_FIELDS, marksheet_postgrad: ACADEMIC_FIELDS,
  certificate: ACADEMIC_FIELDS, admit_card: ACADEMIC_FIELDS, result: ACADEMIC_FIELDS,
  bank_passbook: BANK_FIELDS,
};
const ALL_FIELDS = ['document_type','name','name_devanagari','father_name','mother_name','husband_name','spouse_name','guardian_name','dob','gender','category','religion','nationality','marital_status','blood_group','phone','alt_phone','email','address','permanent_address','city','district','state','pincode','country','aadhaar_number','pan_number','passport_number','voter_id_number','driving_license_number','ration_card_number','bank_account_number','ifsc_code','bank_name','branch_name','account_holder_name','roll_number','registration_number','enrollment_number','application_number','exam_name','exam_date','exam_center','exam_seat_number','subject','qualification','school_name','college_name','university_name','board_name','course','stream','passing_year_10th','marks_10th','percentage_10th','board_10th','passing_year_12th','marks_12th','percentage_12th','board_12th','stream_12th','passing_year_graduation','marks_graduation','percentage_graduation','graduation_university','graduation_subject','occupation','employer','designation','issue_date','expiry_date','place_of_issue'];

const DOC_TYPES = ['aadhaar','pan','passport','voter_id','driving_license','ration_card','marksheet_10th','marksheet_12th','marksheet_graduation','marksheet_postgrad','admit_card','result','certificate','bank_passbook','photo','signature','form','other'];

// Identity fields describe the PERSON (one copy, from most authoritative doc).
const IDENTITY_FIELDS = new Set(['name','father_name','mother_name','husband_name','dob','gender','nationality','category','religion','aadhaar_number','pan_number','voter_id_number','address','permanent_address','phone','email','city','district','state','pincode']);
// Trust order for identity fields — higher wins.
const DOC_AUTHORITY: Record<string, number> = {
  aadhaar: 100, passport: 90, pan: 80, voter_id: 70, driving_license: 70, ration_card: 60,
  marksheet_10th: 40, marksheet_12th: 40, marksheet_graduation: 40, marksheet_postgrad: 40,
  certificate: 30, result: 30, admit_card: 30, bank_passbook: 50, form: 10, other: 10,
};

function buildExtractPrompt(fields: string[]): string {
  return `Extract data from this Indian document image. Return ONLY a valid JSON object (no markdown) with these keys: ${fields.join(', ')}, name_devanagari.
document_type must be EXACTLY ONE of: ${DOC_TYPES.join(', ')} (a person photo/selfie is "photo").
Rules: Transcribe text EXACTLY as printed, letter by letter — do NOT guess phonetic spellings or normalize (e.g. if printed "SADHNA" do NOT write "SADDHNA"). If a Devanagari/Hindi name is present, read it into name_devanagari and make the English name consistent with it. phone is a 10-digit mobile only — never put an Aadhaar/ID number in phone. For marksheets, marks_obtained is the marks the student scored and total_marks is the maximum/out-of marks (e.g. "391/500" → marks_obtained 391, total_marks 500); percentage is the % if printed. division is the class/grade if printed (e.g. "FIRST","SECOND","Distinction") — put it in division NOT percentage. Fill only fields visibly present; leave the rest as empty string "". dob format DD/MM/YYYY. aadhaar_number exactly 12 digits no spaces. pan_number 10 chars uppercase. Copy all numbers digit-for-digit. Return ONLY the JSON.`;
}

// ── Validation (deterministic correctness checks → real confidence) ──
const VD = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const VP = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
function aadhaarValid(n: string): boolean {
  if (!/^\d{12}$/.test(n)) return false;
  let c = 0; const r = n.split('').reverse();
  for (let i = 0; i < r.length; i++) c = VD[c][VP[i % 8][parseInt(r[i], 10)]];
  return c === 0;
}
/** Returns { confidence, needsReview } for a field's value. */
function validateField(key: string, value: string): { confidence: number; needsReview: boolean } {
  const v = String(value).trim();
  if (key === 'aadhaar_number') return aadhaarValid(v.replace(/\s/g, '')) ? { confidence: 0.99, needsReview: false } : { confidence: 0.4, needsReview: true };
  if (key === 'pan_number') return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v) ? { confidence: 0.97, needsReview: false } : { confidence: 0.4, needsReview: true };
  if (key === 'ifsc_code') return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v) ? { confidence: 0.97, needsReview: false } : { confidence: 0.5, needsReview: true };
  if (key === 'pincode') return /^\d{6}$/.test(v) ? { confidence: 0.95, needsReview: false } : { confidence: 0.5, needsReview: true };
  if (key === 'dob') {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const yr = m ? parseInt(m[3], 10) : 0;
    return (m && yr >= 1900 && yr <= new Date().getFullYear()) ? { confidence: 0.92, needsReview: false } : { confidence: 0.5, needsReview: true };
  }
  if (key === 'email') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? { confidence: 0.9, needsReview: false } : { confidence: 0.5, needsReview: true };
  if (key === 'phone' || key === 'alt_phone') {
    const digits = v.replace(/\D/g, '');
    return /^[6-9]\d{9}$/.test(digits) ? { confidence: 0.9, needsReview: false } : { confidence: 0.3, needsReview: true };
  }
  return { confidence: 0.85, needsReview: false };
}

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

/** All configured Groq keys (GROQ_API_KEY may be comma-separated; GROQ_API_KEY_2 also supported). */
function groqKeys(): string[] {
  const raw = [process.env['GROQ_API_KEY'], process.env['GROQ_API_KEY_2']].filter(Boolean).join(',');
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}

/** Single Groq vision call with key rotation on rate-limit. Returns raw assistant text. */
async function callGroqVision(base64: string, prompt: string, maxTokens: number): Promise<string> {
  const keys = groqKeys();
  if (!keys.length) throw new Error('GROQ_API_KEY not configured');
  for (let i = 0; i < keys.length; i++) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${keys[i]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
        ] }],
        max_tokens: maxTokens,
        temperature: 0,
      }),
    });
    if (response.status === 429 && i < keys.length - 1) continue; // rate-limited → next key
    const data = await response.json() as any;
    const content = data?.choices?.[0]?.message?.content;
    if (content) return content;
    // empty/error body: if more keys remain and it looks like a limit, try next
    if (data?.error && i < keys.length - 1) continue;
    return content ?? '';
  }
  return '';
}

/**
 * Map generic academic keys (roll_number, registration_number, marks/percentage) to the
 * frontend's LEVEL-SPECIFIC schema keys based on docType. Prevents (a) 10th/12th/grad
 * overwriting each other on the same generic key, and (b) fields landing in "Other details".
 */
function normalizeKeys(parsed: any, docType: string): any {
  const out: any = { ...parsed };
  const move = (from: string, to: string) => {
    if (out[from] != null && String(out[from]).trim() && (out[to] == null || !String(out[to]).trim())) {
      out[to] = out[from]; delete out[from];
    }
  };
  if (docType === 'marksheet_10th') {
    move('roll_number', 'roll_number_10th'); move('registration_number', 'registration_number_10th');
    move('certificate_number', 'certificate_number_10th');
    move('marks_obtained', 'marks_obtained_10th'); move('marks_10th', 'marks_obtained_10th');
    move('total_marks', 'total_marks_10th'); move('percentage', 'percentage_10th'); move('division', 'division_10th');
  } else if (docType === 'marksheet_12th') {
    move('roll_number', 'roll_number_12th'); move('registration_number', 'registration_number_12th');
    move('certificate_number', 'certificate_number_12th');
    move('marks_obtained', 'marks_obtained_12th'); move('marks_12th', 'marks_obtained_12th');
    move('total_marks', 'total_marks_12th'); move('percentage', 'percentage_12th'); move('division', 'division_12th');
  } else if (docType === 'marksheet_graduation' || docType === 'marksheet_postgrad' || docType === 'certificate') {
    move('roll_number', 'roll_number_grad'); move('registration_number', 'registration_number_grad');
    move('enrollment_number', 'registration_number_grad');
    move('passing_year_graduation', 'passing_year_grad');
    move('marks_obtained', 'marks_obtained_grad'); move('marks_graduation', 'marks_obtained_grad');
    move('total_marks', 'total_marks_grad'); move('percentage', 'percentage_grad'); move('percentage_graduation', 'percentage_grad'); move('division', 'division_grad');
    move('course', 'degree'); move('qualification', 'degree');
  }
  return out;
}

export async function extractFromBuffer(buffer: Buffer, fileId: string): Promise<{ suggested: any; raw: any }> {
  if (!groqKeys().length) throw new Error('GROQ_API_KEY not configured');
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) buffer = await pdfToImage(buffer);
  const base64 = buffer.toString('base64');

  // One superset covering ID + academic + bank; model also returns document_type.
  const fields = ['document_type', ...new Set([...ID_FIELDS, ...ACADEMIC_FIELDS, ...BANK_FIELDS])];
  const prompt = buildExtractPrompt(fields);
  let parsed: any = {};
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callGroqVision(base64, prompt, 2000);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = {}; } }
    if (Object.values(parsed).some(v => v && String(v).trim())) break;
    if (attempt === 0) await new Promise(r => setTimeout(r, 800));
  }
  const docType = String(parsed.document_type || '').trim().toLowerCase();
  if (docType === 'photo' || docType === 'signature') return { suggested: {}, raw: { document_type: docType } };
  parsed = normalizeKeys(parsed, docType);

  // Validate → real per-field confidence + needsReview flag
  const suggested: any = {};
  if (docType) suggested.document_type = { value: docType, source: 'document', documentId: fileId };
  for (const [k, v] of Object.entries(parsed)) {
    if (k === 'document_type' || k === 'name_devanagari') continue;
    if (!v || !String(v).trim()) continue;
    const { confidence, needsReview } = validateField(k, String(v));
    suggested[k] = { value: v, source: 'document', documentType: docType, documentId: fileId, confidence, needsReview };
  }
  return { suggested, raw: parsed };
}

/** Read cached extraction for a fileId (instant, no Groq call). */
export async function getCachedExtraction(fileId: string): Promise<any | null> {
  try {
    const { rows } = await pool.query('SELECT suggested FROM extraction_cache WHERE file_id = $1', [fileId]);
    return rows.length ? rows[0].suggested : null;
  } catch { return null; }
}

/** Store extraction result so the operator's Build Profile is instant. Also writes the doc tag. */
export async function cacheExtraction(fileId: string, workspaceId: string, suggested: any): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO extraction_cache (file_id, workspace_id, suggested, created_at)
       VALUES ($1, $2, $3, now()) ON CONFLICT (file_id) DO UPDATE SET suggested = $3, created_at = now()`,
      [fileId, workspaceId, JSON.stringify(suggested)]
    );
    // Tag the file from its detected document_type (works for PDFs and images alike)
    const dt = suggested?.document_type?.value || suggested?.document_type;
    const label = dt ? DOC_TYPE_LABELS[String(dt)] : null;
    if (label) await pool.query('UPDATE drive_files SET tag = $1 WHERE id = $2 AND tag IS NULL', [label, fileId]);
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
    // Auto-fill mobile from the WhatsApp number (last 10 digits) if the doc didn't provide one.
    if (!suggested.phone || !String(suggested.phone?.value || suggested.phone).trim()) {
      const mobile = String(phone).slice(-10);
      if (/^[6-9]\d{9}$/.test(mobile)) suggested.phone = { value: mobile, source: 'whatsapp', confidence: 0.95, needsReview: false };
    }

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

    // Existing → confidence-aware merge. Fill missing fields; and let a higher-confidence
    // (e.g. checksum-validated) reading replace a lower-confidence auto value. Never
    // touch operator-confirmed fields.
    const current = match.data || {};
    const merged: any = { ...current };
    let added = 0;
    for (const [k, v] of Object.entries(suggested)) {
      const nv = v as any;
      const existing = current[k];
      const existingVal = existing && typeof existing === 'object' ? existing.value : existing;
      const existingSrc = existing && typeof existing === 'object' ? existing.source : null;
      const existingConf = existing && typeof existing === 'object' ? (existing.confidence ?? 0) : 0;
      if (existingSrc === 'manual' || existingSrc === 'document_corrected') continue; // operator wins
      if (!existingVal) { merged[k] = nv; added++; continue; } // fill missing
      // Identity fields: a more authoritative document wins (Aadhaar > marksheet for name/dob/address)
      if (IDENTITY_FIELDS.has(k)) {
        const exAuth = DOC_AUTHORITY[(existing && existing.documentType) || ''] ?? 0;
        const nvAuth = DOC_AUTHORITY[nv.documentType || ''] ?? 0;
        if (nvAuth > exAuth) { merged[k] = nv; added++; continue; }
      }
      // Corroboration: same value seen again → boost confidence (cross-document voting)
      if (String(existingVal).trim().toLowerCase() === String(nv.value).trim().toLowerCase()) {
        merged[k] = { ...existing, confidence: Math.min(0.99, existingConf + 0.05), needsReview: false };
        added++;
      } else if ((nv.confidence ?? 0) > existingConf + 0.1) {
        merged[k] = nv; added++; // meaningfully more confident reading wins
      }
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
  const run = (attempt: number) => _extractQueue.push(async () => {
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
      } else if (docType === 'photo' || docType === 'signature') {
        console.log(`[AutoExtract] ${fileId} → ${docType} (not an ID doc)`);
      } else if (attempt < 2) {
        // empty/unknown on a doc that should have data → retry (transient Groq empty)
        console.warn(`[AutoExtract] ↻ ${fileId} empty, retry ${attempt + 1}`);
        setTimeout(() => run(attempt + 1), 4000);
      } else {
        console.log(`[AutoExtract] ${fileId} → no-data after retries`);
      }
    } catch (e: any) {
      console.warn(`[AutoExtract] ✗ ${fileId}:`, e.message);
      if (attempt < 2) setTimeout(() => run(attempt + 1), 4000); // crash/transient → retry
    }
  });
  run(0);
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
