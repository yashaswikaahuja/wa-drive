# parse-date-value — Profile Date String Parser

## Purpose

Parses a raw date string as stored in a profile (e.g. `'15/08/2001'`, `'2001-08-15'`) and converts it to the formats required by different date picker widgets. Previously this parsing was written identically 3 times inside `fill-one-date.js` — once for flatpickr, once for jQuery UI, once for native date inputs.

---

## Public API

Registered on `globalThis.CcParseDateValue`:

```js
parseDateValue(value) => { dateObj, isoDate, isoMonth, isoDatetime }
```

---

## Input

| Parameter | Type | Description |
|-----------|------|-------------|
| `value` | `string\|null\|undefined` | Raw date string from profile |

---

## Output

```js
{
  dateObj:     Date | null,  // JS Date object, or null if parsing failed
  isoDate:     string,       // 'YYYY-MM-DD' or '' on failure
  isoMonth:    string,       // 'YYYY-MM' or '' on failure
  isoDatetime: string,       // 'YYYY-MM-DDTHH:MM' (always T00:00) or '' on failure
}
```

---

## Recognized Input Formats

| Format | Example | Type |
|--------|---------|------|
| DD/MM/YYYY | `15/08/2001` | Indian/European day-first |
| DD-MM-YYYY | `15-08-2001` | Indian/European day-first |
| DD.MM.YYYY | `15.08.2001` | Indian/European day-first |
| YYYY/MM/DD | `2001/08/15` | ISO-ish year-first |
| YYYY-MM-DD | `2001-08-15` | ISO standard |
| YYYY.MM.DD | `2001.08.15` | ISO-ish year-first |
| Other | `15 Aug 2001` | Fallback via `new Date(value)` |

The day-first patterns (`DD/MM/YYYY`) are tried first since Indian government forms use this format.

---

## What This Capability Owns

- All date string pattern recognition
- Conversion to `Date` object
- ISO date/month/datetime formatting

## What This Capability Does NOT Own

- Knowing which widget type is being filled (that is `fill-one-date.js`)
- Calling picker APIs (flatpickr, jQuery UI)
- Setting input values

---

## Dependencies

None — pure JS, no DOM, no imports.

---

## Previous Duplication

Identical `ddmmyyyy` + `yyyymmdd` regex blocks existed in 3 places in `fill-one-date.js`:
- Lines 29–34 (flatpickr path)
- Lines 51–56 (jQuery UI path)
- Lines 94–110 (native date input path — also had ISO conversion)

After extraction all three delegate to `parseDateValue`.

---

## Null / Invalid Behavior

- `parseDateValue(null)` → `{ dateObj: null, isoDate: '', ... }`
- `parseDateValue('')` → `{ dateObj: null, isoDate: '', ... }`
- `parseDateValue('invalid')` → `{ dateObj: null, isoDate: '', ... }`
- `parseDateValue('31/02/2001')` → invalid Date (Feb 31 doesn't exist); `dateObj` will be invalid Date, `isoDate` will be `''`
- Never throws

---

## Examples

```js
const { parseDateValue } = CcParseDateValue;

parseDateValue('15/08/2001')
// { dateObj: Date(2001-08-15), isoDate: '2001-08-15', isoMonth: '2001-08', isoDatetime: '2001-08-15T00:00' }

parseDateValue('2001-08-15')
// { dateObj: Date(2001-08-15), isoDate: '2001-08-15', isoMonth: '2001-08', isoDatetime: '2001-08-15T00:00' }

parseDateValue(null)
// { dateObj: null, isoDate: '', isoMonth: '', isoDatetime: '' }

parseDateValue('invalid')
// { dateObj: null, isoDate: '', isoMonth: '', isoDatetime: '' }
```
