/**
 * split-dob — Parse profile.dob and map DD/MM/YYYY (or Day/Month/Year) fields.
 *
 * Plain JS so both the browser mapper bundle and extension-service WSS can share
 * the same root module (no TypeScript / strip-types required at runtime).
 *
 * Many bank/insurance/gov forms split DOB into 3 small inputs.
 */

/**
 * @param {unknown} dob
 * @returns {{ day: string, month: string, year: string } | null}
 */
export function parseDobParts(dob) {
  if (dob == null) return null;
  const dobStr = String(dob).trim();
  if (!dobStr) return null;
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const m1 = dobStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  // yyyy-mm-dd / yyyy/mm/dd / yyyy.mm.dd
  const m2 = dobStr.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m1) return { day: m1[1].padStart(2, '0'), month: m1[2].padStart(2, '0'), year: m1[3] };
  if (m2) return { day: m2[3].padStart(2, '0'), month: m2[2].padStart(2, '0'), year: m2[1] };
  return null;
}

/**
 * @param {Array<{ selector: string, label?: string, id?: string, name?: string, placeholder?: string, type?: string }>} formFields
 * @param {{ dob?: unknown }} profile
 * @param {Record<string, object>} mapping
 */
export function applySplitDob(formFields, profile, mapping) {
  if (!profile || !profile.dob) return;
  const dp = parseDobParts(profile.dob);
  if (!dp) return;

  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthShort = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthNum = parseInt(dp.month, 10) || 0;

  for (let di = 0; di < formFields.length; di++) {
    const df = formFields[di];
    if (!df || !df.selector || mapping[df.selector]) continue;

    const lbl = String(df.label || '').trim();
    const idn = `${df.id || ''} ${df.name || ''}`.toLowerCase();
    const ph = String(df.placeholder || '').trim();
    const combined = `${lbl} ${ph} ${idn}`.toLowerCase();

    // Legacy parity: short canonical labels + id/name hints (ddl_day, birthday_dd, …)
    const isDay =
      /^dd$|^day$|^(\(?day\)?)$|day_of_birth|dob_day|birth_day|birthday_dd/i.test(lbl)
      || /^dd$|^day$/i.test(ph)
      || /(?:^|[^a-z])(dob_?day|birth_?day|day_of_birth|birthday_?dd|ddl_?day)(?:[^a-z]|$)/i.test(idn)
      || (/\bdd\b/.test(combined) && !/\bdd[\s_-]*mm/.test(combined));
    const isMonth =
      /^mm$|^month$|^(\(?month\)?)$|month_of_birth|dob_month|birth_month/i.test(lbl)
      || /^mm$|^month$/i.test(ph)
      || /(?:^|[^a-z])(dob_?month|birth_?month|month_of_birth|ddl_?month)(?:[^a-z]|$)/i.test(idn)
      || (/\bmm\b/.test(combined) && !/\bdd[\s_-]*mm[\s_-]*yyyy/.test(combined) && !isDay);
    const isYear =
      /^yyyy$|^yyy$|^year$|^(\(?year\)?)$|year_of_birth|dob_year|birth_year/i.test(lbl)
      || /^yyyy$|^year$/i.test(ph)
      || /(?:^|[^a-z])(dob_?year|birth_?year|year_of_birth|ddl_?year)(?:[^a-z]|$)/i.test(idn);

    if (isDay) {
      const preferPadded = /^dd$/i.test(lbl) || /^dd$/i.test(ph) || (df.type || '') === 'text';
      mapping[df.selector] = {
        value: preferPadded ? dp.day : String(parseInt(dp.day, 10)),
        type: df.type || '',
        label: df.label || null,
        profileKey: 'dob',
        matchBy: 'split-dob',
      };
    } else if (isMonth) {
      const t = String(df.type || '').toLowerCase();
      const monthVal = (t === 'select' || t === 'dropdown' || t === 'mat-select' || t === 'ng-dropdown')
        ? (monthNames[monthNum] || dp.month)
        : dp.month;
      mapping[df.selector] = {
        value: monthVal,
        type: df.type || '',
        label: df.label || null,
        profileKey: 'dob',
        matchBy: 'split-dob',
        monthNum,
        monthShort: monthShort[monthNum],
      };
    } else if (isYear) {
      mapping[df.selector] = {
        value: dp.year,
        type: df.type || '',
        label: df.label || null,
        profileKey: 'dob',
        matchBy: 'split-dob',
      };
    }
  }
}
