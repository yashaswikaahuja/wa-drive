import { requireAuth } from '../credentials.mjs';
import { listSessions, getSession, authMe } from '../api.mjs';
import { reportFromSession, formatSessionListLine } from '../report.mjs';

function deriveWsUrl(apiBase) {
  const origin = String(apiBase || '').replace(/\/$/, '').replace(/\/api$/i, '');
  return origin.replace(/^http/i, 'ws') + '/ws';
}

async function openWebSocket(url) {
  // Node 22+ has global WebSocket; otherwise use `ws` if installed
  if (typeof WebSocket !== 'undefined') {
    return new WebSocket(url);
  }
  try {
    const mod = await import('ws');
    const WS = mod.default || mod.WebSocket;
    return new WS(url);
  } catch {
    throw new Error(
      'No WebSocket in this Node. Use Node 22+ or: npm i ws -g / in cyb-cli'
    );
  }
}

function fmtLive(msg) {
  const ev = msg.event || '?';
  const label = (msg.label || msg.selector || '').toString().slice(0, 48);
  const planned = msg.planned != null ? String(msg.planned).slice(0, 36) : '';
  const actual = msg.actual != null ? String(msg.actual).slice(0, 36) : '';
  const fr = msg.failReason ? ` fail=${msg.failReason}` : '';
  const host = msg.hostname ? ` @${msg.hostname}` : '';
  if (ev === 'fill.start') return `▶ FILL START${host} fields…`;
  if (ev === 'fill.end') return `■ FILL END${host}`;
  if (ev === 'fill.session_saved') {
    return `★ SESSION SAVED ${msg.sessionId || ''} filled=${msg.filled} failed=${msg.failed}${host}`;
  }
  if (ev === 'field.start') return `  → start  ${label}  planned=${planned}`;
  if (ev === 'field.done') return `  ✓ done   ${label}  ${planned}${actual ? ' → ' + actual : ''}`;
  if (ev === 'field.fail') return `  ✗ fail   ${label}  ${planned}${fr}`;
  if (ev === 'field.wait') return `  … wait   ${label}  ${planned}${fr}`;
  return `  · ${ev} ${label} ${planned}${fr}`;
}

/**
 * Live watch over WSS fill_live fan-out (field-by-field).
 * Falls back to HTTPS session poll if WSS cannot connect.
 */
export async function cmdLive(flags) {
  const auth = requireAuth(flags);
  const pollMs = flags.pollMs || 3000;
  const wsUrl = `${deriveWsUrl(auth.apiBase)}?token=${encodeURIComponent(auth.accessToken)}`;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CYB LIVE — WSS field-by-field fill stream');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  API    ${auth.apiBase}`);
  console.log(`  WSS    ${deriveWsUrl(auth.apiBase)}`);
  console.log(`  Stop   Ctrl+C`);
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const me = await authMe(auth.apiBase, auth.accessToken);
    console.log(`Auth OK: ${me.email || me.name || me.id}\n`);
  } catch (e) {
    console.warn(`Auth check failed: ${e.message}\n`);
  }

  // Also seed completed sessions so we can still print full reports when a fill ends
  const seenSessions = new Set();
  try {
    const existing = await listSessions(auth.apiBase, auth.accessToken, { limit: 50 });
    for (const s of existing) seenSessions.add(s.id);
  } catch {
    /* ignore */
  }

  let usePollFallback = false;
  let sock;

  try {
    sock = await openWebSocket(wsUrl);
  } catch (e) {
    console.warn(`WSS unavailable (${e.message}) — falling back to HTTPS session poll.\n`);
    usePollFallback = true;
  }

  if (!usePollFallback && sock) {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('WSS connect timeout')), 12000);
      const onOpen = () => {
        /* wait for server 'connected' */
      };
      const onMsg = (raw) => {
        let msg;
        try {
          msg = JSON.parse(typeof raw === 'string' ? raw : raw.data || raw.toString());
        } catch {
          return;
        }
        if (msg.type === 'connected') {
          clearTimeout(t);
          console.log(`WSS connected session=${msg.sessionId || '?'}\nWaiting for fill_live events…\n`);
          resolve();
        }
        if (msg.type === 'error' && !msg.ref) {
          clearTimeout(t);
          reject(new Error(msg.message || msg.code || 'wss error'));
        }
      };
      const onErr = () => {
        clearTimeout(t);
        reject(new Error('WSS error'));
      };
      if (typeof sock.addEventListener === 'function') {
        sock.addEventListener('open', onOpen);
        sock.addEventListener('message', onMsg);
        sock.addEventListener('error', onErr);
      } else {
        sock.on('open', onOpen);
        sock.on('message', (data) => onMsg(data));
        sock.on('error', onErr);
      }
    }).catch((e) => {
      console.warn(`WSS handshake failed (${e.message}) — HTTPS poll fallback.\n`);
      usePollFallback = true;
      try {
        sock.close();
      } catch {
        /* ignore */
      }
    });
  }

  if (!usePollFallback && sock) {
    const handle = async (raw) => {
      let msg;
      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : raw.data || raw.toString());
      } catch {
        return;
      }
      if (msg.type === 'fill_live') {
        console.log(fmtLive(msg));
        // When a session is saved, pull full HTTPS report once
        if (msg.event === 'fill.session_saved' && msg.sessionId && !seenSessions.has(msg.sessionId)) {
          seenSessions.add(msg.sessionId);
          try {
            const full = await getSession(auth.apiBase, auth.accessToken, msg.sessionId);
            console.log('\n>>> SESSION REPORT');
            console.log(formatSessionListLine(full));
            const { lines } = reportFromSession(full);
            console.log(lines.join('\n'));
            console.log('');
          } catch (e) {
            console.warn(`(report fetch failed: ${e.message})`);
          }
        }
      } else if (msg.type === 'pong') {
        /* ignore */
      } else if (msg.type === 'error') {
        console.warn(`[wss error] ${msg.code || ''} ${msg.message || ''}`);
      }
    };

    if (typeof sock.addEventListener === 'function') {
      sock.addEventListener('message', handle);
      sock.addEventListener('close', () => {
        console.warn('\nWSS closed — exiting. Re-run cyb live.');
        process.exit(0);
      });
    } else {
      sock.on('message', (data) => handle(data));
      sock.on('close', () => {
        console.warn('\nWSS closed — exiting. Re-run cyb live.');
        process.exit(0);
      });
    }

    // Keepalive ping
    setInterval(() => {
      try {
        if (sock.readyState === 1) {
          sock.send(JSON.stringify({ v: 1, id: `ping.${Date.now()}`, type: 'ping', purpose: 'cyb_live' }));
        }
      } catch {
        /* ignore */
      }
    }, 20000);

    // Keep process alive
    await new Promise(() => {});
    return;
  }

  // ── HTTPS poll fallback (old behavior) ─────────────────────────────────
  console.log(`HTTPS poll every ${pollMs}ms (no field-by-field stream)\n`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const rows = await listSessions(auth.apiBase, auth.accessToken, { limit: 15 });
      for (const s of [...rows].reverse()) {
        if (seenSessions.has(s.id)) continue;
        seenSessions.add(s.id);
        console.log(`\n>>> NEW SESSION`);
        try {
          const full = await getSession(auth.apiBase, auth.accessToken, s.id);
          console.log(formatSessionListLine(full));
          const { lines } = reportFromSession(full);
          console.log(lines.join('\n'));
        } catch (e) {
          console.error(`Failed to load ${s.id}: ${e.message}`);
        }
      }
    } catch (e) {
      console.warn(`[poll] ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
