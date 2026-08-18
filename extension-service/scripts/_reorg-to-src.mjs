/**
 * One-shot: move flat extension-service modules into src/{http,ws,db,engines}.
 * ALREADY APPLIED on this branch — kept for history / other clones only.
 * Run from extension-service/: node scripts/_reorg-to-src.mjs
 *
 * Safe to re-run only on a flat tree (checks for src/engines).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ENGINES = [
  'ai-key-manager.js',
  'behavior-classifier.js',
  'confidence-evaluator.js',
  'confidence-manager.js',
  'dependency-resolver.js',
  'derivation-engine.js',
  'deriveProfile.js',
  'execution-evidence.js',
  'execution-mode.js',
  'fill-planner.js',
  'fill-session.js',
  'form-identity.js',
  'generalization-engine.js',
  'him-engine.js',
  'knowledge-store.js',
  'knowledge-versioning.js',
  'learning-engine.js',
  'mapping-engine.js',
  'mapping-observations.js',
  'orchestrator.js',
  'pattern-extractor.js',
  'plan-builder.js',
  'prompt-builder.js',
  'scope-resolver.js',
  'semantic-mapper.js',
  'session-manager.js',
  'teach-orchestrator.js',
  'validation-engine.js',
];

/** old relative from ROOT → new relative from ROOT */
const MOVES = new Map();

function addMove(fromRel, toRel) {
  MOVES.set(fromRel.replace(/\\/g, '/'), toRel.replace(/\\/g, '/'));
}

addMove('db.js', 'src/db/db.js');
addMove('store.js', 'src/db/store.js');
addMove('auth.js', 'src/http/auth.js');
addMove('ws-server.js', 'src/ws/server.js');
addMove('ws-handlers.js', 'src/ws/handlers.js');
addMove('ws-fill.js', 'src/ws/fill.js');
addMove('migrate-files-to-db.js', 'scripts/migrate-files-to-db.js');
addMove('seed-knowledge.js', 'scripts/seed-knowledge.js');
addMove('mapping-engine.t6.test.mjs', 'src/engines/mapping-engine.t6.test.mjs');

for (const f of ENGINES) addMove(f, `src/engines/${f}`);

// routes/*
const routesDir = path.join(ROOT, 'routes');
if (fs.existsSync(routesDir)) {
  for (const name of fs.readdirSync(routesDir)) {
    if (name.endsWith('.js')) addMove(`routes/${name}`, `src/http/routes/${name}`);
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function relImport(fromFile, toFile) {
  let rel = path.relative(path.dirname(fromFile), toFile).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

/** Resolve an import specifier from a file to a ROOT-relative path (pre-move paths). */
function resolveOldTarget(fromRel, spec) {
  if (!spec.startsWith('.')) return null;
  const abs = path.normalize(path.join(ROOT, path.dirname(fromRel), spec));
  let rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  if (!/\.(js|mjs|cjs|json)$/.test(rel)) {
    // ESM imports in this package always use explicit .js
    rel += '.js';
  }
  return rel;
}

function newLocation(oldRel) {
  return MOVES.get(oldRel) || oldRel;
}

function rewriteFile(newRel) {
  const abs = path.join(ROOT, newRel);
  let text = fs.readFileSync(abs, 'utf8');
  const re = /from\s+(['"])(\.\.?\/[^'"]+)\1/g;
  text = text.replace(re, (full, quote, spec) => {
    // Invert: we need old location of this file to resolve old imports
    const oldRel =
      [...MOVES.entries()].find(([, v]) => v === newRel)?.[0] || newRel;
    const oldTarget = resolveOldTarget(oldRel, spec);
    if (!oldTarget) return full;
    const newTarget = newLocation(oldTarget);
    const newSpec = relImport(path.join(ROOT, newRel), path.join(ROOT, newTarget));
    return `from ${quote}${newSpec}${quote}`;
  });
  fs.writeFileSync(abs, text);
}

function main() {
  if (fs.existsSync(path.join(ROOT, 'src', 'engines'))) {
    console.error('src/engines already exists — abort (already reorged?)');
    process.exit(1);
  }

  ensureDir(path.join(ROOT, 'src/db'));
  ensureDir(path.join(ROOT, 'src/ws'));
  ensureDir(path.join(ROOT, 'src/http/routes'));
  ensureDir(path.join(ROOT, 'src/engines'));
  ensureDir(path.join(ROOT, 'scripts'));

  // Physical moves
  for (const [fromRel, toRel] of MOVES) {
    const from = path.join(ROOT, fromRel);
    const to = path.join(ROOT, toRel);
    if (!fs.existsSync(from)) {
      console.warn('skip missing', fromRel);
      continue;
    }
    ensureDir(path.dirname(to));
    fs.renameSync(from, to);
    console.log('mv', fromRel, '→', toRel);
  }

  // Remove empty routes/ if empty
  try {
    if (fs.existsSync(routesDir) && fs.readdirSync(routesDir).length === 0) {
      fs.rmdirSync(routesDir);
    }
  } catch {
    /* ignore */
  }

  // Rewrite imports in all moved files + index.js
  const toRewrite = [...MOVES.values(), 'index.js'];
  for (const rel of toRewrite) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    rewriteFile(rel);
    console.log('rewrite', rel);
  }

  // Root shims for anything that might still import old paths
  const shims = [
    ['auth.js', './src/http/auth.js'],
    ['db.js', './src/db/db.js'],
    ['store.js', './src/db/store.js'],
    ['ws-server.js', './src/ws/server.js'],
    ['ws-handlers.js', './src/ws/handlers.js'],
    ['ws-fill.js', './src/ws/fill.js'],
  ];
  for (const [name, target] of shims) {
    fs.writeFileSync(
      path.join(ROOT, name),
      `/** Compatibility shim — prefer ${target} */\nexport * from '${target}';\n`
    );
    console.log('shim', name);
  }

  console.log('Done. Next: update index.js imports if needed, node --check index.js');
}

main();
