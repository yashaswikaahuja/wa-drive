// Architecture doctrine enforcement
// See /ARCHITECTURE.md §5 — Forbidden Backend Dependencies
//
// Two modes:
//   default  — exits 0 if clean, prints summary
//   --strict — exits 1 if any NEW violation is found (used by CI)
//
// EXEMPTIONS: documented grandfathered violations that exist in the
// codebase today and have a remediation plan. New code adding any package
// not listed in EXEMPTIONS will fail CI.
//
// This file has zero runtime dependencies (only Node built-ins).
// Deleting this file does not break any service — it only disables
// CI enforcement of the doctrine.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Keep this list in sync with /ARCHITECTURE.md §5.
// Frontend dependencies are NOT checked — pdf-lib in the browser is allowed.
const FORBIDDEN = [
  // Image processing
  'sharp', 'jimp', 'gm', 'imagemagick', 'imagemagick-cli',
  'canvas', // node-canvas (Cairo-based)
  // Headless browsers
  'puppeteer', 'puppeteer-core',
  'playwright', 'playwright-core',
  'chrome-aws-lambda',
  // PDF generation on server
  'pdf-lib', 'pdfkit', 'html-pdf', 'html-pdf-node',
  // OCR / ML inference
  'tesseract.js',
  '@tensorflow/tfjs-node', '@tensorflow/tfjs-node-gpu',
  'onnxruntime-node',
  // Video / audio rendering
  'ffmpeg-static', 'fluent-ffmpeg', '@ffmpeg/ffmpeg',
  // PDF rasterization
  'node-poppler', 'pdf2pic', 'pdf-image',
];

// Grandfathered exemptions. Each entry must include the reason and the
// remediation plan. When the package is removed, delete the entry from this
// map. Adding a new entry requires explicit review — see ARCHITECTURE.md §5.1.
const EXEMPTIONS = {
  'backend:sharp': {
    reason: 'Used by legacy Stitch photo sheet generator (services/processor/) and upload metadata validation.',
    plan: 'Removed when browser-side Photo Tool replaces Stitch. See ARCHITECTURE.md §5.1.',
  },
  'backend:playwright-core': {
    reason: 'Listed in package.json but not imported anywhere in source.',
    plan: 'Remove in next backend dependency cleanup. See ARCHITECTURE.md §5.1.',
  },
};

// Backend services to scan. Frontend (browser) is intentionally excluded.
const SERVICES = [
  'backend',
  'extension-service',
];

function checkPackageJson(serviceDir) {
  const pkgPath = resolve(REPO_ROOT, serviceDir, 'package.json');
  if (!existsSync(pkgPath)) return [];
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch (e) {
    return [{ service: serviceDir, error: 'unreadable package.json: ' + e.message }];
  }
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };
  return FORBIDDEN
    .filter(name => name in deps)
    .map(name => {
      const exemptionKey = serviceDir + ':' + name;
      const exemption = EXEMPTIONS[exemptionKey];
      return {
        service: serviceDir,
        package: name,
        version: deps[name],
        exempted: !!exemption,
        exemption: exemption || null,
      };
    });
}

export function checkForbiddenDeps() {
  return SERVICES.flatMap(checkPackageJson);
}

function printReport(violations) {
  const newViolations = violations.filter(v => !v.exempted && !v.error);
  const exempted = violations.filter(v => v.exempted);
  const errors = violations.filter(v => v.error);

  if (exempted.length > 0) {
    console.log('================================================================');
    console.log(' Grandfathered exemptions (see ARCHITECTURE.md §5.1)');
    console.log('================================================================');
    for (const v of exempted) {
      console.log(' . ' + v.service + '/package.json: ' + v.package + '@' + v.version);
      console.log('     reason: ' + v.exemption.reason);
      console.log('     plan:   ' + v.exemption.plan);
    }
    console.log('');
  }

  if (errors.length > 0) {
    console.error('Errors during scan:');
    for (const e of errors) console.error(' ! ' + e.service + ': ' + e.error);
    console.error('');
  }

  if (newViolations.length === 0) {
    console.log('[architecture] forbidden-deps check: OK');
    console.log('[architecture] scanned: ' + SERVICES.join(', '));
    console.log('[architecture] forbidden list: ' + FORBIDDEN.length + ' packages');
    console.log('[architecture] grandfathered: ' + exempted.length);
    return;
  }

  console.error('================================================================');
  console.error(' ARCHITECTURE DOCTRINE VIOLATION (NEW)');
  console.error(' See /ARCHITECTURE.md §5 — Forbidden Backend Dependencies');
  console.error('================================================================');
  for (const v of newViolations) {
    console.error(' x ' + v.service + '/package.json contains "' + v.package + '@' + v.version + '"');
  }
  console.error('');
  console.error(' These packages perform server-side pixel or binary processing,');
  console.error(' which violates the "browser is the compute layer" doctrine.');
  console.error(' On e2-micro infrastructure they cause memory pressure that');
  console.error(' destabilizes WhatsApp and Postgres on shared boxes.');
  console.error('');
  console.error(' Either remove the dependency, or amend ARCHITECTURE.md §4.4');
  console.error(' (new compute boundary procedure) before merging.');
  console.error('');
  console.error(' If this is a known existing violation, add it to EXEMPTIONS in');
  console.error(' tools/forbidden-deps-check.mjs with reason + remediation plan.');
  console.error('================================================================');
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const violations = checkForbiddenDeps();
  printReport(violations);
  const newViolations = violations.filter(v => !v.exempted && !v.error);
  const strict = process.argv.includes('--strict');
  if (strict && newViolations.length > 0) process.exit(1);
}
