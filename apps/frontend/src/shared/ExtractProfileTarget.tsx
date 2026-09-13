import { useEffect, useMemo, useState } from 'react';
import api from './api';

export type ExtractSaveTarget = {
  /** When true, save onto chosenPersonId (required). */
  chooseProfile: boolean;
  chosenPersonId: string | null;
  chosenLabel: string | null;
};

type PersonOpt = {
  id: string;
  label: string;
  phone: string;
  relationship?: string;
};

function phoneDigits(p: string) {
  return String(p || '').replace(/\D/g, '');
}

function phonesMatch(a: string, b: string) {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  // India: match last 10 digits
  return da.slice(-10) === db.slice(-10) && da.slice(-10).length === 10;
}

/**
 * Checkbox + searchable profile dropdown for manual extract save.
 * Only lists household members that share `phone` (same WA customer), not the whole workspace.
 */
export function ExtractProfileTarget({
  value,
  onChange,
  hint,
  phone,
}: {
  value: ExtractSaveTarget;
  onChange: (v: ExtractSaveTarget) => void;
  hint?: string;
  /** Restrict list to this customer's phone / household. */
  phone?: string | null;
}) {
  const [people, setPeople] = useState<PersonOpt[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!value.chooseProfile) return;
    setLoading(true);
    api.get('/customers/households', { skipErrorToast: true } as any)
      .then((r) => {
        const opts: PersonOpt[] = [];
        for (const h of r.data || []) {
          // Only same phone household (common number with the document / chat)
          if (phone && !phonesMatch(h.phone, phone)) continue;
          for (const p of h.persons || []) {
            opts.push({
              id: p.id,
              phone: h.phone,
              relationship: p.relationship,
              label: `${p.displayLabel || p.name || 'Unnamed'}${p.relationship ? ` (${p.relationship})` : ''}`,
            });
          }
        }
        setPeople(opts);
      })
      .catch(() => setPeople([]))
      .finally(() => setLoading(false));
  }, [value.chooseProfile, phone]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return people;
    return people.filter((p) => p.label.toLowerCase().includes(s));
  }, [people, q]);

  return (
    <div
      className="rounded-xl border p-3 mb-4 space-y-2"
      style={{ borderColor: 'hsl(var(--pt-border))', background: 'hsl(var(--pt-card) / 0.4)' }}
    >
      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          className="mt-0.5 accent-[#0a84ff]"
          checked={value.chooseProfile}
          onChange={(e) =>
            onChange({
              chooseProfile: e.target.checked,
              chosenPersonId: e.target.checked ? value.chosenPersonId : null,
              chosenLabel: e.target.checked ? value.chosenLabel : null,
            })
          }
        />
        <span>
          <span className="text-sm text-gray-200">Choose which profile to add these details to</span>
          <span className="block text-[11px] text-gray-500 mt-0.5">
            {hint
              || (phone
                ? `Only people under ${phone} — use when the document has no name, or you want a specific family member.`
                : 'Use when the document has no name, or you want a specific person (not the open profile).')}
          </span>
        </span>
      </label>

      {value.chooseProfile && (
        <div className="space-y-2 pt-1">
          {!phone && (
            <p className="text-[11px] text-amber-400">No phone on this document — cannot list household members.</p>
          )}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name…"
            className="input-field text-xs w-full"
            autoFocus
          />
          <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10">
            {loading && <p className="text-xs text-gray-500 p-2">Loading profiles…</p>}
            {!loading && filtered.length === 0 && (
              <p className="text-xs text-gray-500 p-2">
                {phone ? 'No profiles on this phone yet' : 'No profiles match'}
              </p>
            )}
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  onChange({
                    chooseProfile: true,
                    chosenPersonId: p.id,
                    chosenLabel: p.label,
                  })
                }
                className={`w-full text-left px-3 py-2 text-xs border-b border-white/5 last:border-0 ${
                  value.chosenPersonId === p.id
                    ? 'bg-[#0a84ff]/20 text-white'
                    : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {value.chosenLabel && (
            <p className="text-[11px] text-emerald-400">Selected: {value.chosenLabel}</p>
          )}
        </div>
      )}
    </div>
  );
}
