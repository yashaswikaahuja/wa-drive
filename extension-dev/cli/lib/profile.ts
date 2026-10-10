import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load profile file for /fill-plan.
 * Accepts:
 *   { id, data: { full_name: "...", ... } }
 *   { full_name: "...", ... }  // flat profile used as data
 */
export function loadProfile(path) {
  const abs = resolve(path);
  const raw = JSON.parse(readFileSync(abs, 'utf8'));
  if (!raw || typeof raw !== 'object') throw new Error('profile JSON must be an object');

  let id = raw.id || raw.profileId || null;
  let data = raw.data && typeof raw.data === 'object' ? raw.data : null;
  if (!data) {
    // flat map — strip common metadata keys
    data = { ...raw };
    delete data.id;
    delete data.profileId;
    delete data.name;
    delete data.displayLabel;
  }

  // Flatten nested { value } shapes like extension does
  const flat = {};
  for (const [k, v] of Object.entries(data)) {
    flat[k] = v && typeof v === 'object' && 'value' in v ? v.value : v;
  }
  if (raw.name) flat.name = flat.name || raw.name;

  return {
    id,
    name: raw.name || flat.name || null,
    data: flat,
    flat, // body.profile for fill-plan
  };
}
