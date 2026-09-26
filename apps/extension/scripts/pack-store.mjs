/**
 * Pack CyberControl extension for Chrome Web Store + local CRX.
 *
 * Outputs (repo root `release/` by default):
 *   cybercontrol-extension-<version>.zip  ← upload this to Chrome Developer Dashboard
 *   cybercontrol-extension-<version>.crx  ← packed with extension.pem (sideload/testing)
 *
 * Usage: node apps/extension/scripts/pack-store.mjs
 */
import { createWriteStream, existsSync, mkdirSync, cpSync, rmSync, readFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extRoot = join(__dirname, '..');
const repoRoot = join(extRoot, '..', '..');
const outDir = join(repoRoot, 'release');
const stageDir = join(outDir, '_ext-stage');

const manifest = JSON.parse(readFileSync(join(extRoot, 'manifest.json'), 'utf8'));
const version = manifest.version || '0.0.0';
const zipName = `cybercontrol-extension-${version}.zip`;
const crxName = `cybercontrol-extension-${version}.crx`;

/** Runtime files/dirs only — never ship node_modules, scripts, PEM, README. */
const INCLUDE = [
  'manifest.json',
  'background.js',
  'content.js',
  'popup.html',
  'popup.js',
  'icon.png',
  'knowledge-sync.js',
  'drivers-bundle.js',
  'shared-bundle.js',
  'application',
  'autofill',
  'sw',
];

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
}

mkdirSync(outDir, { recursive: true });
if (existsSync(stageDir)) rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

for (const name of INCLUDE) {
  const src = join(extRoot, name);
  if (!existsSync(src)) {
    console.warn(`[pack] missing optional path: ${name}`);
    continue;
  }
  cpSync(src, join(stageDir, name), { recursive: true });
}

// ZIP via PowerShell Compress-Archive (Windows) — paths relative so manifest is at zip root
const zipPath = join(outDir, zipName);
if (existsSync(zipPath)) rmSync(zipPath, { force: true });

const ps = spawnSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${stageDir}\\*' -DestinationPath '${zipPath}' -Force`,
  ],
  { encoding: 'utf8' },
);
if (ps.status !== 0) {
  console.error(ps.stderr || ps.stdout);
  process.exit(1);
}
console.log(`[pack] ZIP  → ${zipPath}`);

// CRX via Chrome --pack-extension + existing PEM (keeps same extension ID)
const chrome = findChrome();
const pemPath = join(repoRoot, 'extension.pem');
if (!chrome) {
  console.warn('[pack] Chrome not found — skipped CRX. ZIP is ready for Web Store upload.');
  rmSync(stageDir, { recursive: true, force: true });
  process.exit(0);
}
if (!existsSync(pemPath)) {
  console.warn(`[pack] No ${pemPath} — packing will create a NEW key/ID. Aborting CRX to avoid ID drift.`);
  console.warn('[pack] ZIP is still ready for Chrome Web Store upload.');
  rmSync(stageDir, { recursive: true, force: true });
  process.exit(0);
}

const pack = spawnSync(
  chrome,
  [`--pack-extension=${stageDir}`, `--pack-extension-key=${pemPath}`],
  { encoding: 'utf8', timeout: 60000 },
);
// Chrome pack writes <stageDir>.crx next to the folder
const packedCrx = `${stageDir}.crx`;
const crxPath = join(outDir, crxName);
if (existsSync(packedCrx)) {
  if (existsSync(crxPath)) rmSync(crxPath, { force: true });
  renameSync(packedCrx, crxPath);
  // Also refresh root extension.crx for convenience
  const rootCrx = join(repoRoot, 'extension.crx');
  cpSync(crxPath, rootCrx);
  console.log(`[pack] CRX  → ${crxPath}`);
  console.log(`[pack] also → ${rootCrx}`);
} else {
  console.warn('[pack] Chrome did not produce a CRX.');
  if (pack.stdout) console.warn(pack.stdout);
  if (pack.stderr) console.warn(pack.stderr);
}

rmSync(stageDir, { recursive: true, force: true });
// Chrome may also write a .pem next to stage if key missing — clean any stray
const strayPem = `${stageDir}.pem`;
if (existsSync(strayPem)) rmSync(strayPem, { force: true });

console.log(`
Done.
  Web Store upload:  ${zipPath}
  Packed CRX:        ${existsSync(crxPath) ? crxPath : '(not created)'}

Chrome Developer Dashboard accepts the ZIP (not the CRX).
Do NOT upload extension.pem.
`);
