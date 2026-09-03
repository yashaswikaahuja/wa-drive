/** Mapping relation helpers for Admin Mappings (#303) — mirrors #302 apply kinds. */

export type RelationKind =
  | 'identity'
  | 'last_n'
  | 'first_n'
  | 'date_part'
  | 'email_local'
  | 'name_part'
  | 'unknown';

export interface MappingRelation {
  kind: RelationKind;
  n?: number;
  part?: string;
  pad?: number;
}

const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function normalizeRelation(raw: MappingRelation | null | undefined, profileKey: string | null): MappingRelation {
  if (raw && raw.kind) return { ...raw };
  if (!profileKey) return { kind: 'unknown' };
  return { kind: 'identity' };
}

export function formatRelation(rel: MappingRelation | null | undefined): string {
  if (!rel || !rel.kind) return '—';
  switch (rel.kind) {
    case 'identity':
      return 'whole';
    case 'last_n':
      return `last_n(${rel.n ?? '?'})`;
    case 'first_n':
      return `first_n(${rel.n ?? '?'})`;
    case 'date_part':
      return `date_part(${rel.part || '?'})`;
    case 'email_local':
      return 'email_local';
    case 'name_part':
      return `name_part(${rel.part || '?'})`;
    case 'unknown':
      return 'unknown';
    default:
      return String(rel.kind);
  }
}

export function statusFromSource(source?: string | null): { label: string; tone: string } {
  const s = (source || '').toLowerCase();
  if (s === 'manual' || s === 'confirmed') return { label: 'Manual', tone: 'text-emerald-400' };
  if (s === 'agent' || s === 'server-ai' || s === 'ai') return { label: 'AI', tone: 'text-sky-400' };
  if (s === 'auto-correction' || s === 'correction') return { label: 'Correction', tone: 'text-amber-400' };
  if (s === 'backfill' || s === 'heuristic' || s === 'seed') return { label: 'Learned', tone: 'text-violet-400' };
  if (!s) return { label: 'Unset', tone: 'text-gray-500' };
  return { label: s, tone: 'text-gray-400' };
}

export function flattenProfileData(data: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data || typeof data !== 'object') return out;
  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    if (typeof v === 'object' && v && 'value' in (v as object)) {
      const val = (v as { value: unknown }).value;
      if (val != null && String(val).trim() !== '') out[k] = String(val).trim();
    } else if (typeof v !== 'object') {
      const s = String(v).trim();
      if (s) out[k] = s;
    }
  }
  return out;
}

function parseDobParts(dob: string): { day: string; month: string; year: string } | null {
  const m1 = dob.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  const m2 = dob.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m1) return { day: m1[1].padStart(2, '0'), month: m1[2].padStart(2, '0'), year: m1[3] };
  if (m2) return { day: m2[3].padStart(2, '0'), month: m2[2].padStart(2, '0'), year: m2[1] };
  return null;
}

/** Preview planned value for admin table (null if cannot derive). */
export function previewRelation(
  profileFlat: Record<string, string>,
  profileKey: string | null | undefined,
  relation: MappingRelation | null | undefined
): string | null {
  if (!profileKey) return null;
  const atom = profileFlat[profileKey];
  if (atom == null || atom === '') return null;
  const rel = normalizeRelation(relation, profileKey);
  switch (rel.kind) {
    case 'identity':
      return atom;
    case 'last_n': {
      const n = Math.max(1, Number(rel.n) || 0);
      if (!n || atom.length < n) return null;
      return atom.slice(-n);
    }
    case 'first_n': {
      const n = Math.max(1, Number(rel.n) || 0);
      if (!n || atom.length < n) return null;
      return atom.slice(0, n);
    }
    case 'date_part': {
      const dp = parseDobParts(atom);
      if (!dp) return null;
      if (rel.part === 'day') return dp.day;
      if (rel.part === 'month') {
        const num = parseInt(dp.month, 10) || 0;
        return MONTH_NAMES[num] || dp.month;
      }
      if (rel.part === 'year') return dp.year;
      return null;
    }
    case 'email_local': {
      const at = atom.indexOf('@');
      if (at <= 0) return null;
      return atom.slice(0, at);
    }
    case 'name_part': {
      const parts = atom.split(/\s+/).filter(Boolean);
      if (!parts.length) return null;
      if (rel.part === 'first') return parts[0];
      if (rel.part === 'last') return parts[parts.length - 1];
      if (rel.part === 'middle') return parts.length >= 3 ? parts.slice(1, -1).join(' ') : '';
      return null;
    }
    case 'unknown':
    default:
      return null;
  }
}

export const RELATION_KIND_OPTIONS: { kind: RelationKind; label: string }[] = [
  { kind: 'identity', label: 'Whole value' },
  { kind: 'last_n', label: 'Last N characters' },
  { kind: 'first_n', label: 'First N characters' },
  { kind: 'date_part', label: 'Date part' },
  { kind: 'email_local', label: 'Email local-part' },
  { kind: 'name_part', label: 'Name part' },
  { kind: 'unknown', label: 'Unknown (AI next fill)' },
];
