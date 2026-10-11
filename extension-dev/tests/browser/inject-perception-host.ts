/**
 * Inject archived perception + product-path runtime into a Playwright page.
 *
 * Sources live under extension-legacy-best after the turborepo cutover removed
 * apps/extension/perception|runtime discrete trees.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
export const LEGACY_DIR = resolve(ROOT, 'extension-legacy-best');
const nodeRequire = createRequire(resolve(ROOT, 'package.json'));

/** Order matters: interaction before dom-gateway; perception modules before index. */
export const PERCEPTION_SCRIPTS = [
  'perception/binding-registry.js',
  'perception/revision-manager.js',
  'perception/canonical-hash.js',
  'perception/privacy-filter.js',
  'perception/widget-classifier.js',
  'perception/adapters/index.js',
  'perception/node-factory.js',
  'perception/edge-factory.js',
  'perception/graph-invariants.js',
  'perception/delta-apply.js',
  'perception/context-discovery.js',
  'perception/snapshot-builder.js',
  'perception/validator.js',
  'perception/visual-context.js',
  'perception/index.js',
];

export const PRODUCT_RUNTIME_SCRIPTS = [
  'runtime/gateway/interaction.js',
  'runtime/dom-gateway.js',
  'runtime/dom-settle.js',
  'runtime/dom-evidence.js',
  'runtime/errors.js',
  'runtime/navigation-contract.js',
  'runtime/action-plan-executor.js',
];

function readLegacy(rel: string): string {
  const abs = join(LEGACY_DIR, rel);
  if (!existsSync(abs)) throw new Error(`missing legacy script: ${rel}`);
  return readFileSync(abs, 'utf8');
}

export async function injectScripts(page: any, rels: string[]): Promise<void> {
  for (const rel of rels) {
    await page.evaluate(readLegacy(rel));
  }
}

export async function injectPerceptionHost(page: any, opts: { productRuntime?: boolean } = {}): Promise<void> {
  const scripts = opts.productRuntime
    ? [...PRODUCT_RUNTIME_SCRIPTS.filter((s) => !s.endsWith('action-plan-executor.js')), ...PERCEPTION_SCRIPTS, 'runtime/action-plan-executor.js']
    : [
        'runtime/gateway/interaction.js',
        'runtime/dom-gateway.js',
        ...PERCEPTION_SCRIPTS,
      ];
  await injectScripts(page, scripts);

  await page.evaluate(async () => {
    const g = globalThis as any;
    if (g.CcContextDiscovery?.resetContextCounter) g.CcContextDiscovery.resetContextCounter();
    if (g.CcNodeFactory?.resetNodeCounter) g.CcNodeFactory.resetNodeCounter();
    if (!g.CcPerception?.initPerception) throw new Error('CcPerception not loaded');
    await g.CcPerception.initPerception({
      gateway: g.CcDomGateway,
      bindingRegistry: new g.CcBindingRegistry(),
      revisionManager: new g.CcRevisionManager(),
      privacyFilter: g.CcPrivacyFilter,
      widgetClassifier: g.CcWidgetClassifier,
      contextDiscovery: g.CcContextDiscovery,
      nodeFactory: g.CcNodeFactory,
      edgeFactory: g.CcEdgeFactory,
      canonicalHash: g.CcCanonicalHash,
      snapshotBuilder: g.CcSnapshotBuilder,
      validator: g.CcValidator,
      validatorOptions: { schema: null },
    });
    if (g.CcValidator && !g.CcValidator.isInitialized()) {
      await g.CcValidator.initValidator({ schema: null });
    }
  });
}

export function legacyRequire(rel: string): any {
  return nodeRequire(join(LEGACY_DIR, rel));
}
