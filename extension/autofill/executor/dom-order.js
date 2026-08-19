/**
 * getEl + PRIORITY_KEYS + DOM-order entries
 * Part of sequential kernel — load before autofill/executor.js
 */
(function (root) {
  'use strict';
  root.CcExecParts = root.CcExecParts || {};
  root.CcExecParts.installDomOrder = function (k) {

    function getEl(sel) {
      if (sel.startsWith('form-field-')) {
        const all = document.querySelectorAll('input[type=text],input[type=email],input[type=tel],input[type=number],input[type=date],input[type=radio],input[type=checkbox],input:not([type]),textarea,select');
        return all[parseInt(sel.split('-')[2])];
      }
      if (sel.startsWith('ng-dropdown-')) return document.querySelectorAll('div.ng-dropdown')[parseInt(sel.split('-')[2])];
      return document.querySelector(sel);
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
