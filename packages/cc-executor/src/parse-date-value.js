/**
 * parse-date-value — Profile Date String Parser
 *
 * Parses a raw date string from a profile (which may be in DD/MM/YYYY,
 * DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, YYYY/MM/DD, or other formats) and
 * converts it to the format a specific date widget needs.
 *
 * Used by fill-one-date.js for flatpickr, jQuery UI datepicker, Angular
 * Material mat-datepicker, and native <input type="date"> handling.
 * Previously duplicated 3× inline in the same file.
 *
 * No DOM, no kernel, no Chrome APIs. Pure JS date parsing.
 *
 * Public API (on globalThis.CcParseDateValue):
 *   parseDateValue(value) => { dateObj, isoDate, isoMonth, isoDatetime }
 *
 * See parse-date-value.md for full documentation.
 */
(function (root) {
  'use strict';

  /**
   * Parse a raw date string from a profile into multiple output formats.
   *
   * Recognized input formats:
   *   DD/MM/YYYY  DD-MM-YYYY  DD.MM.YYYY   (Indian/European day-first)
   *   YYYY/MM/DD  YYYY-MM-DD  YYYY.MM.DD   (ISO-ish year-first)
   *   Any string parseable by new Date(value) as fallback
   *
   * Returns an object with:
   *   dateObj   {Date|null}   — a JS Date (null if parsing failed)
   *   isoDate   {string}      — 'YYYY-MM-DD' or '' on failure
   *   isoMonth  {string}      — 'YYYY-MM' or '' on failure
   *   isoDatetime {string}    — 'YYYY-MM-DDTHH:MM' (appends T00:00) or ''
   *
   * Never throws. Returns all-empty result on null/invalid input.
   *
   * @param {string|null|undefined} value
   * @returns {{ dateObj: Date|null, isoDate: string, isoMonth: string, isoDatetime: string }}
   */
  function parseDateValue(value) {
    var empty = { dateObj: null, isoDate: '', isoMonth: '', isoDatetime: '' };
    if (value == null || value === '') return empty;

    var str = String(value).trim();
    if (!str) return empty;

    var dateObj = null;

    // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (day-first, Indian/European format)
    var ddmmyyyy = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (ddmmyyyy) {
      dateObj = new Date(+ddmmyyyy[3], +ddmmyyyy[2] - 1, +ddmmyyyy[1]);
    }

    // YYYY/MM/DD, YYYY-MM-DD, YYYY.MM.DD (ISO-ish, year-first)
    var yyyymmdd = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (!dateObj && yyyymmdd) {
      dateObj = new Date(+yyyymmdd[1], +yyyymmdd[2] - 1, +yyyymmdd[3]);
    }

    // Fallback: let JS Date constructor try
    if (!dateObj) {
      var d = new Date(str);
      if (!isNaN(d.getTime())) dateObj = d;
    }

    if (!dateObj || isNaN(dateObj.getTime())) return empty;

    var year  = dateObj.getFullYear();
    var month = String(dateObj.getMonth() + 1).padStart(2, '0');
    var day   = String(dateObj.getDate()).padStart(2, '0');

    var isoDate     = year + '-' + month + '-' + day;
    var isoMonth    = year + '-' + month;
    var isoDatetime = isoDate + 'T00:00';

    return { dateObj: dateObj, isoDate: isoDate, isoMonth: isoMonth, isoDatetime: isoDatetime };
  }

  root.CcParseDateValue = {
    parseDateValue: parseDateValue,
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof module !== 'undefined') module.exports = root.CcParseDateValue;
