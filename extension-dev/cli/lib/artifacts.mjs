import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ROOT } from './chrome.mjs';
import { redactDeep } from './redact.mjs';

export function defaultOutDir(runId) {
  return resolve(ROOT, 'extension-dev/cli/out', runId);
}

export function makeRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` +
    `-${Math.random().toString(36).slice(2, 7)}`
  );
}

export function createArtifacts(outDir) {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const writes = [];

  function writeJson(name, data) {
    const path = join(outDir, name);
    writeFileSync(path, JSON.stringify(redactDeep(data), null, 2), 'utf8');
    writes.push(name);
    return path;
  }

  function writeText(name, text) {
    const path = join(outDir, name);
    writeFileSync(path, text, 'utf8');
    writes.push(name);
    return path;
  }

  return { outDir, writeJson, writeText, writes };
}
