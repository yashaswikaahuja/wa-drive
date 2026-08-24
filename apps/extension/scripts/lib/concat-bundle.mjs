/**
 * Concatenate ordered IIFE source files into one Chrome inject bundle.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {{
 *   banner: string,
 *   srcDir: string,
 *   order: string[],
 *   outfile: string,
 *   relativeLabels?: boolean,
 * }} opts
 */
export function writeConcatBundle({ banner, srcDir, order, outfile }) {
  const parts = [banner.endsWith('\n') ? banner : banner + '\n'];

  for (const name of order) {
    const p = path.join(srcDir, name);
    if (!fs.existsSync(p)) throw new Error(`missing ${name} (looked in ${srcDir})`);
    const src = fs.readFileSync(p, 'utf8');
    parts.push(`\n/* ==== ${name} ==== */\n`);
    parts.push(src);
    if (!src.endsWith('\n')) parts.push('\n');
  }

  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  const body = parts.join('');
  fs.writeFileSync(outfile, body);
  const lines = body.split(/\n/).length;
  console.log('Wrote', outfile, lines, 'lines');
  return { outfile, lines };
}
