import { requireAuth } from '../credentials.mjs';
import { listSessions, getSession, authMe } from '../api.mjs';
import { reportFromSession, formatSessionListLine } from '../report.mjs';
import { peekJwtClaims, jwtTtlSeconds } from '../jwt.mjs';

function deriveWsUrl(apiBase) {
  const origin = String(apiBase || '').replace(/\/$/, '').replace(/\/api$/i, '');
  return origin.replace(/^http/i, 'ws') + '/ws';
}

async function openWebSocket(url) {
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

function attach(sock, event, fn) {
  if (typeof sock.addEventListener === 'function') {
    sock.addEventListener(event, fn);
  } else if (event === 'message') {
    sock.on('message', (data) => fn({ data }));
  } else {
    sock.on(event, fn);
  }
}

/**
 * Live watch over WSS fill_live fan-out (field-by-field).
 * Auto-reconnects on close (common during Fill / LB blips).
 * Falls back to HTTPS session poll if WSS cannot connect at all.
 */
export async function cmdLive(flags) {
  const auth = await requireAuth(flags);
  const pollMs = flags.pollMs || 3000;
  const claims = peekJwtClaims(auth.accessToken) || auth.claims || null;
  const wsHint = claims?.workspaceId || claims?.wid || null;
  const ttl = jwtTtlSeconds(auth.accessToken);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  CYB LIVE — WSS field-by-field fill stream');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  API    ${auth.apiBase}`);
  console.log(`  WSS    ${deriveWsUrl(auth.apiBase)}`);
  if (wsHint) console.log(`  WS ID  ${wsHint}  (must match extension login workspace)`);
  if (ttl != null) console.log(`  Token  expires in ${Math.max(0, ttl)}s`);
  console.log(`  Stop   Ctrl+C`);
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('Expect during fill: ▶ FILL START → field.start/done → ■ FILL END');
  console.log('(If you only see ★ SESSION SAVED, field debug is still not reaching WSS.)\n');

  try {
    const me = await authMe(auth.apiBase, auth.accessToken);
    console.log(
      `Auth OK: ${me.email || me.name || me.id}` +
        (me.workspaceId || me.workspace_id
          ? `  workspace=${me.workspaceId || me.workspace_id}`
          : '') +
        '\n'
    );
  } catch (e) {
    console.error(`Auth check failed: ${e.message}`);
    console.error('  Token is invalid/expired for HTTPS — WSS will also fail.');
    console.error('  Run:  cyb login\n');
    process.exitCode = 1;
    return;
  }

  const seenSessions = new Set();
  try {
    const existing = await listSessions(auth.apiBase, auth.accessToken, { limit: 50 });
    for (const s of existing) seenSessions.add(s.id);
  } catch {
    /* ignore */
  }

  const wsUrl = `${deriveWsUrl(auth.apiBase)}?token=${encodeURIComponent(auth.accessToken)}`;

  // ── WSS with auto-reconnect ──────────────────────────────────────────
  let attempt = 0;
  const maxBackoffMs = 15000;

  while (true) {
    attempt += 1;
    let sock;
    try {
      sock = await openWebSocket(wsUrl);
    } catch (e) {
      console.warn(`WSS open failed (${e.message}) — HTTPS poll fallback.\n`);
      break;
    }

    const handshakeOk = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), 12000);
      attach(sock, 'message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(typeof raw.data === 'string' ? raw.data : raw.data?.toString?.() || raw.toString());
        } catch {
          return;
        }
        if (msg.type === 'connected') {
          clearTimeout(t);
          console.log(
            `${attempt > 1 ? '[re]connected' : 'WSS connected'} session=${msg.sessionId || '?'}` +
              `\nWaiting for fill_live events…\n`
          );
          resolve(true);
        }
        if (msg.type === 'error' && !msg.ref) {
          clearTimeout(t);
          console.warn(`[wss handshake error] ${msg.code || ''} ${msg.message || ''}`);
          resolve(false);
        }
      });
      attach(sock, 'error', () => {
        clearTimeout(t);
        resolve(false);
      });
      attach(sock, 'close', (ev) => {
        clearTimeout(t);
        const code = ev?.code ?? ev;
        const reason = ev?.reason || '';
        if (code) console.warn(`[wss] closed during handshake code=${code} ${reason}`);
        resolve(false);
      });
    });

    if (!handshakeOk) {
      try {
        sock.close();
      } catch {
        /* ignore */
      }
      const backoff = Math.min(maxBackoffMs, 1000 * Math.pow(1.5, Math.min(attempt, 8)));
      console.warn(`WSS handshake failed — retry in ${Math.round(backoff / 1000)}s (Ctrl+C to stop)\n`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    attempt = 1; // reset after success

    const closed = await new Promise((resolve) => {
      const handle = async (raw) => {
        let msg;
        try {
          const data = typeof raw.data === 'string' ? raw.data : raw.data?.toString?.() || raw.toString();
          msg = JSON.parse(data);
        } catch {
          return;
        }
        if (msg.type === 'fill_live') {
          console.log(fmtLive(msg));
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
        } else if (msg.type === 'connected') {
          console.log(`[wss] (re)connected session=${msg.sessionId || '?'}`);
        } else if (msg.type === 'pong' || msg.type === 'ping') {
          /* ignore */
        } else if (msg.type === 'error') {
          console.warn(`[wss error] ${msg.code || ''} ${msg.message || ''}`);
          if (String(msg.code || '').includes('auth') || /401|403|token|jwt/i.test(msg.message || '')) {
            console.warn('  Auth error on socket — run: cyb login');
          }
        } else if (msg.type && msg.type !== 'fill_debug_ack') {
          console.log(`[wss] ${msg.type}`);
        }
      };

      attach(sock, 'message', handle);
      attach(sock, 'close', (ev) => {
        const code = ev?.code ?? '?';
        const reason = (ev?.reason || '').toString();
        resolve({ code, reason });
      });
      attach(sock, 'error', () => {
        /* close will follow */
      });

      const pingTimer = setInterval(() => {
        try {
          if (sock.readyState === 1) {
            sock.send(
              JSON.stringify({
                v: 1,
                id: `ping.${Date.now()}`,
                type: 'ping',
                purpose: 'cyb_live',
              })
            );
          }
        } catch {
          /* ignore */
        }
      }, 15000);

      // clear ping on close
      attach(sock, 'close', () => clearInterval(pingTimer));
    });

    console.warn(
      `\nWSS closed code=${closed.code} ${closed.reason || ''} — reconnecting…` +
        (closed.code === 4002 || closed.code === 4003
          ? '\n  Auth close from server — run: cyb login'
          : '')
    );
    await new Promise((r) => setTimeout(r, 1500));
  }

  // ── HTTPS poll fallback ─────────────────────────────────────────────
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
      if (/Auth failed|401|403|expired/i.test(e.message)) {
        console.warn('  Run: cyb login');
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
