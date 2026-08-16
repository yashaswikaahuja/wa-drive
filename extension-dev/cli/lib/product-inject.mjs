/**
 * Product-path inject: scripts from fill-orchestrator PRODUCT_PATH_SCRIPTS.
 * Never invent a second list — parse the orchestrator source.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './chrome.mjs';

const ORCH = resolve(ROOT, 'extension/application/fill-orchestrator.js');
const EXT = resolve(ROOT, 'extension');

export function readProductPathScripts() {
  if (!existsSync(ORCH)) {
    throw new Error(`fill-orchestrator missing: ${ORCH}`);
  }
  const src = readFileSync(ORCH, 'utf8');
  const start = src.indexOf('PRODUCT_PATH_SCRIPTS');
  if (start < 0) throw new Error('PRODUCT_PATH_SCRIPTS not found in fill-orchestrator.js');
  const block = src.slice(start, start + 2500);
  const re = /'([^']+\.js)'/g;
  const scripts = [];
  let m;
  while ((m = re.exec(block))) {
    scripts.push(m[1]);
    // Stop after array freeze closes roughly
    if (scripts.length > 40) break;
  }
  // Heuristic: array ends before runProductFill
  const cut = block.indexOf('async function runProductFill');
  if (cut > 0) {
    const onlyArray = block.slice(0, cut);
    const cleaned = [];
    const re2 = /'([^']+\.js)'/g;
    let m2;
    while ((m2 = re2.exec(onlyArray))) cleaned.push(m2[1]);
    if (cleaned.length >= 5) return cleaned;
  }
  if (scripts.length < 5) {
    throw new Error(`Failed to parse PRODUCT_PATH_SCRIPTS (got ${scripts.length})`);
  }
  return scripts;
}

export async function injectProductPath(page) {
  const scripts = readProductPathScripts();
  const missing = [];
  for (const rel of scripts) {
    const abs = resolve(EXT, rel);
    if (!existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    const code = readFileSync(abs, 'utf8');
    await page.evaluate(code);
  }
  if (missing.length) {
    throw new Error(`Product path scripts missing on disk: ${missing.join(', ')}`);
  }

  await page.evaluate(async () => {
    if (globalThis.CcContextDiscovery?.resetContextCounter) {
      globalThis.CcContextDiscovery.resetContextCounter();
    }
    if (globalThis.CcNodeFactory?.resetNodeCounter) {
      globalThis.CcNodeFactory.resetNodeCounter();
    }
    if (!globalThis.CcPerception?.initPerception) {
      throw new Error('CcPerception.initPerception unavailable after inject');
    }
    await globalThis.CcPerception.initPerception({
      gateway: globalThis.CcDomGateway,
      bindingRegistry: new globalThis.CcBindingRegistry(),
      revisionManager: new globalThis.CcRevisionManager(),
      privacyFilter: globalThis.CcPrivacyFilter,
      widgetClassifier: globalThis.CcWidgetClassifier,
      contextDiscovery: globalThis.CcContextDiscovery,
      nodeFactory: globalThis.CcNodeFactory,
      edgeFactory: globalThis.CcEdgeFactory,
      canonicalHash: globalThis.CcCanonicalHash,
      snapshotBuilder: globalThis.CcSnapshotBuilder,
      validator: globalThis.CcValidator,
      validatorOptions: { schema: null },
    });
    if (globalThis.CcValidator && !globalThis.CcValidator.isInitialized?.()) {
      await globalThis.CcValidator.initValidator({ schema: null });
    }
  });

  return scripts;
}

export function listProductPathScripts() {
  return readProductPathScripts();
}
