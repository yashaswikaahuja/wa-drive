#!/usr/bin/env node
/**
 * Phase 3.6 Visual Context unit tests (#160)
 */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(import.meta.url);
const vc = require(resolve(ROOT, 'apps/extension/perception/visual-context.js'));

let passed = 0;
let failed = 0;
function ok(c, m) {
  if (c) { passed++; console.log('  ✓', m); }
  else { failed++; console.error('  ✗', m); }
}

console.log('\n=== Visual Context geometry (document space) ===');
const viewport = { width: 1000, height: 800, device_pixel_ratio: 1, scroll_x: 200, scroll_y: 100 };
// Client rect: left=50, top=40, 100x20 → document (250, 140)
const clientRect = { left: 50, top: 40, right: 150, bottom: 60, width: 100, height: 20, x: 50, y: 40 };
const g = vc.geometryFromClientRect(clientRect, viewport, 5);
ok(g && g.x === 250 && g.y === 140, 'document coords = client + scroll');
ok(g.width === 100 && g.height === 20, 'size preserved');
ok(g.z_index_hint === 5, 'z_index_hint passed through');
ok(g.viewport_intersection > 0 && g.viewport_intersection <= 1, 'viewport_intersection in range');

// Fully offscreen client rect
const off = vc.geometryFromClientRect(
  { left: -200, top: -200, right: -100, bottom: -100, width: 100, height: 100 },
  { width: 800, height: 600, scroll_x: 0, scroll_y: 0 },
  null
);
ok(off && off.viewport_intersection === 0, 'offscreen → intersection 0');

// Fail-closed
ok(vc.geometryFromClientRect(null, viewport) === null, 'null rect → null geometry');
ok(vc.geometryFromClientRect({ width: -1, height: 10, left: 0, top: 0 }, viewport) === null, 'negative size → null');

console.log('\n=== Material geometry equality (P2-01) ===');
const a = { x: 10, y: 10, width: 20, height: 20, viewport_intersection: 1 };
const b = { x: 10, y: 10, width: 20, height: 20, viewport_intersection: 1 };
const c = { x: 12, y: 10, width: 20, height: 20, viewport_intersection: 1 };
ok(vc.geometriesMateriallyEqual(a, b) === true, 'identical material equal');
ok(vc.geometriesMateriallyEqual(a, { ...a, x: 10.5 }) === true, 'sub-pixel within eps equal');
ok(vc.geometriesMateriallyEqual(a, c) === false, '2px shift material');
ok(vc.MATERIAL_GEOMETRY_EPS_PX === 1, 'eps constant 1px');

console.log('\n=== Proximity ===');
const near = { x: 0, y: 0, width: 40, height: 20 };
const near2 = { x: 50, y: 0, width: 40, height: 20 }; // gap 10
const far = { x: 200, y: 0, width: 40, height: 20 };
ok(vc.areVisuallyProximate(near, near2) === true, 'gap 10 proximate');
ok(vc.areVisuallyProximate(near, far) === false, 'far not proximate');

console.log('\n=== Evidence signals ===');
const sigs = vc.geometryEvidenceSignals(g);
ok(sigs.includes('geometry.bbox'), 'bbox signal');
ok(sigs.includes('geometry.viewport_intersection'), 'intersection signal');
ok(sigs.includes('geometry.z_index'), 'z_index signal when hint set');
const offSigs = vc.geometryEvidenceSignals(off);
ok(offSigs.includes('geometry.offscreen'), 'offscreen signal');

console.log('\n=== Privacy / forbidden ===');
const sec = vc.sanitizeGeometryForPrivacy(g, 'secret');
ok(sec && sec.x === g.x && !('sanitized_text' in sec), 'secret geometry keeps numbers only');
ok(vc.FORBIDDEN_PUBLIC_VISUAL_KEYS.includes('screenshot'), 'forbids screenshot');
ok(vc.FORBIDDEN_PUBLIC_VISUAL_KEYS.includes('css_selector'), 'forbids selector');

console.log('\n=== Viewport helper ===');
const vp = vc.readPageViewport(null);
ok(vp && typeof vp.width === 'number' && typeof vp.scroll_x === 'number', 'readPageViewport null-safe');

console.log('\n=== Z-index parse ===');
ok(vc.parseZIndexHint({ position: 'fixed', zIndex: '10' }) === 10, 'fixed z-index 10');
ok(vc.parseZIndexHint({ position: 'static', zIndex: '10' }) === null, 'static → null');
ok(vc.parseZIndexHint({ position: 'absolute', zIndex: 'auto' }) === null, 'auto → null');

console.log('\n=== VC-IMPL-P1 edge endpoint ordering ===');
{
  const o1 = vc.orderedEdgeEndpoints('node:b', 'node:a');
  ok(o1 && o1[0] === 'node:a' && o1[1] === 'node:b', 'ordered endpoints source < target');
  ok(vc.orderedEdgeEndpoints('node:a', 'node:a') === null, 'self-edge rejected');
  const o2 = vc.orderedEdgeEndpoints('node:a', 'node:b');
  ok(o2 && o2[0] === 'node:a' && o2[1] === 'node:b', 'already ordered preserved');
}

console.log('\n=== Scroll-invariant document identity of bbox origin ===');
{
  // Same document position, different scroll: client moves, document coords stable
  const docX = 500;
  const docY = 400;
  const vp1 = { width: 800, height: 600, scroll_x: 0, scroll_y: 0 };
  const vp2 = { width: 800, height: 600, scroll_x: 100, scroll_y: 50 };
  const g1 = vc.geometryFromClientRect(
    { left: docX, top: docY, width: 30, height: 20, right: docX + 30, bottom: docY + 20 },
    vp1
  );
  const g2 = vc.geometryFromClientRect(
    { left: docX - 100, top: docY - 50, width: 30, height: 20, right: docX - 100 + 30, bottom: docY - 50 + 20 },
    vp2
  );
  ok(g1 && g2 && g1.x === g2.x && g1.y === g2.y, 'document bbox stable across scroll');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
