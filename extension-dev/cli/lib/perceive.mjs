import { injectProductPath } from './product-inject.mjs';

export async function perceivePage(page, { includeGeometry = true } = {}) {
  await injectProductPath(page);
  const snapshot = await page.evaluate(async (geom) => {
    const snap = await globalThis.CcPerception.perceivePage({
      mode: 'snapshot',
      includeGeometry: geom,
    });
    const nodes = snap?.nodes || {};
    const nodeCount = Object.keys(nodes).length;
    const typeText = Object.values(nodes).filter((n) =>
      (n.affordances || []).includes('type_text')
    ).length;
    return {
      snapshot: snap,
      stats: {
        nodeCount,
        typeText,
        document_id: snap?.document_id,
        snapshot_id: snap?.snapshot_id,
        revision: snap?.revision,
      },
    };
  }, includeGeometry);
  return snapshot;
}
