// ═══════════════════════════════════════════════════════════════════════════
// MEMORY — what the system has learned. (Primitive 5 of 6)
// ═══════════════════════════════════════════════════════════════════════════
// The single source of truth for: option matching, synonym knowledge, saved
// field→record mappings, and learning capture. Consolidates the 4 previously
// duplicated matchers (executor, ng-dropdown, cascade-select, select driver)
// into ONE scoped matchOption().
//
// Knowledge is SCOPED (global → domain → portal → form) and the most specific
// applicable knowledge wins. Runs in page context; plain globals (no modules).
// ───────────────────────────────────────────────────────────────────────────

(function () {
  if (window.CCMemory) return;

  // ── Deterministic synonym dictionary (domain-scoped) ──────────────────────
  // Government forms use a closed, repeating vocabulary. Deterministic > AI.
  // Seeded here; the server distributes additions learned from corrections.
  const SYNONYMS = {
    education: [
      ['matriculation', '10th', 'sslc', 'secondary', 'high school', 'class 10', 'class x', 'madhyamik'],
      ['intermediate', 'higher secondary', '10+2', '12th', 'hsc', 'senior secondary', 'class 12', 'class xii', 'plus two'],
      ['graduation', 'graduate', 'degree', 'bachelor', 'ug', 'under graduate'],
      ['post graduation', 'post graduate', 'masters', 'pg', 'ma', 'msc', 'mcom'],
      ['diploma', 'polytechnic'],
      ['doctorate', 'phd', 'ph.d'],
    ],
    category: [
      ['general', 'gen', 'ur', 'unreserved'],
      ['obc', 'other backward class', 'other backward classes', 'bc', 'backward'],
      ['sc', 'scheduled caste', 'scheduled castes'],
      ['st', 'scheduled tribe', 'scheduled tribes'],
      ['ews', 'economically weaker section'],
    ],
    gender: [
      ['male', 'm', 'purush', 'पुरुष'],
      ['female', 'f', 'mahila', 'stri', 'महिला'],
      ['transgender', 'other', 'third gender', 'transgender/other'],
    ],
    yesno: [
      ['yes', 'y', 'true', 'haan', 'हाँ'],
      ['no', 'n', 'false', 'nahi', 'नहीं'],
    ],
    maritalStatus: [
      ['single', 'unmarried', 'never married'],
      ['married', 'wedded'],
      ['divorced'],
      ['widowed', 'widow', 'widower'],
    ],
  };

  // Runtime-loaded, scoped translations (profileValue → formOptionText),
  // distributed by the server. { scopeKey: { fromValueNorm: toOptionText } }
  let TRANSLATIONS = {};   // global scope translations (from /mappings/translations)
  let SAVED = {};          // saved mappings for the current form
  let FORM_KEY = null;

  const norm = (s) => (s == null ? '' : String(s)).toLowerCase().replace(/[^a-z0-9\u0900-\u097F]+/g, ' ').trim();
  const squash = (s) => norm(s).replace(/\s+/g, '');

  // Are two terms synonyms within any domain (or a specific one)?
  function areSynonyms(a, b, domain) {
    const na = norm(a), nb = norm(b);
    if (!na || !nb) return false;
    const domains = domain ? [domain] : Object.keys(SYNONYMS);
    for (const d of domains) {
      const groups = SYNONYMS[d] || [];
      for (const g of groups) {
        const inA = g.some(t => na.includes(t) || t.includes(na));
        const inB = g.some(t => nb.includes(t) || t.includes(nb));
        if (inA && inB) return true;
      }
    }
    return false;
  }

  // ── THE unified option matcher ────────────────────────────────────────────
  // Scoring cascade: translation → exact → normalized → contains → reverse →
  // token overlap → domain synonyms. Returns the best matching option or null.
  // `opts` may be strings OR elements ({textContent}). Returns the same item.
  function matchOption(value, opts, ctx) {
    if (value == null || !opts || !opts.length) return null;
    ctx = ctx || {};
    const domain = ctx.domain || null;
    const textOf = (o) => (typeof o === 'string' ? o : (o && o.textContent) || '').trim();
    const v = String(value).trim();
    const vn = norm(v), vs = squash(v);
    if (!vn) return null;

    // Translation first (scoped profileValue → option text)
    const tr = TRANSLATIONS[v] || TRANSLATIONS[vn];
    if (tr) {
      const hit = opts.find(o => squash(textOf(o)) === squash(tr));
      if (hit) return hit;
    }

    let best = null, bestScore = 0;
    for (const o of opts) {
      const ot = textOf(o); if (!ot) continue;
      const on = norm(ot), os = squash(ot);
      let score = 0;
      if (os === vs) score = 100;
      else if (on === vn) score = 95;
      else if (on.includes(vn)) score = 80;
      else if (vn.includes(on) && on.length > 3) score = 70;
      else {
        const vTok = vn.split(' ').filter(t => t.length > 2);
        const oTok = on.split(' ').filter(t => t.length > 2);
        const overlap = vTok.filter(t => oTok.some(x => x.includes(t) || t.includes(x))).length;
        if (overlap >= 2) score = 60;
        else if (overlap === 1 && (vTok.length <= 2 || oTok.length <= 2)) score = 50;
        else if (areSynonyms(v, ot, domain)) score = 55;
      }
      if (score > bestScore) { bestScore = score; best = o; }
    }
    return bestScore >= 50 ? best : null;
  }

  // ── Saved knowledge access ────────────────────────────────────────────────
  async function load(backendUrl, headers, formKey) {
    FORM_KEY = formKey;
    try {
      const r = await fetch(backendUrl + '/mappings/translations', { headers });
      TRANSLATIONS = (await r.json()) || {};
    } catch { TRANSLATIONS = {}; }
    try {
      const r = await fetch(backendUrl + '/mappings/' + formKey, { headers });
      const data = await r.json();
      SAVED = (data && typeof data === 'object') ? data : {};
    } catch { SAVED = {}; }
    return { savedCount: Object.keys(SAVED).filter(k => k !== '_meta').length, translationCount: Object.keys(TRANSLATIONS).length };
  }

  // Recall the saved mapping/rule for a field by its semantic key.
  function recall(semanticKey) {
    return SAVED[semanticKey] || null;
  }

  // Confidence of a saved mapping (fills vs corrections). manual/confirmed = 1.
  function confidenceOf(entry) {
    if (!entry) return 0;
    if (entry.source === 'manual' || entry.source === 'confirmed') return 1;
    const f = entry.fills || 0, c = entry.corrections || 0;
    if (f + c === 0) return entry.profileKey ? 0.5 : 0;
    return Math.max(0, Math.min(1, f / (f + c * 3)));
  }

  window.CCMemory = {
    load, recall, confidenceOf, matchOption, areSynonyms, norm, squash,
    get translations() { return TRANSLATIONS; },
    get saved() { return SAVED; },
    get formKey() { return FORM_KEY; },
    _synonyms: SYNONYMS,
  };
})();
