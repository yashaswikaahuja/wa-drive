#!/usr/bin/env node
/**
 * Phase 3.6 Visual Context — CHECK-014 semantic governance (#158).
 * Architecture-only: no runtime Visual Context behavior.
 * Conceptual taxonomy slot 3.8 maps to repository key phase_3_6 (Policy A).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
const jread = (rel) => JSON.parse(read(rel));

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗ FAIL:', msg); }
}

const FORBIDDEN = [
  'selector', 'css_selector', 'xpath', 'outer_html', 'inner_html',
  'dom_handle', 'element_reference', 'binding_id',
  'screenshot', 'screenshot_ref', 'pixel_buffer', 'canvas_image_data', 'video_frame',
  'workflow_intent', 'business_step_id', 'business_region_label', 'form_section_name',
  'absolute_screen', 'query_string', 'fragment', 'credentials',
];

function collectKeys(obj, out = new Set()) {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    for (const v of obj) collectKeys(v, out);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    out.add(k);
    collectKeys(v, out);
  }
  return out;
}

function keysContainForbidden(keys) {
  const hit = [];
  for (const k of keys) {
    const low = String(k).toLowerCase();
    for (const f of FORBIDDEN) {
      if (low === f || low.includes(f)) hit.push(k);
    }
  }
  return [...new Set(hit)];
}

console.log('\n=== Phase 3.6 Visual Context artifacts ===');
const required = [
  'architecture/visual-context.yml',
  'architecture/visual-context.draft-additives.json',
  'architecture/adrs/0010-visual-geometry-identity.md',
  'architecture/adrs/0011-visual-privacy-boundaries.md',
];
for (const rel of required) {
  ok(existsSync(resolve(ROOT, rel)), `${rel} exists`);
}

const contract = read('architecture/visual-context.yml');
ok(contract.includes('contract_version: "0.1.0"') || contract.includes("contract_version: '0.1.0'"), 'contract version 0.1.0');
ok(contract.includes('status: architecture_draft'), 'contract remains architecture_draft (not frozen)');
ok(contract.includes('phase: phase_3_6') || contract.includes('phase_3_6'), 'contract uses registry key phase_3_6');
ok(contract.includes('conceptual_roadmap_slot: "3.8"') || contract.includes('3.8'), 'maps conceptual 3.8');
ok(contract.includes('issue: "#158"') || contract.includes('#158'), 'references #158');

// Ownership
ok(contract.includes('browser_perception:'), 'ownership.browser_perception present');
ok(contract.includes('extension_service:'), 'ownership.extension_service present');
ok(contract.includes('must_not:'), 'must_not boundaries present');
ok(/select among workflow|choose the fill target|candidate/i.test(contract), 'forbids browser candidate selection');
ok(/screenshot|pixel/i.test(contract) && /MUST_NOT|prohibited|must_not/i.test(contract), 'forbids screenshots/pixels path');

// Design answers / required topics
const topics = [
  ['definition', /visual_context:|definition:/],
  ['geometry', /geometry|coordinate_space/],
  ['viewport', /viewport/],
  ['occlusion', /occlusion|occlud/],
  ['revision identity', /geometry_identity|binding_generation|revision/],
  ['virtualization', /virtualiz/],
  ['budgets', /budgets:|max_geometry/],
  ['edge interaction', /edge_interaction|visually_groups_with|overlays/],
  ['planner consumption', /planner_consumption/],
  ['adversarial', /adversarial_cases|malicious/],
  ['ADR-0006', /ADR-0006|0006/],
  ['Page IR compatibility', /page_ir_compatibility|page-ir/],
];
for (const [name, re] of topics) {
  ok(re.test(contract), `contract covers ${name}`);
}

// Normative vs progressive
ok(contract.includes('signals:') && contract.includes('normative:') && contract.includes('progressive:'), 'normative vs progressive signals');
ok(contract.includes('Node.geometry') || contract.includes('geometry_bbox'), 'reuses Node.geometry');
ok(contract.includes('blocking_overlay'), 'ties to blocking_overlay PageState');

// Non-goals
ok(contract.includes('non_goals:') || contract.includes('Does NOT implement'), 'explicit non-goals / no runtime');
ok(!/status:\s*frozen/.test(contract), 'contract file itself not frozen');

console.log('\n=== ADRs ===');
const adr10 = read('architecture/adrs/0010-visual-geometry-identity.md');
const adr11 = read('architecture/adrs/0011-visual-privacy-boundaries.md');
ok(adr10.includes('node_id') && adr10.includes('revision'), 'ADR-0010 geometry identity rules');
ok(adr10.includes('Rejected alternatives'), 'ADR-0010 has rejected alternatives');
ok(adr11.includes('ADR-0006') || adr11.includes('0006'), 'ADR-0011 retains screenshot ban');
ok(adr11.includes('selector') || adr11.includes('XPath') || adr11.includes('xpath'), 'ADR-0011 forbids selectors');
ok(adr11.includes('vision') || adr11.includes('OCR'), 'ADR-0011 forbids browser vision/OCR');

console.log('\n=== Draft additives ===');
const additives = jread('architecture/visual-context.draft-additives.json');
ok(additives.status === 'architecture_draft', 'draft additives not frozen');
ok(Array.isArray(additives.forbidden_even_as_draft), 'draft additives list hard forbids');
for (const f of ['screenshot', 'css_selector', 'xpath', 'workflow_intent']) {
  ok(additives.forbidden_even_as_draft.includes(f), `draft forbids ${f}`);
}

console.log('\n=== Fixtures (semantic) ===');
const fixDir = resolve(ROOT, 'architecture/fixtures/visual');
ok(existsSync(fixDir), 'fixtures/visual exists');
const fixFiles = readdirSync(fixDir).filter((f) => f.endsWith('.json'));
ok(fixFiles.length >= 7, `at least 7 visual fixtures (have ${fixFiles.length})`);

const positives = fixFiles.filter((f) => f.startsWith('positive-'));
const malicious = fixFiles.filter((f) => f.startsWith('malicious-'));
ok(positives.length >= 4, 'positive fixtures present');
ok(malicious.length >= 3, 'malicious fixtures present');

for (const f of positives) {
  const data = jread(`architecture/fixtures/visual/${f}`);
  const keys = collectKeys(data);
  const hits = keysContainForbidden(keys);
  // positive fixtures must not *use* forbidden payload keys as content fields
  // (malicious fixtures intentionally list them)
  const contentHits = hits.filter((k) => !['forbidden_keys_present', 'forbidden_keys_absent'].includes(k));
  // allow keys that appear only inside diagnostic messages? collectKeys gets all
  // Filter: if the fixture is positive, fragment-like keys shouldn't include screenshot etc as object keys
  const deepForbidden = [];
  const walk = (o, path = '') => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${path}[${i}]`));
    for (const [k, v] of Object.entries(o)) {
      const low = k.toLowerCase();
      if (FORBIDDEN.some((f2) => low === f2)) deepForbidden.push(`${f}:${k}`);
      // skip meta arrays listing forbidden names
      if (k === 'forbidden_keys_present' || k === 'must_not_include_node_ids') continue;
      walk(v, `${path}.${k}`);
    }
  };
  walk(data);
  ok(deepForbidden.length === 0, `${f}: no forbidden public keys in positive payload (${deepForbidden.join(',') || 'ok'})`);
}

// Geometry positive shape
const geo = jread('architecture/fixtures/visual/positive-geometry-control.json');
ok(geo.node?.geometry?.viewport_intersection === 1, 'positive geometry has viewport_intersection');
ok(geo.node.geometry.width >= 0 && geo.node.geometry.height >= 0, 'geometry non-negative size');
ok(geo.page_viewport?.width > 0, 'page viewport present');

// Overlays edge
const ov = jread('architecture/fixtures/visual/positive-overlays-edge.json');
ok(ov.edge?.type === 'overlays', 'overlays edge type');
ok(Array.isArray(ov.edge?.evidence?.signals) && ov.edge.evidence.signals.length > 0, 'overlays has evidence signals');
ok(Array.isArray(ov.state_signals) && ov.state_signals.includes('blocking_overlay'), 'blocking_overlay state signal');

// Virtualization
const virt = jread('architecture/fixtures/visual/positive-virtualized-not-invented.json');
ok(Array.isArray(virt.must_not_include_node_ids) && virt.must_not_include_node_ids.length > 0, 'virtualization must_not invent rows');
ok(virt.diagnostics?.some((d) => d.code === 'virtualized_content_not_realized'), 'virtualization diagnostic code');

// Secret geometry
const sec = jread('architecture/fixtures/visual/positive-secret-geometry.json');
ok(sec.node.privacy?.classification === 'secret' && sec.node.privacy?.redacted === true, 'secret node redacted');
ok(sec.node.observed?.sanitized_text === null, 'secret sanitized_text null');
ok(['masked', 'unavailable', 'not_applicable'].includes(sec.node.observed?.value_state), 'secret value_state safe');

// Cross-origin
const xo = jread('architecture/fixtures/visual/positive-cross-origin-opaque.json');
ok(xo.context?.access === 'cross_origin', 'cross-origin access marker');
ok(xo.must_not_include?.child_nodes_with_geometry === true, 'no fabricated child geometry');

// Malicious fixtures declare forbidden keys
for (const f of malicious) {
  const data = jread(`architecture/fixtures/visual/${f}`);
  ok(data.expect === 'reject', `${f} expect reject`);
  ok(Array.isArray(data.forbidden_keys_present) && data.forbidden_keys_present.length > 0, `${f} lists forbidden keys`);
  // fragment should actually contain at least one forbidden key
  const fragKeys = collectKeys(data.fragment || {});
  const present = data.forbidden_keys_present.filter((k) => fragKeys.has(k));
  ok(present.length > 0, `${f} fragment contains declared forbidden keys`);
}

console.log('\n=== Frozen Page IR compatibility ===');
const pageIr = read('architecture/page-ir.yml');
const pageSchema = jread('architecture/page-ir.schema.json');
ok(pageIr.includes('geometry:') || pageIr.includes('viewport_intersection'), 'page-ir.yml defines geometry');
ok(pageIr.includes('visually_groups_with') && pageIr.includes('overlays'), 'page-ir.yml visual edges');
ok(pageSchema.$defs?.Geometry, 'page-ir.schema Geometry def');
ok(
  pageSchema.$defs.Geometry.properties.viewport_intersection
  && pageSchema.$defs.Geometry.properties.x,
  'Geometry has x and viewport_intersection'
);
ok(pageSchema.$defs?.PageMetadata?.properties?.viewport, 'PageMetadata.viewport exists');
// Contract must not require schema_version bump for normative surface
ok(contract.includes('schema_version bump') || contract.includes('does NOT require a schema_version'), 'no mandatory schema bump for normative surface');

console.log('\n=== Registry / ownership / verification ===');
const phases = read('architecture/phases.yml');
ok(
  /phase_3_6:\s*\n\s*name:\s*"Visual Context"\s*\n\s*status:\s*(architecture_draft|implemented_unfrozen)/.test(phases),
  'phase_3_6 status is architecture_draft or implemented_unfrozen (not frozen)'
);
ok(!/phase_3_6:\s*\n\s*name:\s*"Visual Context"\s*\n\s*status:\s*frozen/.test(phases), 'phase_3_6 is not frozen');
ok(phases.includes('conceptual_roadmap_slot: "3.8"') || phases.includes("conceptual_roadmap_slot: '3.8'"), 'phase_3_6 maps conceptual 3.8');
ok(phases.includes('phase_3_5') && phases.includes('Navigation Understanding'), 'phase_3_5 retained');
ok(phases.includes('phase_3_4') && phases.includes('WSS'), 'phase_3_4 WSS retained');
ok(phases.includes('POLICY A') || phases.includes('Repository numbering wins'), 'numbering policy still present');
// Must not rename WSS
ok(/phase_3_4:[\s\S]*WSS/.test(phases), 'phase_3_4 still WSS');

const ownership = read('architecture/ownership.yml');
ok(ownership.includes('visual_context:'), 'ownership maps visual_context');
ok(ownership.includes('phase_3_6') || ownership.includes('architecture/visual-context.yml'), 'ownership references phase_3_6 artifacts');

const verification = read('architecture/verification.yml');
ok(verification.includes('CHECK-014'), 'verification registers CHECK-014');
ok(verification.includes('test-phase36-visual-context-governance.mjs'), 'CHECK-014 points at this suite');

// ADR-0006 still present and not weakened by this draft claiming screenshots default on
const adr6 = read('architecture/adrs/0006-screenshot-privacy.md');
ok(adr6.includes('disabled by default') || adr6.includes('not screenshot'), 'ADR-0006 intact');
ok(!contract.includes('screenshots:\n    default: enabled'), 'contract does not enable screenshots');

// Frozen nav contract not demoted
const nav = read('architecture/navigation-understanding.yml');
ok(nav.includes('status: frozen'), 'phase_3_5 navigation contract remains frozen');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
