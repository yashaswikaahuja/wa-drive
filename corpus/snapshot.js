#!/usr/bin/env node
// corpus/snapshot.js — Capture a live form page into the corpus
//
// Usage:
//   node corpus/snapshot.js <slug> [--port 9222]
//   slug example: ssc.gov.in/scribe-otr
//
// Requires: a Chrome on --remote-debugging-port=9222 with the form loaded.
// Picks the active tab whose URL matches the slug's hostname.

import CDP from 'chrome-remote-interface';
import { writeFile, mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';

const args = process.argv.slice(2);
const slug = args[0];
const port = Number(args.find((a, i) => args[i - 1] === '--port')) || 9222;

if (!slug) {
  console.error('Usage: node corpus/snapshot.js <hostname>/<form-slug> [--port 9222]');
  process.exit(1);
}

const [hostname, formSlug] = slug.split('/');
if (!hostname || !formSlug) {
  console.error('Slug must be hostname/form-slug, e.g. ssc.gov.in/scribe-otr');
  process.exit(1);
}

const targets = await CDP.List({ host: '127.0.0.1', port });
const tab = targets.find(t => t.type === 'page' && t.url.includes(hostname));
if (!tab) {
  console.error(`No tab found for hostname '${hostname}'. Open the form in Chrome first.`);
  console.error('Tabs:'); targets.forEach(t => t.type === 'page' && console.error(' -', t.url));
  process.exit(1);
}

console.error(`Capturing: ${tab.url}`);
const client = await CDP({ target: tab.webSocketDebuggerUrl });
await client.Runtime.enable();

const snapshot = await client.Runtime.evaluate({
  expression: `(() => ({
    url: location.href,
    title: document.title,
    html: document.documentElement.outerHTML,
  }))()`,
  returnByValue: true,
});

const dir = resolve(import.meta.dirname, 'sites', hostname);
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, formSlug + '.html'), snapshot.result.value.html, 'utf8');
await writeFile(resolve(dir, formSlug + '.meta.json'), JSON.stringify({
  url: snapshot.result.value.url,
  title: snapshot.result.value.title,
  capturedAt: new Date().toISOString(),
}, null, 2), 'utf8');

console.error(`Saved: ${dir}/${formSlug}.html`);
console.error(`       ${dir}/${formSlug}.meta.json`);
console.error('Next: create ' + dir + '/' + formSlug + '.expected.json with the fields extractor should return.');
await client.close();
