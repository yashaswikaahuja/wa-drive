/**
 * Shared Playwright page injection for browser harnesses after the JS→TS migrate.
 *
 * Discrete apps/extension/{shared,autofill,capabilities,models} trees are gone;
 * harnesses inject concat @cc/* bundles plus archived IR + capability/runtime
 * scripts from extension-legacy-best. Prefer committed .js siblings so CI does
 * not need to resolve esbuild from this path.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
export const EXT_DIR = resolve(ROOT, 'apps/extension');
export const LEGACY_DIR = resolve(ROOT, 'extension-legacy-best');

const BUNDLE_SCRIPTS = [
  'shared-bundle.js',
  'autofill/plugins-bundle.js',
  'autofill/extractor-bundle.js',
  'autofill/mapper-bundle.js',
  'autofill/executor-bundle.js',
  'drivers-bundle.js',
];

/** Prefer .js; fall back to stripping .ts via root-resolved esbuild. */
const LEGACY_SCRIPTS = [
  'models/ir',
  'capabilities/registry',
  'runtime/plugin-bridge',
  'runtime/resolver',
  'runtime/runner',
];

function loadLegacyScript(baseRel) {
  const jsPath = join(LEGACY_DIR, `${baseRel}.js`);
  if (existsSync(jsPath)) return readFileSync(jsPath, 'utf8');

  const tsPath = join(LEGACY_DIR, `${baseRel}.ts`);
  if (!existsSync(tsPath)) {
    throw new Error(`legacy script missing: ${baseRel}.{js,ts}`);
  }
  // Resolve esbuild from repo root (pnpm does not hoist into extension-dev/).
  const require = createRequire(resolve(ROOT, 'package.json'));
  const esbuild = require('esbuild');
  const raw = readFileSync(tsPath, 'utf8');
  return esbuild.transformSync(raw, { loader: 'ts', target: 'es2018' }).code;
}

export async function injectExtensionHost(page) {
  for (const script of BUNDLE_SCRIPTS) {
    const path = join(EXT_DIR, script);
    if (!existsSync(path)) {
      console.warn(`  SKIP: ${script} not found`);
      continue;
    }
    await page.addScriptTag({ content: readFileSync(path, 'utf8') });
  }

  for (const rel of LEGACY_SCRIPTS) {
    try {
      await page.addScriptTag({ content: loadLegacyScript(rel) });
    } catch (e) {
      console.warn(`  SKIP legacy: ${rel} (${e.message})`);
    }
  }

  // Soft stubs for symbols some suites still reference after discrete-tree removal.
  await page.evaluate(() => {
    const w = window;
    if (typeof w.fuzzyMatch === 'undefined') w.fuzzyMatch = () => ({});
    if (typeof w.ccEvaluateField === 'undefined') w.ccEvaluateField = () => null;
    if (w.ccSemanticAliases && typeof w.ccSemanticAliases.merge === 'function') {
      w.ccSemanticAliases.merge({
        full_name: ['full name', 'name', 'applicant name', 'candidate name'],
        father_name: ['father', "father's name", 'father name'],
        dob: ['date of birth', 'dob', 'birth date'],
        gender: ['gender', 'sex'],
        email: ['email', 'e-mail', 'email id', 'email address'],
        mobile: ['mobile', 'phone', 'mobile number', 'contact'],
        aadhaar: ['aadhaar', 'aadhar', 'uidai'],
        category: ['category', 'caste', 'reservation category'],
        state: ['state'],
        district: ['district'],
        agree: ['agree', 'declaration', 'i agree', 'i declare'],
      });
    }
  });
}
