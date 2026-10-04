/**
 * Backward-compatible alias — emits all extension entry .ts → .js
 * (including background.js). Prefer build-extension-entries.mjs.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(scriptsDir, 'build-extension-entries.mjs')], {
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
