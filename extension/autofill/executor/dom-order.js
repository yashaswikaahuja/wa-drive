/**
 * getEl + PRIORITY_KEYS + DOM-order entries
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installDomOrder = function (k) {

    // resolve-cc-selector.js is the single owner of cc-style selector resolution.
    // It must be loaded before dom-order.js (see build-executor-bundle.mjs ORDER).
    var _resolve = root.CcResolveCcSelector
      ? root.CcResolveCcSelector.resolveCcSelector
      : function (sel) { return document.querySelector(sel); }; // safe fallback

    function getEl(sel) {
      return _resolve(sel);
    }
    k.getEl = getEl;
    // PRIORITY_KEYS: keywords used to detect cascade-geography fields during DOM sort.
    // Derived from the single authoritative source: cascade-field-level.js
    // Kept as a flat keyword array for the sort classifier (field label contains any of these).
    k.PRIORITY_KEYS = [
      'state', 'rajya', 'राज्य',
      'district', 'jila', 'जिला',
      'sub_division', 'subdivision', 'sub-division', 'अनुमंडल',
      'block', 'prakhand', 'प्रखंड',
      'panchayat', 'village_panchayat', 'पंचायत',
      'village', 'gram', 'ग्राम', 'mohalla', 'मोहल्ला',
      'tehsil', 'taluka', 'तहसील',
      'police_station', 'police-station', 'thana', 'थाना',
      'post_office', 'post-office', 'डाक घर',
      'pin_code', 'pincode', 'पिन',
      'municipal', 'नगर',
    ];
    k.entries = Object.entries(k.mapping || {});
    k.entries.sort(([sa], [sb]) => {
      const a = getEl(sa), b = getEl(sb);
      if (!a || !b) return 0;
      if (a === b) return 0;
      if (typeof a.compareDocumentPosition !== 'function') return 0;
      const following = (typeof Node !== 'undefined' && Node.DOCUMENT_POSITION_FOLLOWING) || 4;
      return a.compareDocumentPosition(b) & following ? -1 : 1;
    });

  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
