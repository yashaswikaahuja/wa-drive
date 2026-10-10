import { pool } from '@cybercontrol/backend-core';

// Authority for identity fields — higher wins (mirrors extraction.ts)
const DOC_AUTHORITY: Record<string, number> = {
  aadhaar: 100, passport: 90, pan: 80, voter_id: 70, driving_license: 70, ration_card: 60,
  marksheet_10th: 40, marksheet_12th: 40, marksheet_graduation: 40, marksheet_postgrad: 40,
  certificate: 30, result: 30, admit_card: 30, ayushman: 55, bank_passbook: 50, form: 10, other: 10,
};
const IDENTITY_FIELDS = new Set(['name','first_name','middle_name','last_name','father_name','mother_name','husband_name','dob','gender','nationality','category','religion','marital_status','aadhaar_number','pan_number','voter_id_number','address','permanent_address','village','post_office','police_station','block','sub_division','ward_no','phone','email','city','district','state','pincode']);

/**
 * Derive a person's profile from their per-document extractions (NO stored blob).
 * overrides = operator-confirmed fields (profiles.data) which always win.
 */
export async function deriveProfile(workspaceId: string, phone: string, personKey: string, overrides: any = {}): Promise<Record<string, any>> {
  const { rows } = await pool.query(
    `SELECT suggested, created_at FROM extraction_cache
     WHERE workspace_id = $1 AND phone = $2 AND person_key = $3 ORDER BY created_at`,
    [workspaceId, phone, personKey]
  );
  const result: Record<string, any> = {};
  for (const row of rows) {
    const sugg = row.suggested || {};
    for (const [k, v] of Object.entries(sugg)) {
      if (k === 'document_type') continue;
      const nv = v as any;
      if (!nv || (typeof nv === 'object' && (nv.value == null || nv.value === ''))) continue;
      // Coerce nested objects (subject→marks maps) to strings — React cannot render objects (#31).
      if (nv && typeof nv === 'object' && nv.value != null && typeof nv.value === 'object') {
        try {
          nv.value = Object.entries(nv.value as Record<string, unknown>)
            .map(([sk, sv]) => `${sk}: ${sv == null ? '' : String(sv)}`)
            .join(', ');
        } catch {
          nv.value = JSON.stringify(nv.value);
        }
      }
      const nvValRaw = String(nv.value ?? '').trim();
      if (!nvValRaw) continue;
      // Guard: a "degree" that is really a school-level exam name is mis-placed (from a null-typed doc) — skip it.
      if (k === 'degree' && /intermediate|secondary|matric|10\+2|high school|class (10|12)/i.test(nvValRaw)) continue;
      const cur = result[k];
      if (!cur) { result[k] = nv; continue; }
      const curAuth = DOC_AUTHORITY[cur.documentType || ''] ?? 0;
      const nvAuth = DOC_AUTHORITY[nv.documentType || ''] ?? 0;
      const curVal = String(cur.value ?? '').trim().toLowerCase();
      const nvVal = String(nv.value ?? '').trim().toLowerCase();
      if (curVal === nvVal) { // agreement → boost confidence
        result[k] = { ...cur, confidence: Math.min(0.99, (cur.confidence ?? 0.85) + 0.05), needsReview: false };
      } else if (IDENTITY_FIELDS.has(k)) {
        if (nvAuth > curAuth) result[k] = nv; // higher-authority doc wins identity
      } else if ((nv.confidence ?? 0) > (cur.confidence ?? 0) + 0.1) {
        result[k] = nv;
      }
    }
  }
  // Build documentId → documentType from cache so overrides that lost type still organise as doc cards.
  // Also look up by file_id: some caches (e.g. bank) were written without phone/person_key, so the
  // phone+person query above misses them — that was why Bank became a generic "From Document" card.
  const typeByDocId: Record<string, string> = {};
  const ingestSuggested = (sugg: any, fileId?: string) => {
    if (!sugg || typeof sugg !== 'object') return;
    const topType = sugg.document_type?.value || sugg.document_type;
    if (fileId && topType && String(topType) !== 'other') typeByDocId[String(fileId)] = String(topType);
    for (const nv of Object.values(sugg)) {
      const o = nv as any;
      if (!o || typeof o !== 'object') continue;
      const id = o.documentId != null ? String(o.documentId) : (fileId || '');
      const t = o.documentType != null ? String(o.documentType).trim() : '';
      if (id && t && t !== 'other') typeByDocId[id] = t;
    }
  };
  for (const row of rows) ingestSuggested(row.suggested);
  const overrideDocIds = [
    ...new Set(
      Object.values(overrides || {})
        .map((v: any) => (v && v.documentId != null ? String(v.documentId) : ''))
        .filter(Boolean),
    ),
  ].filter((id) => !typeByDocId[id]);
  if (overrideDocIds.length) {
    try {
      const { rows: byFile } = await pool.query(
        `SELECT file_id, suggested FROM extraction_cache
         WHERE workspace_id = $1 AND file_id = ANY($2::text[])`,
        [workspaceId, overrideDocIds],
      );
      for (const row of byFile) ingestSuggested(row.suggested, row.file_id);
    } catch (e: any) {
      console.warn('[deriveProfile] file_id type lookup failed', e.message);
    }
  }

  // operator overrides always win (but never promote pipeline metadata into profile fields)
  const OVERRIDE_NOISE = new Set(['needs_type', 'document_type', 'document_label']);
  // Bank extracts must not keep OCR junk address lines (S/O …) — lean banking keys only
  const BANK_DENY = new Set(['address', 'city', 'state', 'pincode', 'village', 'district', 'post_office']);
  for (const [k, v] of Object.entries(overrides || {})) {
    if (OVERRIDE_NOISE.has(k)) continue;
    const ov = v as any;
    if (ov && (ov.source === 'manual' || ov.source === 'document_corrected' || ov.source === 'shared')) {
      const enriched = { ...ov };
      const id = enriched.documentId != null ? String(enriched.documentId) : '';
      if (id && !enriched.documentType && typeByDocId[id]) {
        enriched.documentType = typeByDocId[id];
      }
      const effectiveType = String(enriched.documentType || typeByDocId[id] || '');
      if (effectiveType === 'bank_passbook' && BANK_DENY.has(k)) continue;
      result[k] = enriched;
    }
  }
  // Drop metadata keys if they somehow landed from cache
  delete result.needs_type;
  delete result.document_type;
  // auto-fill mobile from the WhatsApp number if no doc provided one
  if (!result.phone || !String(result.phone?.value ?? '').trim()) {
    const mobile = String(phone).slice(-10);
    if (/^[6-9]\d{9}$/.test(mobile)) result.phone = { value: mobile, source: 'whatsapp', confidence: 0.95, needsReview: false };
  }

  // ── Name synthesis: derive full name ↔ parts ──
  const val = (k: string) => String(result[k]?.value ?? '').trim();
  // If we have parts but no full name, synthesize it
  if (!val('name') && val('first_name')) {
    const parts = [val('first_name'), val('middle_name'), val('last_name')].filter(Boolean);
    result.name = { value: parts.join(' '), source: 'derived', confidence: 0.95, needsReview: false };
  }
  // If we have full name but no parts, split it (simple heuristic — AI should provide parts for new extractions)
  if (val('name') && !val('first_name')) {
    const parts = val('name').split(/\s+/);
    result.first_name = { value: parts[0] || '', source: 'derived', confidence: 0.9, needsReview: false };
    if (parts.length >= 3) {
      result.middle_name = { value: parts.slice(1, -1).join(' '), source: 'derived', confidence: 0.85, needsReview: false };
      result.last_name = { value: parts[parts.length - 1], source: 'derived', confidence: 0.9, needsReview: false };
    } else if (parts.length === 2) {
      result.last_name = { value: parts[1], source: 'derived', confidence: 0.9, needsReview: false };
    }
  }

  return result;
}
