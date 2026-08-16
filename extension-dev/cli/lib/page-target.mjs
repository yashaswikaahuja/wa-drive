import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './chrome.mjs';

const FIXTURES = resolve(ROOT, 'extension-dev/tests/fixtures');

export function resolvePageUrl(opts) {
  if (opts.url) return opts.url;
  if (opts.fixture) {
    const name = opts.fixture;
    const candidates = [
      resolve(name),
      resolve(FIXTURES, name),
      resolve(FIXTURES, name.endsWith('.html') ? name : `${name}.html`),
    ];
    const hit = candidates.find((p) => existsSync(p));
    if (!hit) {
      throw new Error(
        `Fixture not found: ${name}\nLooked in:\n  ${candidates.join('\n  ')}`
      );
    }
    return pathToFileURL(hit).href;
  }
  // default offline fixture
  const def = resolve(FIXTURES, 'perception-native.html');
  if (!existsSync(def)) throw new Error('Default fixture perception-native.html missing');
  return pathToFileURL(def).href;
}

export { FIXTURES };
