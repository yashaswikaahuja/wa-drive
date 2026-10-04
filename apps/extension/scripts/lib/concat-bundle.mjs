/**
 * Concatenate ordered source files into one Chrome inject / SW bundle.
 * `.ts` files are type-stripped via esbuild.transform; `.js` stays raw text.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

/**
 * @param {{
 *   banner: string,
 *   srcDir: string,
 *   order: string[],
 *   outfile: string,
 *   relativeLabels?: boolean,
 *   idempotentKey?: string,
 * }} opts
 */
export async function writeConcatBundle({ banner, srcDir, order, outfile, idempotentKey }) {
  const parts = [banner.endsWith('\n') ? banner : banner + '\n'];

  if (idempotentKey) {
    // SW importScripts may re-exec the same file in one global; skip 2nd pass.
    parts.push(
      `if (globalThis[${JSON.stringify(idempotentKey)}]) { /* already loaded */ }\n`,
      `else {\nglobalThis[${JSON.stringify(idempotentKey)}] = true;\n`
    );
  }

  for (const name of order) {
    const p = path.join(srcDir, name);
    if (!fs.existsSync(p)) throw new Error(`missing ${name} (looked in ${srcDir})`);
    const src = fs.readFileSync(p, 'utf8');
    let code = src;
    if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      const transformed = await esbuild.transform(src, {
        loader: name.endsWith('.tsx') ? 'tsx' : 'ts',
        target: 'es2018',
        legalComments: 'none',
      });
      code = transformed.code;
    }
    parts.push(`\n/* ==== ${name} ==== */\n`);
    parts.push(code);
    if (!code.endsWith('\n')) parts.push('\n');
  }

  if (idempotentKey) {
    parts.push(`\n}\n`);
  }

  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  const body = parts.join('');
  fs.writeFileSync(outfile, body);
  const lines = body.split(/\n/).length;
  console.log('Wrote', outfile, lines, 'lines');
  return { outfile, lines };
}
