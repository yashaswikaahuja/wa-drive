#!/usr/bin/env node
/**
 * Mint a local JWT for test/local-codespace debugging.
 * Uses JWT_SECRET from extension-service/.env (or LOCAL default).
 *
 * Usage (from repo root):
 *   node scripts/mint-local-token.mjs
 *   node scripts/mint-local-token.mjs --workspace ws_local --user user_local
 *
 * Then set extension chrome.storage.local:
 *   backendUrl: https://<codespace-host>-3300.app.github.dev/api
 *   accessToken: <printed token>
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const envPath = resolve(ROOT, 'extension-service/.env');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const fileEnv = loadEnvFile(envPath);
const JWT_SECRET = process.env.JWT_SECRET || fileEnv.JWT_SECRET || 'local-codespace-jwt-secret-not-for-prod';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return fallback;
}

const workspaceId = arg('workspace', 'ws_local_dev');
const userId = arg('user', 'user_local_dev');
const role = arg('role', 'owner');
const days = Number(arg('days', '7'));

const require = createRequire(resolve(ROOT, 'extension-service/package.json'));
const jwt = require('jsonwebtoken');

const token = jwt.sign(
  { userId, workspaceId, role },
  JWT_SECRET,
  { expiresIn: `${days}d` }
);

console.log('\n=== Local JWT (test/local-codespace only) ===');
console.log('workspaceId:', workspaceId);
console.log('userId:     ', userId);
console.log('role:       ', role);
console.log('expires:    ', `${days}d`);
console.log('secret src: ', process.env.JWT_SECRET ? 'env' : (fileEnv.JWT_SECRET ? '.env' : 'built-in local default'));
console.log('\naccessToken:\n');
console.log(token);
console.log('\nExtension chrome.storage.local (example):');
console.log(JSON.stringify({
  backendUrl: 'http://127.0.0.1:3300/api',
  accessToken: '<paste token above>',
}, null, 2));
console.log('\nIn Codespaces, use the forwarded HTTPS URL for port 3300, e.g.:');
console.log('  backendUrl: https://<name>-3300.app.github.dev/api');
console.log('');
