/**
 * split-dob — Parse profile.dob and map DD/MM/YYYY (or Day/Month/Year) fields.
 *
 * Shared by the browser mapper bundle (esbuild) and extension-service WSS
 * (compiled to dist/ for Node 20 Docker).
 *
 * Many bank/insurance/gov forms split DOB into 3 small inputs.
 */

import type { FormField, Mapping, Profile } from './types.ts';
import { profileKeyAgreesWithField } from './field-ident.ts';

export interface DobParts {
  day: string;
  month: string;
  year: string;
}

export function parseDobParts(dob: unknown): DobParts | null {
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

/** Extractor-generated ids like ng-dd-10018 contain `\bdd\b` and must not look like DOB-day. */
const GENERATED_DD_ID_RE = /\b(?:ng-dd-|mat-select-|mat-input-|combobox-)\d+\b/gi;
const FULL_DATE_RE = /\bdd[\s_\-\/.]*mm[\s_\-\/.]*(?:yyyy|yyy)\b/i;
const NOT_DOB_RE = /\b(gender|sex|education board|matriculation|qualification|year of passing|highest level|nationality|country of nationality)\b/i;
const DOB_HINT_RE = /\b(date of birth|dob|birth date|birth_date|datebirth|day of birth|month of birth|year of birth)\b/i;

export function stripGeneratedWidgetIds(s: string): string {
  return String(s || '').replace(GENERATED_DD_ID_RE, ' ');
}

function locatorPlaceholder(field: FormField | null | undefined): string {
  const locs = (field as { locators?: Array<{ type?: string; value?: string }> } | null | undefined)?.locators;
  if (!Array.isArray(locs)) return '';
  for (let i = 0; i < locs.length; i++) {
    if (locs[i] && locs[i].type === 'placeholder' && locs[i].value) return String(locs[i].value);
  }
  return '';
}

export function isFullDateWidget(field: FormField | null | undefined): boolean {
  if (!field) return false;
  const lab = String(field.label || '').trim();
  const ck = String(field.canonicalKey || '');
  if ((ck === 'dob' || ck === 'date_of_birth') && !/^dd$|^day$|^mm$|^month$|^yyyy$|^yyy$|^year$/i.test(lab)) {
    // Stale canonicalKey dob on a Mobile Number widget must not look like a date.
    if (!profileKeyAgreesWithField(field, 'dob')) return false;
    return true;
  }
  const ph = `${field.placeholder || ''} ${locatorPlaceholder(field)}`;
  const blob = `${lab} ${ph}`;
  if (FULL_DATE_RE.test(blob)) return true;
  if (/date of birth|\bbirth date\b/i.test(lab) && !/^dd$|^day$/i.test(lab)) return true;
  if (/dateBirth|effectiveDate|jquerryEffectiveDate/i.test(`${field.id || ''} ${field.name || ''}`)) return true;
  return false;
}

/** Gender / board / year-of-passing / generated ng-dd ids must never take a DOB day slice. */
export function refusesDobSplit(field: FormField | null | undefined): boolean {
  if (!field) return true;
  const ck = String(field.canonicalKey || '');
  if (ck && ck !== 'dob' && ck !== 'date_of_birth') return true;
  const blob = stripGeneratedWidgetIds(
    [field.label, field.name, field.id, field.placeholder, field.selector].filter(Boolean).join(' '),
  );
  if (NOT_DOB_RE.test(blob) && !DOB_HINT_RE.test(blob) && !FULL_DATE_RE.test(blob)) return true;
  return false;
}

export function applySplitDob(
  formFields: FormField[],
  profile: Profile | null | undefined,
  mapping: Mapping,
): void {
  if (!profile || profile.dob == null || profile.dob === '') return;
  const dp = parseDobParts(profile.dob);
  if (!dp) return;

  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthShort = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthNum = parseInt(dp.month, 10) || 0;

  for (let di = 0; di < formFields.length; di++) {
    const df = formFields[di];
    if (!df || !df.selector || mapping[df.selector]) continue;

    if (refusesDobSplit(df) || isFullDateWidget(df)) continue;

    const lbl = String(df.label || '').trim();
    const idn = stripGeneratedWidgetIds(`${df.id || ''} ${df.name || ''}`).toLowerCase();
    const ph = String(df.placeholder || '').trim();
    const combined = stripGeneratedWidgetIds(`${lbl} ${ph} ${idn}`).toLowerCase();

    // Legacy parity: short canonical labels + id/name hints (ddl_day, birthday_dd, …)
    const isDay =
      /^dd$|^day$|^(\(?day\)?)$|day_of_birth|dob_day|birth_day|birthday_dd/i.test(lbl)
      || /^dd$|^day$/i.test(ph)
      || /(?:^|[^a-z])(dob_?day|birth_?day|day_of_birth|birthday_?dd|ddl_?day)(?:[^a-z]|$)/i.test(idn)
      || (/\bdd\b/.test(combined) && !FULL_DATE_RE.test(combined) && !/\bdd[\s_\-\/.]*mm/.test(combined) && !DOB_HINT_RE.test(`${lbl} ${ph}`));
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
