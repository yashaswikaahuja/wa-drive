#!/usr/bin/env node
// tools/forbidden-deps-check.mjs
//
// Architecture doctrine (see /ARCHITECTURE.md §5 and the runtime guards in
// backend/src/index.ts + extension-service/index.js): the backend tier stays "thin".
// Heavy image/PDF/OCR/ML/browser libraries are FORBIDDEN — document understanding is done by
// Groq Vision, not local processing. This script fails CI if any forbidden package appears in a
// service's package.json dependencies, catching it at PR time instead of only at runtime.
//
// Usage:  node tools/forbidden-deps-check.mjs [--strict]
//   --strict : exit 1 if any forbidden dep is found (used in CI). Without it, warn only.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// Keep in sync with the runtime guards in backend/src/index.ts and extension-service/index.js.
const FORBIDDEN = [
  'jimp', 'puppeteer', 'puppeteer-core', 'playwright', 'canvas', 'pdfkit', 'pdf-lib',
  'tesseract.js', 'ffmpeg-static', 'fluent-ffmpeg', '@tensorflow/tfjs-node', 'onnxruntime-node',
  'node-poppler', 'pdf2pic', 'pdf-image', 'html-pdf', 'html-pdf-node', 'gm', 'sharp',
];

// Service package.json files to audit. (whatsapp-resolver legitimately references puppeteer config
// keys but doesn't depend on it; we audit declared dependencies only.)
const SERVICES = ['backend', 'extension-service', 'whatsapp-service', 'whatsapp-resolver'];

const strict = process.argv.includes('--strict');
let violations = 0;

for (const svc of SERVICES) {
  const pkgPath = join(repoRoot, svc, 'package.json');
  if (!existsSync(pkgPath)) continue;
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (e) {
    console.error(`[doctrine] could not parse ${svc}/package.json: ${e.message}`);
    violations++;
    continue;
  }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const found = FORBIDDEN.filter((name) => name in deps);
  if (found.length) {
    console.error(`[doctrine] ✗ ${svc}: forbidden dependency(ies): ${found.join(', ')}`);
    violations += found.length;
  } else {
    console.log(`[doctrine] ✓ ${svc}: clean`);
  }
}

if (violations > 0) {
  console.error(`\n[doctrine] ${violations} forbidden dependency violation(s) found — see /ARCHITECTURE.md §5.`);
  console.error('[doctrine] The backend tier must stay thin; document understanding is done by Groq Vision, not local image/PDF/OCR/ML libs.');
  if (strict) process.exit(1);
} else {
  console.log('\n[doctrine] all services clean — no forbidden dependencies.');
}
