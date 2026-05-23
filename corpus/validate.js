#!/usr/bin/env node
// corpus/validate.js — Runs the current extractor against every saved snapshot
// and diffs against the expected.json ground truth.
//
// Usage:
//   node corpus/validate.js [--site ssc.gov.in]
//
// Exit code: 0 if all sites pass, non-zero if any fail.

import { readFile, readdir, stat } from 'fs/promises';
import { resolve } from 'path';
import { JSDOM } from 'jsdom';

const args = process.argv.slice(2);
const filterSite = args[args.indexOf('--site') + 1] || null;

const sitesDir = resolve(import.meta.dirname, 'sites');
const extractorSrc = await readFile(resolve(import.meta.dirname, '../extension/autofill/extractor.js'), 'utf8');

let totalFailed = 0;
let totalRun = 0;

const sites = await readdir(sitesDir);
for (const site of sites) {
  if (filterSite && site !== filterSite) continue;
  const siteDir = resolve(sitesDir, site);
  const s = await stat(siteDir).catch(() => null);
  if (!s?.isDirectory()) continue;
  const files = await readdir(siteDir);
  for (const f of files.filter(f => f.endsWith('.html'))) {
    totalRun++;
    const slug = f.slice(0, -5);
    const html = await readFile(resolve(siteDir, f), 'utf8');
    const expectedPath = resolve(siteDir, slug + '.expected.json');
    let expected = null;
    try { expected = JSON.parse(await readFile(expectedPath, 'utf8')); } catch {}

    // Run extractor in a JSDOM
    const dom = new JSDOM(html, { url: 'https://' + site + '/' });
    const w = dom.window;
    // Make extractor's globals available
    Object.assign(global, { window: w, document: w.document, location: w.location, HTMLInputElement: w.HTMLInputElement });
    // Inject extractor.js
    const fn = new Function(extractorSrc + '\n;return extractFormFieldsWithFingerprint();');
    let actual;
    try { actual = fn(); }
    catch (e) { console.error(`✗ ${site}/${slug}: extractor threw: ${e.message}`); totalFailed++; continue; }

    if (!expected) {
      // Bootstrap mode: print the actual so user can save it as expected
      console.log(`! ${site}/${slug}: no expected.json. Extracted ${actual.formFields.length} fields. Sample:`);
      console.log(JSON.stringify({
        formKey: actual.formKey,
        semanticFormKey: actual.semanticFormKey,
        fieldsByType: actual.formFields.reduce((m, f) => ({ ...m, [f.type]: (m[f.type] || 0) + 1 }), {}),
        fields: actual.formFields.slice(0, 30).map(f => ({ type: f.type, label: f.label, selector: f.selector })),
      }, null, 2));
      continue;
    }

    // Diff
    const actualByType = actual.formFields.reduce((m, f) => ({ ...m, [f.type]: (m[f.type] || 0) + 1 }), {});
    let ok = true;
    const issues = [];
    for (const [type, expectedCount] of Object.entries(expected.fieldsByType || {})) {
      const got = actualByType[type] || 0;
      if (got !== expectedCount) { ok = false; issues.push(`${type}: expected ${expectedCount}, got ${got}`); }
    }
    if (expected.minFields && actual.formFields.length < expected.minFields) {
      ok = false; issues.push(`total fields ${actual.formFields.length} < min ${expected.minFields}`);
    }
    if (ok) {
      console.log(`✓ ${site}/${slug}: ${actual.formFields.length} fields, types ok`);
    } else {
      totalFailed++;
      console.error(`✗ ${site}/${slug}: ${issues.join('; ')}`);
    }
  }
}

console.log(`\n${totalRun - totalFailed}/${totalRun} passed${totalFailed ? `, ${totalFailed} FAILED` : ''}.`);
process.exit(totalFailed ? 1 : 0);
