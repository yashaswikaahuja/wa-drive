/**
 * ng-option-scorer — Angular Dropdown Option Scorer
 *
 * Scores a dropdown option's text against a planned fill value to determine
 * how well they match. Returns a numeric score (0–100); higher is better.
 * Used when selecting the best option from an ng-dropdown / ng-select list.
 *
 * Also provides scoreAndPick(opts, planned) for picking the best option
 * from a list of {text, node} entries.
 *
 * Pure JS — no DOM, no Chrome, no kernel. Deterministic.
 *
 * Public API (on globalThis.CcNgOptionScorer):
 *   scoreOption(optText, planned) => number    (0–100)
 *   scoreAndPick(opts, planned, minScore?) => opt | null
 *
 * See ng-option-scorer.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Score how well `optText` matches `planned`.
   *
   * Scoring cascade (higher = better match):
   *   100 — exact match (case-insensitive)
   *    80 — one string contains the other
   *    70 — reverse-contains (optText in planned) with >3 chars
   *    60 — token overlap ≥2
   *    55 — education-level synonym match
   *    50 — single-token overlap when either string is short (≤2 tokens)
   *     0 — no match
   *
   * @param {string} optText  — option label text
   * @param {string} planned  — planned fill value
   * @returns {number} 0–100
   */
  function scoreOption(optText, planned) {
    var ot = String(optText || '').toLowerCase().trim();
    var v  = String(planned  || '').toLowerCase().trim();
    if (!ot || !v) return 0;
    if (ot === v) return 100;
    if (ot.includes(v)) return 80;
    if (v.includes(ot) && ot.length > 3) return 70;
    // Token overlap: split on common separators, require tokens > 2 chars
    var vToks = v.split(/[\s()+,/\-]+/).filter(function (t) { return t.length > 2; });
    var oToks = ot.split(/[\s()+,/\-]+/).filter(function (t) { return t.length > 2; });
    var overlap = vToks.filter(function (t) {
      return oToks.some(function (o) { return o.includes(t) || t.includes(o); });
    }).length;
    if (overlap >= 2) return 60;
    if (overlap === 1 && (vToks.length <= 2 || oToks.length <= 2)) return 50;
    // Education-level synonyms (common Indian government form variants)
    var EDU_SYNONYMS = [
      ['intermediate', 'higher secondary', '10+2', '12th', 'hsc', 'senior secondary'],
      ['matriculation', '10th', 'sslc', 'secondary', 'high school', 'class 10', 'class x'],
      ['graduation', 'graduate', 'degree', 'bachelor', 'ug'],
      ['post graduation', 'post graduate', 'masters', 'master', 'pg', 'm.a', 'm.sc', 'm.com'],
    ];
    for (var i = 0; i < EDU_SYNONYMS.length; i++) {
      var group = EDU_SYNONYMS[i];
      var vIn = group.some(function (s) { return v.includes(s); });
      var oIn = group.some(function (s) { return ot.includes(s); });
      if (vIn && oIn) return 55;
    }
    return 0;
  }

  /**
   * Pick the best option from a list.
   *
   * @param {Array<{text: string, node: *}>} opts  — list of candidates
   * @param {string} planned                        — planned fill value
   * @param {number} [minScore=50]                  — minimum score to accept
   * @returns {{text, node, score} | null}
   */
  function scoreAndPick(opts, planned, minScore) {
    minScore = (typeof minScore === 'number') ? minScore : 50;
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < opts.length; i++) {
      var score = scoreOption(opts[i].text, planned);
      if (score > bestScore) {
        bestScore = score;
        best = opts[i];
      }
    }
    if (bestScore >= minScore) {
      return Object.assign({ score: bestScore }, best);
    }
    return null;
  }

  root.CcNgOptionScorer = {
    scoreOption: scoreOption,
    scoreAndPick: scoreAndPick,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcNgOptionScorer;
