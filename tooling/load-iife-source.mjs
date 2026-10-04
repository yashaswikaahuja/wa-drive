/**
 * Load an IIFE capability module (optionally TypeScript) into a stub globalThis.
 * Used by package unit tests that eval page-inject scripts in Node.
 */
import { readFileSync } from 'node:fs';
import * as esbuild from 'esbuild';

/**
 * @param {string} absPath
 * @param {Record<string, unknown>} [root]
 */
export async function loadIifeSource(absPath, root = {}) {
  let src = readFileSync(absPath, 'utf8');
  if (/\.tsx?$/.test(absPath)) {
    src = (await esbuild.transform(src, { loader: absPath.endsWith('.tsx') ? 'tsx' : 'ts', target: 'es2018' })).code;
  }
  new Function('globalThis', src)(root);
  return root;
}
