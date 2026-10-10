/**
 * Load an IIFE capability module (optionally TypeScript) into a stub globalThis.
 * Used by package unit tests that eval page-inject scripts in Node.
 */
import { readFileSync } from 'node:fs';
import * as esbuild from 'esbuild';

export async function loadIifeSource(
  absPath: string,
  root: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  let src = readFileSync(absPath, 'utf8');
  if (/\.tsx?$/.test(absPath)) {
    src = (await esbuild.transform(src, { loader: absPath.endsWith('.tsx') ? 'tsx' : 'ts', target: 'es2018' })).code;
  }
  new Function('globalThis', src)(root);
  return root;
}
