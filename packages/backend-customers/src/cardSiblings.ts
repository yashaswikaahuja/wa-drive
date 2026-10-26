// Pure logic for pairing the front & back of one physical ID card.
//
// Why this is tricky: a plastic ID prints the SAME number on front and back, so
// matching by id-number alone cannot tell the real back from a second copy of the
// FRONT — both share the number. That produced "front printed twice". So we also
// infer each image's SIDE from its extracted fields (the back carries the address
// block; the front carries photo-side identity) and only pair the opened image
// with an image of the OPPOSITE side. If no opposite-side image exists, we return
// just the opened file — never the same side twice.
//
// This module is DB-free and pure so it can be unit-tested; the route supplies the
// rows it read from drive_files + extraction_cache.

import { normalizeDocTypeKey } from '@cybercontrol/backend-documents';

export const CARD_TYPES = new Set(['aadhaar', 'pan', 'voter_id', 'driving_license', 'ayushman']);

/** The id-number field name per card type. */
export const ID_FIELD: Record<string, string> = {
  aadhaar: 'aadhaar_number', pan: 'pan_number', voter_id: 'voter_id_number',
  driving_license: 'driving_license_number', ayushman: 'ayushman_id',
};

const BACK_FIELDS = ['address', 'pincode', 'district', 'post_office', 'police_station', 'village', 'state', 'father_name', 'husband_name'];
const FRONT_FIELDS = ['dob', 'gender', 'photo'];

export interface CardRow {
  id: string;
  tag?: string | null;
  suggested?: Record<string, any> | null;
}

export function fieldValue(s: any, k: string): string {
  return String(s?.[k]?.value ?? s?.[k] ?? '').trim();
}

export function cardTypeOf(r: CardRow): string {
  const fromSugg = fieldValue(r.suggested, 'document_type').toLowerCase();
  if (fromSugg && fromSugg !== 'other') return fromSugg.replace(/\s+/g, '_');
  const k = normalizeDocTypeKey(r.tag || '');
  return k ? k.toLowerCase() : '';
}

/** 'back' when the image shows the address block; else 'front'. */
export function cardSideOf(r: CardRow): 'front' | 'back' {
  const s = r.suggested || {};
  let back = 0, front = 0;
  for (const k of BACK_FIELDS) if (fieldValue(s, k)) back++;
  for (const k of FRONT_FIELDS) if (fieldValue(s, k)) front++;
  if (fieldValue(s, 'address')) back += 1; // address present = strong back signal
  return back > front ? 'back' : 'front';
}

const digitsOnly = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase();
const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z\u0900-\u097f]/g, '');

export interface PickResult {
  type: string | null;
  side: 'front' | 'back' | null;
  orderedFileIds: string[];
}

/**
 * Given the opened file id and all of the customer's card rows, return the ordered
 * file ids to print: the opened file, then the opposite-side sibling of the same
 * card if one exists. Non-card → just the opened file. Never pairs two same-side
 * images (avoids duplicating one face). Caps the result at 4.
 */
export function pickCardSiblings(fileId: string, rows: CardRow[]): PickResult {
  const opened = rows.find((r) => r.id === fileId);
  const openedType = opened ? cardTypeOf(opened) : '';
  if (!opened || !CARD_TYPES.has(openedType)) {
    return { type: openedType || null, side: null, orderedFileIds: [fileId] };
  }

  const idKey = ID_FIELD[openedType];
  const openedId = idKey ? digitsOnly(fieldValue(opened.suggested, idKey)) : '';
  const openedSide = cardSideOf(opened);
  const openedName = nameKey(fieldValue(opened.suggested, 'name'));

  const candidates = rows.filter((r) => {
    if (r.id === fileId || cardTypeOf(r) !== openedType) return false;
    if (openedId && openedId.length >= 4 && digitsOnly(fieldValue(r.suggested, idKey)) === openedId) return true;
    if (openedName.length >= 4) {
      const n = nameKey(fieldValue(r.suggested, 'name'));
      if (n.length >= 4 && (n === openedName || n.includes(openedName) || openedName.includes(n))) return true;
    }
    return false;
  });

  // Only pair with the opposite side; same-side candidates are duplicate faces.
  const opposite = candidates.filter((r) => cardSideOf(r) !== openedSide);
  const siblings = opposite.slice(0, 1);

  return {
    type: openedType,
    side: openedSide,
    orderedFileIds: [fileId, ...siblings.map((s) => s.id)].slice(0, 4),
  };
}
