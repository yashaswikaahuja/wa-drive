import { pool } from '../db.js';

// ── Field GROUPS: a misclassification *within* a group loses no fields, because the
// whole group shares one superset. Classification only needs to pick the right group. ──
const ID_FIELDS = ['name','first_name','middle_name','last_name','name_devanagari','father_name','mother_name','husband_name','dob','gender','category','religion','nationality','marital_status','address','village','post_office','police_station','block','sub_division','ward_no','city','district','state','pincode','aadhaar_number','pan_number','passport_number','voter_id_number','driving_license_number','ration_card_number','issue_date','expiry_date','place_of_issue'];
const ACADEMIC_FIELDS = ['name','name_devanagari','father_name','mother_name','dob','roll_number','registration_number','enrollment_number','application_number','certificate_number','board','board_name','school_name','college_name','university_name','course','stream','subject','qualification','exam_name','exam_date','exam_center','exam_seat_number','marks_obtained','total_marks','percentage','division','passing_year','graduation_subject','issue_date'];
const BANK_FIELDS = ['account_holder_name','bank_account_number','ifsc_code','bank_name','branch_name','address','city','state','pincode'];
const TYPE_FIELDS: Record<string, string[]> = {
  aadhaar: ID_FIELDS, pan: ID_FIELDS, passport: ID_FIELDS, voter_id: ID_FIELDS,
  driving_license: ID_FIELDS, ration_card: ID_FIELDS,
  marksheet_10th: ACADEMIC_FIELDS, marksheet_12th: ACADEMIC_FIELDS,
  marksheet_graduation: ACADEMIC_FIELDS, marksheet_postgrad: ACADEMIC_FIELDS,
  certificate: ACADEMIC_FIELDS, admit_card: ACADEMIC_FIELDS, result: ACADEMIC_FIELDS,
  bank_passbook: BANK_FIELDS,
};
const ALL_FIELDS = ['document_type','name','first_name','middle_name','last_name','name_devanagari','father_name','mother_name','husband_name','spouse_name','guardian_name','dob','gender','category','religion','nationality','marital_status','blood_group','phone','alt_phone','email','address','permanent_address','village','post_office','police_station','block','sub_division','ward_no','city','district','state','pincode','country','aadhaar_number','pan_number','passport_number','voter_id_number','driving_license_number','ration_card_number','bank_account_number','ifsc_code','bank_name','branch_name','account_holder_name','roll_number','registration_number','enrollment_number','application_number','exam_name','exam_date','exam_center','exam_seat_number','subject','qualification','school_name','college_name','university_name','board_name','course','stream','passing_year_10th','marks_10th','percentage_10th','board_10th','passing_year_12th','marks_12th','percentage_12th','board_12th','stream_12th','passing_year_graduation','marks_graduation','percentage_graduation','graduation_university','graduation_subject','occupation','employer','designation','issue_date','expiry_date','place_of_issue'];

const DOC_TYPES = ['aadhaar','pan','passport','voter_id','driving_license','ration_card','marksheet_10th','marksheet_12th','marksheet_graduation','marksheet_postgrad','admit_card','result','certificate','bank_passbook','photo','signature','form','other'];

function buildExtractPrompt(fields: string[]): string {
  return `Extract data from this Indian document image. Return ONLY a valid JSON object (no markdown) with these keys: ${fields.join(', ')}, name_devanagari, document_label, extra_fields.
document_type must be EXACTLY ONE of: ${DOC_TYPES.join(', ')} (a person photo/selfie is "photo").
document_label: a short human title for this document (e.g. "Caste Certificate", "Income Certificate", "Marriage Certificate", "Domicile Certificate", "Experience Letter", "Property Document"). 
extra_fields: an OBJECT of any other important labelled values present that don't fit the keys above, using snake_case keys (e.g. {"caste":"OBC","certificate_authority":"Tahsildar","valid_until":"2026"}). Use {} if none.
Rules: Transcribe text EXACTLY as printed, letter by letter — do NOT guess phonetic spellings or normalize (e.g. if printed "SADHNA" do NOT write "SADDHNA"). If a Devanagari/Hindi name is present, read it into name_devanagari and make the English name consistent with it. phone is a 10-digit mobile only — never put an Aadhaar/ID number in phone. For marksheets, marks_obtained is the marks the student scored and total_marks is the maximum/out-of marks (e.g. "391/500" → marks_obtained 391, total_marks 500); percentage is the % if printed. division is the class/grade if printed (e.g. "FIRST","SECOND","Distinction") — put it in division NOT percentage. Fill only fields visibly present; leave the rest as empty string "". dob format DD/MM/YYYY. aadhaar_number exactly 12 digits no spaces. pan_number 10 chars uppercase. Copy all numbers digit-for-digit.
NAME SPLITTING: "name" is the full name as printed. ALSO split it into "first_name" (first word), "middle_name" (middle words if any, empty if only 2 words), "last_name" (last word/surname). Example: "Ram Prakash Singh" → name="Ram Prakash Singh", first_name="Ram", middle_name="Prakash", last_name="Singh". "Kamaljeet Kumar" → first_name="Kamaljeet", middle_name="", last_name="Kumar".
RELATIONSHIP PARSING: On Aadhaar cards, "S/O" (Son of) or "D/O" (Daughter of) = father_name. "W/O" (Wife of) = husband_name. "C/O" (Care of) = father_name (unless context indicates otherwise). The name AFTER S/O, D/O, C/O, W/O is the relationship person — extract it into the correct field (father_name or husband_name). Do NOT put this in mother_name unless it explicitly says "Mother:" or similar. Example: "S/O: Rajesh Kumar" → father_name="Rajesh Kumar". "W/O: Sunil Prasad" → husband_name="Sunil Prasad". "C/O: Ramesh Singh" → father_name="Ramesh Singh".
ADDRESS SPLITTING: "address" is the full address as printed. ALSO extract individual components into: "village" (village/town/locality name), "post_office" (post office name if mentioned), "police_station" (thana/PS if mentioned), "block" (block/tehsil/taluka if mentioned), "sub_division" (sub-division/anchal if mentioned), "ward_no" (ward number if mentioned), "city" (city/town name for urban areas), "district", "state", "pincode". Use common sense: on an Aadhaar card the address format is typically "S/O: X, House, Village/Town, PO: Y, District, State - PIN". Extract each component to its field.
Return ONLY the JSON.`;
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

/** Convert PDF pages (up to 3) to JPEG buffers via pdftoppm. Marks are often on page 2+. */
async function pdfToImages(buffer: Buffer): Promise<Buffer[]> {
  const { execSync } = await import('child_process');
  const { writeFileSync, readFileSync, unlinkSync, existsSync } = await import('fs');
  const base = '/tmp/extract_' + Date.now();
  const tmpPdf = base + '.pdf';
  writeFileSync(tmpPdf, buffer);
  const imgs: Buffer[] = [];
  try {
    execSync(`pdftoppm -jpeg -r 150 -f 1 -l 3 ${tmpPdf} ${base}`);
    // pdftoppm names pages base-1.jpg, base-2.jpg, ... (or base-01.jpg for 10+)
    for (const suffix of ['-1.jpg', '-2.jpg', '-3.jpg', '-01.jpg', '-02.jpg', '-03.jpg']) {
      if (existsSync(base + suffix)) { imgs.push(readFileSync(base + suffix)); try { unlinkSync(base + suffix); } catch {} }
    }
  } finally { try { unlinkSync(tmpPdf); } catch {} }
  return imgs.length ? imgs : [buffer];
}

/** All configured Groq keys (GROQ_API_KEY may be comma-separated; GROQ_API_KEY_2 also supported). */
function groqKeys(): string[] {
  const raw = [process.env['GROQ_API_KEY'], process.env['GROQ_API_KEY_2']].filter(Boolean).join(',');
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}

/** Mistral API key. */
function mistralKey(): string {
  return process.env['MISTRAL_API_KEY'] || '';
}

/** Vision call: Mistral primary → Groq fallback. */
async function callVision(base64s: string | string[], prompt: string, maxTokens: number): Promise<string> {
  const images = (Array.isArray(base64s) ? base64s : [base64s]).slice(0, 3);

  // ── Primary: Mistral (Small 4 — fast, clean JSON, good Indian doc OCR) ──
  const mKey = mistralKey();
  if (mKey) {
    const content: any[] = [{ type: 'text', text: prompt },
      ...images.map(b => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b}` } }))];
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${mKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content }],
        max_tokens: maxTokens,
      }),
    });
    if (response.ok) {
      const data = await response.json() as any;
      const text = data?.choices?.[0]?.message?.content || '';
      return text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    }
    if (response.status !== 429) console.warn('[Extract] Mistral failed:', response.status, await response.text().catch(() => ''));
  }

  // ── Fallback: Groq (Qwen 3.6-27B vision) ──
  const keys = groqKeys();
  if (!keys.length && !mKey) throw new Error('No vision API key configured (MISTRAL_API_KEY or GROQ_API_KEY)');
  if (!keys.length) throw new Error('Mistral call failed and no GROQ fallback key');
  const content: any[] = [{ type: 'text', text: prompt },
    ...images.map(b => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b}` } }))];
  for (let i = 0; i < keys.length; i++) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${keys[i]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen/qwen3.6-27b',
        messages: [{ role: 'user', content }],
        max_tokens: maxTokens,
        temperature: 0,
      }),
    });
    if (response.status === 429 && i < keys.length - 1) continue;
    const data = await response.json() as any;
    const content2 = data?.choices?.[0]?.message?.content;
    if (content2) return content2.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (data?.error && i < keys.length - 1) continue;
    return content2 ?? '';
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
  // A diploma/certificate course (e.g. "Advance Diploma in Computer Application") is a separate
  // vocational qualification, NOT the degree — don't let it write graduation keys.
  const courseTxt = String((parsed.course?.value ?? parsed.course ?? parsed.qualification?.value ?? parsed.qualification ?? parsed.degree?.value ?? parsed.degree ?? parsed.document_label?.value ?? parsed.document_label ?? '')).toLowerCase();
  const isDiploma = /diploma|certificate course|computer application|adca|dca|tally|typing|typist/.test(courseTxt);
  if (isDiploma) {
    return out; // a diploma is a separate vocational qualification, never the degree — keep generic
  }
  if (docType === 'marksheet_10th') {
    move('roll_number', 'roll_number_10th'); move('registration_number', 'registration_number_10th');
    move('certificate_number', 'certificate_number_10th'); move('board', 'board_10th'); move('passing_year', 'passing_year_10th');
    move('marks_obtained', 'marks_obtained_10th'); move('marks_10th', 'marks_obtained_10th');
    move('total_marks', 'total_marks_10th'); move('percentage', 'percentage_10th'); move('division', 'division_10th');
  } else if (docType === 'marksheet_12th') {
    move('roll_number', 'roll_number_12th'); move('registration_number', 'registration_number_12th');
    move('certificate_number', 'certificate_number_12th'); move('board', 'board_12th'); move('passing_year', 'passing_year_12th'); move('stream', 'stream_12th');
    move('school_name', 'school_name_12th'); move('roll_code', 'roll_code_12th');
    move('marks_obtained', 'marks_obtained_12th'); move('marks_12th', 'marks_obtained_12th');
    move('total_marks', 'total_marks_12th'); move('percentage', 'percentage_12th'); move('division', 'division_12th');
  } else if (docType === 'marksheet_graduation' || docType === 'marksheet_postgrad') {
    move('roll_number', 'roll_number_grad'); move('registration_number', 'registration_number_grad');
    move('enrollment_number', 'registration_number_grad');
    move('passing_year', 'passing_year_grad'); move('passing_year_graduation', 'passing_year_grad');
    move('marks_obtained', 'marks_obtained_grad'); move('marks_graduation', 'marks_obtained_grad');
    move('total_marks', 'total_marks_grad'); move('percentage', 'percentage_grad'); move('percentage_graduation', 'percentage_grad'); move('division', 'division_grad');
    move('course', 'degree'); move('qualification', 'degree'); move('board', 'university_name');
  } else if (docType === 'certificate') {
    // A certificate can be of ANY level. Detect from its content, then route to that level.
    const txt = (k: string) => String(parsed[k]?.value ?? parsed[k] ?? '').toLowerCase();
    const blob = [txt('degree'), txt('exam_name'), txt('course'), txt('qualification'), txt('document_label'), txt('board_12th'), txt('stream_12th')].join(' ');
    const lvl = /intermediate|10\+2|12th|senior secondary|board_12th|inter /.test(blob) || parsed.board_12th || parsed.stream_12th ? '12th'
      : /matric|secondary school|10th|high school/.test(blob) ? '10th'
      : /bachelor|graduat|b\.?a\.?|b\.?sc|b\.?com|degree|university|honours/.test(blob) ? 'grad'
      : '';
    if (lvl === '12th') {
      move('roll_number', 'roll_number_12th'); move('registration_number', 'registration_number_12th'); move('certificate_number', 'certificate_number_12th');
      move('marks_obtained', 'marks_obtained_12th'); move('total_marks', 'total_marks_12th'); move('percentage', 'percentage_12th'); move('division', 'division_12th');
      move('passing_year', 'passing_year_12th'); move('board', 'board_12th'); move('stream', 'stream_12th'); move('school_name', 'school_name_12th'); move('roll_code', 'roll_code_12th');
    } else if (lvl === '10th') {
      move('roll_number', 'roll_number_10th'); move('registration_number', 'registration_number_10th'); move('certificate_number', 'certificate_number_10th');
      move('marks_obtained', 'marks_obtained_10th'); move('total_marks', 'total_marks_10th'); move('percentage', 'percentage_10th'); move('division', 'division_10th');
      move('passing_year', 'passing_year_10th'); move('board', 'board_10th'); move('school_name', 'school_name'); move('roll_code', 'roll_code_10th');
    } else if (lvl === 'grad') {
      move('course', 'degree'); move('qualification', 'degree');
      move('passing_year', 'passing_year_grad'); move('passing_year_graduation', 'passing_year_grad');
      move('marks_obtained', 'marks_obtained_grad'); move('total_marks', 'total_marks_grad');
      move('percentage', 'percentage_grad'); move('percentage_graduation', 'percentage_grad');
      move('division', 'division_grad'); move('enrollment_number', 'registration_number_grad');
    }
    // unknown level → leave generic (shows as its own labelled section)
  }
  return out;
}

export async function extractFromBuffer(buffer: Buffer, fileId: string): Promise<{ suggested: any; raw: any }> {
  if (!groqKeys().length) throw new Error('GROQ_API_KEY not configured');
  let base64s: string[];
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    const pages = await pdfToImages(buffer); // marks may be on page 2+
    base64s = pages.map(p => p.toString('base64'));
  } else {
    base64s = [buffer.toString('base64')];
  }

  // One superset covering ID + academic + bank; model also returns document_type.
  const fields = ['document_type', ...new Set([...ID_FIELDS, ...ACADEMIC_FIELDS, ...BANK_FIELDS])];
  const prompt = buildExtractPrompt(fields);
  let parsed: any = {};
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callVision(base64s, prompt, 4000);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = {}; } }
    if (Object.values(parsed).some(v => v && String(v).trim())) break;
    if (attempt === 0) await new Promise(r => setTimeout(r, 800));
  }
  const docType = String(parsed.document_type || '').trim().toLowerCase();
  if (docType === 'photo' || docType === 'signature') return { suggested: {}, raw: { document_type: docType } };
  parsed = normalizeKeys(parsed, docType);

  // ── Post-process: fix S/O, C/O, D/O → father_name; W/O → husband_name ──
  // Some models put the S/O name in mother_name by mistake on Aadhaar cards
  const rawAddr = String(parsed.address || '').trim();
  const fName = String(parsed.father_name || '').trim();
  const mName = String(parsed.mother_name || '').trim();
  if (!fName && mName && (docType === 'aadhaar' || /\b[SsDdCc]\/[Oo]\b/.test(rawAddr))) {
    // If mother_name is filled but father_name is not, and it's an Aadhaar (which uses S/O, not mother), swap
    parsed.father_name = mName;
    parsed.mother_name = '';
  }
  // Also extract father/husband from address S/O, C/O, D/O, W/O if not already extracted
  const soMatch = rawAddr.match(/\b(?:[Ss]\/[Oo]|[Dd]\/[Oo]|[Cc]\/[Oo])\s*:?\s*([^,]+)/);
  const woMatch = rawAddr.match(/\b[Ww]\/[Oo]\s*:?\s*([^,]+)/);
  if (soMatch && !String(parsed.father_name || '').trim()) {
    parsed.father_name = soMatch[1].trim();
  }
  if (woMatch && !String(parsed.husband_name || '').trim()) {
    parsed.husband_name = woMatch[1].trim();
  }

  // Validate → real per-field confidence + needsReview flag
  const suggested: any = {};
  if (docType) suggested.document_type = { value: docType, source: 'document', documentId: fileId };
  const docLabel = String(parsed.document_label?.value ?? parsed.document_label ?? '').trim();
  if (docLabel) suggested.document_label = { value: docLabel, source: 'document', documentType: docType, documentId: fileId };
  for (const [k, v] of Object.entries(parsed)) {
    if (k === 'document_type' || k === 'name_devanagari' || k === 'document_label' || k === 'extra_fields') continue;
    if (!v || !String(v).trim()) continue;
    const { confidence, needsReview } = validateField(k, String(v));
    suggested[k] = { value: v, source: 'document', documentType: docType, documentId: fileId, confidence, needsReview };
  }
  // Open-ended extra fields for odd/unspecified documents → flattened with provenance
  const extra = parsed.extra_fields && typeof parsed.extra_fields === 'object' ? parsed.extra_fields : null;
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      const val = (v && typeof v === 'object' ? (v as any).value : v);
      const key = k.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (!key || !val || !String(val).trim() || suggested[key]) continue;
      suggested[key] = { value: val, source: 'document', documentType: docType, documentId: fileId, confidence: 0.8, needsReview: false, extra: true };
    }
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
export async function upsertProfileFromExtraction(workspaceId: string, phone: string, suggested: any, fileId?: string): Promise<void> {
  try {
    const nameField = suggested?.name;
    const name = (nameField && typeof nameField === 'object' ? nameField.value : nameField) || '';
    if (!name || String(name).trim().length < 2) return; // no identity → skip
    if (!/^\d{7,13}$/.test(String(phone || ''))) return; // skip unresolved LID

    const norm = (x: string) => (x || '').toLowerCase().replace(/[^a-z\u0900-\u097F]/g, '').trim();
    // Find existing profiles for this phone, fuzzy-match the name → person
    const { rows } = await pool.query(
      `SELECT id, name, display_label FROM profiles WHERE workspace_id = $1 AND primary_contact_phone = $2 AND deleted_at IS NULL`,
      [workspaceId, phone]
    );
    const match = rows.find((p: any) => namesMatch(p.display_label || p.name || '', name));
    const personKey = norm(match ? (match.display_label || match.name) : name);

    if (!match) {
      // New applicant → create an identity row (NO field blob; fields are derived from docs)
      await pool.query(
        `INSERT INTO profiles (workspace_id, primary_contact_phone, name, display_label, relationship, data)
         VALUES ($1,$2,$3,$4,'self','{}'::jsonb)`,
        [workspaceId, phone, name, name]
      );
      console.log(`[AutoProfile] created "${name}" (${phone})`);
    }
    // Assign this extraction to the person (document-centric: derive reads use person_key)
    if (fileId) {
      await pool.query(
        `UPDATE extraction_cache SET person_key = $1, phone = $2 WHERE file_id = $3`,
        [personKey, phone, fileId]
      );
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
        if (phone) await upsertProfileFromExtraction(workspaceId, phone, suggested, fileId);
        console.log(`[AutoExtract] ✓ ${fileId} → ${docType || '?'}, ${Object.keys(suggested).length} fields`);
        markExtractionJobDone(fileId);
      } else if (docType === 'photo' || docType === 'signature') {
        console.log(`[AutoExtract] ${fileId} → ${docType} (not an ID doc)`);
        markExtractionJobDone(fileId);
      } else if (attempt < 2) {
        // empty/unknown on a doc that should have data → retry (transient Groq empty)
        console.warn(`[AutoExtract] ↻ ${fileId} empty, retry ${attempt + 1}`);
        setTimeout(() => run(attempt + 1), 4000);
      } else {
        console.log(`[AutoExtract] ${fileId} → no-data after retries`);
        markExtractionJobDone(fileId);
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

// ─────────────────────────────────────────────────────────────────────────────
// DURABLE EXTRACTION LEDGER — safety net over the in-memory queue above.
//
// The in-memory queue is lost on restart/deploy, silently dropping in-flight extractions. These
// helpers record each extraction as a durable job (extraction_jobs) and a recovery sweeper
// re-processes anything the in-memory path didn't finish, re-downloading the bytes from Drive.
//
// NON-BREAKING: every function is wrapped so that if the extraction_jobs table is absent (migration
// not yet run), it silently no-ops — the existing in-memory flow is completely unaffected.
// ─────────────────────────────────────────────────────────────────────────────

const EXTRACTION_STUCK_AFTER = "5 minutes"; // a 'pending' job older than this = the in-memory path lost it
const EXTRACTION_MAX_ATTEMPTS = 5;

/** Record a durable job when a document is uploaded (called in-request, so it survives a restart). */
export async function enqueueExtractionJob(fileId: string, workspaceId: string, phone?: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO extraction_jobs (file_id, workspace_id, phone, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (file_id) DO NOTHING`,
      [fileId, workspaceId, phone || null]
    );
  } catch { /* table absent / DB hiccup → no-op (in-memory path still runs) */ }
}

/** Mark a job done once the in-memory path (or the sweeper) has cached its extraction. */
export function markExtractionJobDone(fileId: string): void {
  pool.query(`UPDATE extraction_jobs SET status='done', updated_at=now() WHERE file_id=$1`, [fileId])
    .catch(() => { /* table absent / DB hiccup → no-op */ });
}

/**
 * Recovery sweeper: claim a small batch of jobs the in-memory path didn't finish (stuck 'pending'
 * past EXTRACTION_STUCK_AFTER — i.e. lost to a restart), re-download the bytes from Drive, and
 * re-run the SAME extraction logic. Idempotent (cacheExtraction upserts by file_id). Small LIMIT
 * keeps it gentle on Groq (natural rate-limit). Safe no-op if the table is absent.
 */
export async function recoverStuckExtractions(): Promise<void> {
  let claimed: Array<{ file_id: string; workspace_id: string; phone: string | null }> = [];
  try {
    const { rows } = await pool.query(
      `UPDATE extraction_jobs SET status='processing', attempts=attempts+1, updated_at=now()
       WHERE file_id IN (
         SELECT file_id FROM extraction_jobs
         WHERE status='pending' AND created_at < now() - interval '${EXTRACTION_STUCK_AFTER}'
         ORDER BY created_at
         LIMIT 3
         FOR UPDATE SKIP LOCKED
       )
       RETURNING file_id, workspace_id, phone`
    );
    claimed = rows as any;
  } catch { return; /* table absent / DB hiccup → nothing to do */ }

  if (!claimed.length) return;
  // Import Drive lazily to avoid a startup import cycle.
  const { getDriveForWorkspace, downloadFileFromDrive } = await import('../modules/drive/service.js');

  for (const job of claimed) {
    try {
      const drive = await getDriveForWorkspace(job.workspace_id);
      if (!drive) throw new Error('no Drive client for workspace');
      const buffer = await downloadFileFromDrive(drive, job.file_id);
      const { suggested } = await extractFromBuffer(buffer, job.file_id);
      if (Object.keys(suggested).length > 0) {
        await cacheExtraction(job.file_id, job.workspace_id, suggested);
        if (job.phone) await upsertProfileFromExtraction(job.workspace_id, job.phone, suggested, job.file_id);
      }
      await pool.query(`UPDATE extraction_jobs SET status='done', updated_at=now() WHERE file_id=$1`, [job.file_id]);
      console.log(`[ExtractRecover] ✓ recovered ${job.file_id}`);
    } catch (e: any) {
      // failed → back to 'pending' for another pass, or 'failed' after max attempts
      try {
        await pool.query(
          `UPDATE extraction_jobs
           SET status = CASE WHEN attempts >= $2 THEN 'failed' ELSE 'pending' END,
               last_error = $3, updated_at = now()
           WHERE file_id = $1`,
          [job.file_id, EXTRACTION_MAX_ATTEMPTS, String(e?.message || e).slice(0, 500)]
        );
      } catch { /* ignore */ }
      console.warn(`[ExtractRecover] ✗ ${job.file_id}: ${e?.message || e}`);
    }
  }
}

let _recoveryStarted = false;
/** Start the periodic recovery sweeper (call once from index.ts). Guarded against double-start. */
export function startExtractionRecovery(intervalMs = 60_000): void {
  if (_recoveryStarted) return;
  _recoveryStarted = true;
  setInterval(() => { recoverStuckExtractions().catch(() => {}); }, intervalMs);
  console.log('[ExtractRecover] recovery sweeper started');
  // Optional one-time backfill of documents uploaded BEFORE this ledger existed (or lost earlier):
  // enqueue drive_files that have no extraction_cache row. Env-guarded so it's deliberate; the
  // sweeper drains them slowly (3/min) so it won't spike Groq.
  if (process.env.EXTRACTION_BACKFILL === '1') {
    pool.query(
      `INSERT INTO extraction_jobs (file_id, workspace_id, phone, status)
       SELECT d.id, d.workspace_id, d.customer_id, 'pending'
       FROM drive_files d
       LEFT JOIN extraction_cache c ON c.file_id = d.id
       WHERE c.file_id IS NULL AND d.workspace_id IS NOT NULL
       ON CONFLICT (file_id) DO NOTHING`
    ).then((r: any) => console.log(`[ExtractRecover] backfill enqueued ${r.rowCount} missing doc(s)`))
     .catch((e: any) => console.warn('[ExtractRecover] backfill skipped:', e.message));
  }
}
