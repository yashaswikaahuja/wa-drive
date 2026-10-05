#!/usr/bin/env node
/**
 * Wrap extension product-path scripts in IIFEs so re-injection via
 * chrome.scripting.executeScript({ files }) does not throw
 * "Identifier has already been declared".
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const files = [
  'extension/runtime/dom-gateway.js',
  'extension/perception/binding-registry.ts',
  'extension/perception/revision-manager.js',
  'extension/perception/canonical-hash.js',
  'extension/perception/privacy-filter.js',
  'extension/perception/widget-classifier.js',
  'extension/perception/adapters/index.js',
  'extension/perception/node-factory.js',
  'extension/perception/edge-factory.js',
  'extension/perception/graph-invariants.js',
  'extension/perception/context-discovery.js',
  'extension/perception/snapshot-builder.js',
  'extension/perception/validator.js',
  'extension/perception/index.js',
  'extension/perception/delta-apply.js',
  'extension/perception/delta-emitter.js',
];

for (const rel of files) {
  const p = resolve(ROOT, rel);
  let src = readFileSync(p, 'utf8');
  const trimmed = src.trimStart();
  if (trimmed.startsWith('(function') || src.includes('/* __CC_IIFE_WRAPPED__ */')) {
    console.log('SKIP already wrapped:', rel);
    continue;
  }
  // Normalize newlines, wrap whole file so top-level const/class/let are scoped
  if (!src.endsWith('\n')) src += '\n';
  const wrapped =
    '/* __CC_IIFE_WRAPPED__ — re-injectable isolated-world script */\n' +
    '(function () {\n' +
    "'use strict';\n" +
    src +
    '})();\n';
  writeFileSync(p, wrapped);
  console.log('WRAPPED:', rel);
}
