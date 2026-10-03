import fs from 'fs';
import path from 'path';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from 'baileys';
import { Boom } from '@hapi/boom';
import { pino } from 'pino';
import { usePostgresAuthState, clearPostgresAuthState } from '@cybercontrol/wa-auth';
import { downloadMedia, getExtFromMsg } from './media.js';

// Signal/session crypto failures can leave the TCP session "open" and the phone
// linked-device status Active while inbound media never decrypts — silent receive death.
const DESYNC_RE =
  /over 2000 messages into the future|sessionerror|failed to decrypt message|invalidmessageexception|bad mac|signal.*desync|desync/i;
const DESYNC_WINDOW_MS = 60_000;
const DESYNC_HIT_THRESHOLD = 5;
const MEDIA_FAIL_THRESHOLD = 5;

function createDesyncTracker(onThreshold: any) {
  const hits: any = [];
  return {
    note(text: any) {
      if (!DESYNC_RE.test(String(text || ''))) return false;
      const now = Date.now();
      while (hits.length && now - hits[0] > DESYNC_WINDOW_MS) hits.shift();
      hits.push(now);
      if (hits.length >= DESYNC_HIT_THRESHOLD) {
        hits.length = 0;
        onThreshold(String(text).slice(0, 240));
        return true;
      }
      return false;
    },
    reset() {
      hits.length = 0;
    },
  };
}

/** Baileys logger that stays quiet but watches decrypt/session errors. */
function createBaileysLogger(tracker: any) {
  const intercept = (args: any) => {
    try {
      const text = (args || [])
        .map((a: any) => {
          if (!a) return '';
          if (typeof a === 'string') return a;
          if (a instanceof Error) return a.message;
          if (typeof a === 'object') {
            return [a.msg, a.err?.message, a.error?.message, a.message].filter(Boolean).join(' ');
          }
          return String(a);
        })
        .join(' ');
      tracker.note(text);
    } catch {
      /* ignore */
    }
  };
  // Level 'error' so decrypt failures (Baileys logger.error) still invoke hooks;
  // we swallow output and only feed the desync tracker.
  return pino({
    level: 'error',
    hooks: {
      logMethod(inputArgs: unknown[]) {
        intercept(inputArgs);
      },
    },
  });
}

/**
 * @param {{
 *   config: ReturnType<import('./config.js').loadConfig>,
 *   parent: ReturnType<import('./parent.js').createParentBridge>,
 *   broadcastToWs: (workspaceId: string, data: object) => void,
 * }} deps
 */
export function createSessionManager({
  config,
  parent,
  broadcastToWs
}: any) {
  const sessions = new Map();
  const { AUTH_DIR, pgPool } = config;
  const { uploadToParent, notifyParent, resolveLid, fetchContactName } = parent;

  async function ensureContactsTable() {
    // @ts-expect-error TS(2339): Property '_done' does not exist on type '() => Pro... Remove this comment to see the full error message
    if (!pgPool || ensureContactsTable._done) return;
    try {
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS workspace_wa_contacts (
          workspace_id UUID NOT NULL,
          phone TEXT NOT NULL,
          name TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (workspace_id, phone)
        )`);
      // @ts-expect-error TS(2339): Property '_done' does not exist on type '() => Pro... Remove this comment to see the full error message
      ensureContactsTable._done = true;
    } catch (e) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      console.warn('[WA] workspace_wa_contacts ensure failed:', e.message);
    }
  }

  async function persistContactName(workspaceId: any, phone: any, name: any) {
    if (!pgPool || !workspaceId || !phone || !name) return;
    const pn = String(phone).replace(/[^0-9]/g, '');
    if (pn.length < 8) return;
    try {
      await ensureContactsTable();
      await pgPool.query(
        `INSERT INTO workspace_wa_contacts(workspace_id, phone, name, updated_at)
         VALUES($1::uuid,$2,$3,now())
         ON CONFLICT(workspace_id, phone) DO UPDATE
           SET name = EXCLUDED.name, updated_at = now()
           WHERE workspace_wa_contacts.name IS DISTINCT FROM EXCLUDED.name`,
        [workspaceId, pn, name],
      );
    } catch (e) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      console.warn('[WA] persist contact failed:', e.message);
    }
  }

  async function loadPersistedContacts(session: any, workspaceId: any) {
    if (!pgPool || !workspaceId) return;
    try {
      await ensureContactsTable();
      const r = await pgPool.query(
        `SELECT phone, name FROM workspace_wa_contacts WHERE workspace_id = $1::uuid`,
        [workspaceId],
      );
      for (const row of r.rows) {
        session.contacts.set(`pn:${row.phone}`, { name: row.name, notify: null, imgUrl: null });
      }
      if (r.rows.length) {
        console.log(`[WA:${workspaceId.slice(0, 8)}] Loaded ${r.rows.length} saved contact-list names from DB`);
      }
    } catch (e) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      console.warn('[WA] load contacts failed:', e.message);
    }
  }

  function indexContact(session: any, contact: any, workspaceId: any) {
    if (!contact?.id) return;
    const id = String(contact.id);
    const phone =
      (contact.phoneNumber && String(contact.phoneNumber).replace(/@.*/, '')) ||
      (id.endsWith('@s.whatsapp.net') ? id.replace('@s.whatsapp.net', '') : null);
    const lid = contact.lid
      ? String(contact.lid).replace(/@.*/, '')
      : id.endsWith('@lid')
        ? id.replace('@lid', '')
        : null;
    const prev =
      (phone && session.contacts.get(`pn:${phone}`)) ||
      (lid && session.contacts.get(`lid:${lid}`)) ||
      session.contacts.get(`id:${id}`) ||
      null;
    // Baileys: `name` = saved address-book name ONLY; `notify` = their WA push name.
    const savedName = (contact.name && String(contact.name).trim()) || null;
    const entry = {
      name: savedName || prev?.name || null,
      notify: contact.notify || contact.verifiedName || prev?.notify || null,
      imgUrl: typeof contact.imgUrl === 'string' ? contact.imgUrl : prev?.imgUrl || null,
    };
    if (phone) session.contacts.set(`pn:${phone}`, entry);
    if (lid) session.contacts.set(`lid:${lid}`, entry);
    session.contacts.set(`id:${id}`, entry);
    if (savedName && phone) persistContactName(workspaceId, phone, savedName);
  }

  async function lookupLocalContact(session: any, {
    phone,
    senderJid,
    workspaceId
  }: any) {
    if (!session?.contacts) return null;
    const mem =
      (phone && session.contacts.get(`pn:${phone}`)) ||
      (senderJid && session.contacts.get(`id:${senderJid}`)) ||
      (senderJid?.endsWith('@lid') && session.contacts.get(`lid:${senderJid.replace('@lid', '')}`)) ||
      null;
    if (mem?.name) return mem;
    if (pgPool && workspaceId && phone && /^\d{8,}$/.test(phone)) {
      try {
        await ensureContactsTable();
        const r = await pgPool.query(
          `SELECT name FROM workspace_wa_contacts WHERE workspace_id=$1::uuid AND phone=$2 LIMIT 1`,
          [workspaceId, phone],
        );
        if (r.rows[0]?.name) {
          const entry = { name: r.rows[0].name, notify: mem?.notify || null, imgUrl: mem?.imgUrl || null };
          session.contacts.set(`pn:${phone}`, entry);
          return entry;
        }
      } catch {
        /* ignore */
      }
    }
    return mem;
  }

  async function startSession(workspaceId: any) {
    if (sessions.has(workspaceId) && sessions.get(workspaceId).socket) {
      console.log(`[WA:${workspaceId.slice(0, 8)}] Session already active`);
      return;
    }

    const sessionDir = path.join(AUTH_DIR, workspaceId);
    let state;
    let saveCreds;
    if (pgPool) {
      ({ state, saveCreds } = await usePostgresAuthState(pgPool, workspaceId));
    } else {
      fs.mkdirSync(sessionDir, { recursive: true });
      ({ state, saveCreds } = await useMultiFileAuthState(sessionDir));
    }
    const { version } = await fetchLatestBaileysVersion();

    const prior = sessions.get(workspaceId);
    if (prior?.reconnectTimer) {
      clearTimeout(prior.reconnectTimer);
      prior.reconnectTimer = null;
    }

    const session = {
      socket: null,
      qr: null,
      status: 'connecting',
      phone: null,
      contacts: new Map(),
      workspaceId,
      // Preserve across reconnects so the 3-attempt re-auth cap can accumulate.
      // Reset only on successful open (below) or after an auth wipe.
      reconnectAttempts: prior?.reconnectAttempts || 0,
      reconnectTimer: null,
      lastDisconnectReason: prior?.lastDisconnectReason || null,
      lastDisconnectAt: prior?.lastDisconnectAt || null,
      lastUploadAt: prior?.lastUploadAt || null,
      lastDesyncAt: prior?.lastDesyncAt || null,
      failedMediaDownloads: 0,
      stopping: false,
      forcingReauth: false,
      desyncReauthDone: false,
    };

    const desyncTracker = createDesyncTracker((reason: any) => {
      forceReauthWhileConnected(reason).catch((e) =>
        console.error(`[WA:${workspaceId.slice(0, 8)}] Desync re-auth failed:`, e.message),
      );
    });

    async function forceReauthWhileConnected(reason: any) {
      if (!session || session.forcingReauth || session.stopping || session.desyncReauthDone) return;
      if (session.status !== 'connected' && session.status !== 'connecting') return;
      session.forcingReauth = true;
      session.desyncReauthDone = true;
      session.lastDesyncAt = new Date().toISOString();
      session.lastDisconnectReason = `desync_while_connected:${reason}`;
      session.lastDisconnectAt = session.lastDesyncAt;
      console.warn(
        `[WA:${workspaceId.slice(0, 8)}] Desync while connected — forcing re-auth (${reason})`,
      );
      notifyParent(workspaceId, 'reauth_required', {
        desynced: true,
        reason,
        whileConnected: true,
      });
      broadcastToWs(workspaceId, {
        type: 'status',
        connected: false,
        status: 'reauth_required',
        workspaceId,
      });
      try {
        if (pgPool) await clearPostgresAuthState(pgPool, workspaceId);
        else fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch (e) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        console.error(`[WA:${workspaceId.slice(0, 8)}] Failed to clear auth on desync:`, e.message);
      }
      session.reconnectAttempts = 0;
      session.status = 'qr_pending';
      desyncTracker.reset();
      try {
        // @ts-expect-error TS(2339): Property 'end' does not exist on type 'never'.
        session.socket?.end?.(undefined);
      } catch {
        /* ignore */
      }
    }

    const sock = makeWASocket({
      version,
      // @ts-expect-error TS(2322): Type '{ creds: any; keys: { get: (type: string, id... Remove this comment to see the full error message
      auth: state,
      logger: createBaileysLogger(desyncTracker),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      browser: ['CyberControl', 'Chrome', '1.0'],
      syncFullHistory: true,
      shouldSyncHistoryMessage: () => true,
    });
    // @ts-expect-error TS(2322): Type '{ logger: ILogger; getOrderDetails: (orderId... Remove this comment to see the full error message
    session.socket = sock;
    sessions.set(workspaceId, session);
    await loadPersistedContacts(session, workspaceId);

    sock.ev.on('creds.update', saveCreds);

    // Cafe WhatsApp address book — this is where "saved contact" names live.
    sock.ev.on('contacts.upsert', (list) => {
      for (const c of list || []) indexContact(session, c, workspaceId);
    });
    sock.ev.on('contacts.update', (list) => {
      for (const c of list || []) indexContact(session, c, workspaceId);
    });
    sock.ev.on('messaging-history.set', ({ contacts }) => {
      for (const c of contacts || []) indexContact(session, c, workspaceId);
      if (contacts?.length) {
        console.log(`[WA:${workspaceId.slice(0, 8)}] Indexed ${session.contacts.size} contact keys from history`);
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'null'.
        session.qr = qr;
        session.status = 'qr_pending';
        broadcastToWs(workspaceId, { type: 'qr', qr, workspaceId });
        notifyParent(workspaceId, 'qr', { qr });
      }

      if (connection === 'open') {
        session.status = 'connected';
        session.qr = null;
        // @ts-expect-error TS(2322): Type 'string | null' is not assignable to type 'nu... Remove this comment to see the full error message
        session.phone = sock.user?.id?.split(':')[0] || null;
        session.reconnectAttempts = 0;
        session.lastDisconnectReason = null;
        session.forcingReauth = false;
        session.desyncReauthDone = false;
        session.failedMediaDownloads = 0;
        desyncTracker.reset();
        if (session.reconnectTimer) {
          clearTimeout(session.reconnectTimer);
          session.reconnectTimer = null;
        }
        console.log(`[WA:${workspaceId.slice(0, 8)}] Connected as ${session.phone}`);
        sock.sendPresenceUpdate('unavailable').catch(() => {});
        // Force address-book / app-state sync so contacts.upsert gets saved names.
        sock
          .resyncAppState(
            ['critical_block', 'critical_unblock_low', 'regular_high', 'regular_low', 'regular'],
            true,
          )
          .then(() => {
            console.log(`[WA:${workspaceId.slice(0, 8)}] App-state sync requested (contacts)`);
          })
          .catch((e) => {
            console.warn(`[WA:${workspaceId.slice(0, 8)}] App-state sync failed:`, e.message);
          });
        notifyParent(workspaceId, 'connected', { phone: session.phone });
        broadcastToWs(workspaceId, {
          type: 'status',
          connected: true,
          phone: session.phone,
          workspaceId,
        });
      }

      if (connection === 'close') {
        const disconnectError = lastDisconnect?.error;
        const reason = new Boom(disconnectError)?.output?.statusCode;
        const errorMessage = String(disconnectError?.message || disconnectError || '');
        const loggedOut = reason === DisconnectReason.loggedOut;
        const desynced =
          session.desyncReauthDone || DESYNC_RE.test(errorMessage);
        const nextAttempt = session.reconnectAttempts + 1;
        const reauthRequired = !loggedOut && (desynced || nextAttempt >= 3);

        session.reconnectAttempts = nextAttempt;
        session.lastDisconnectReason =
          session.lastDisconnectReason?.startsWith('desync_while_connected:')
            ? session.lastDisconnectReason
            : reason || errorMessage || 'unknown';
        session.lastDisconnectAt = new Date().toISOString();
        session.status = loggedOut || reauthRequired ? 'logged_out' : 'disconnected';
        session.socket = null;

        // Intentional stop / force-restart: no reconnect scheduling.
        // Still tell the hub so owner-panel whatsapp_numbers.disconnected_at updates.
        // Auth wipe for logout is owned by stopSession so force end() does not wipe.
        if (session.stopping) {
          session.status = 'disconnected';
          notifyParent(workspaceId, 'disconnected', {
            loggedOut,
            reason: reason || null,
            intentional: true,
          });
          broadcastToWs(workspaceId, { type: 'status', connected: false, workspaceId });
          return;
        }

        // Already wiped + notified by forceReauthWhileConnected — just restart for QR.
        if (session.desyncReauthDone) {
          session.status = 'qr_pending';
          session.forcingReauth = false;
          console.log(
            `[WA:${workspaceId.slice(0, 8)}] Closed after desync-while-connected re-auth — awaiting QR`,
          );
        } else {
          console.log(
            `[WA:${workspaceId.slice(0, 8)}] Disconnected: ${reason} loggedOut=${loggedOut}` +
              ` attempt=${nextAttempt} desynced=${desynced} reauth=${reauthRequired}`,
          );
          notifyParent(workspaceId, reauthRequired ? 'reauth_required' : 'disconnected', {
            loggedOut,
            reason: reason || null,
            attempt: nextAttempt,
            desynced,
          });
          broadcastToWs(workspaceId, { type: 'status', connected: false, workspaceId });

          if (loggedOut || reauthRequired) {
            try {
              if (pgPool) await clearPostgresAuthState(pgPool, workspaceId);
              else fs.rmSync(sessionDir, { recursive: true, force: true });
            } catch (e) {
              // @ts-expect-error TS(2571): Object is of type 'unknown'.
              console.error(`[WA:${workspaceId.slice(0, 8)}] Failed to clear auth:`, e.message);
            }
            session.reconnectAttempts = 0;
            session.status = 'qr_pending';
          }
        }

        const delay = reauthRequired || loggedOut
          ? 1000
          : Math.min(5000 * 2 ** Math.max(0, nextAttempt - 1), 30000);

        if (!session.reconnectTimer) {
          // @ts-expect-error TS(2322): Type 'Timeout' is not assignable to type 'null'.
          session.reconnectTimer = setTimeout(() => {
            session.reconnectTimer = null;
            startSession(workspaceId).catch((e) =>
              console.error(`[WA:${workspaceId.slice(0, 8)}] Reconnect failed:`, e.message),
            );
          }, delay);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const innerMsg =
          msg.message?.viewOnceMessage?.message ||
          msg.message?.viewOnceMessageV2?.message ||
          msg.message?.documentWithCaptionMessage?.message ||
          msg.message ||
          {};
        const hasMedia =
          innerMsg.imageMessage ||
          innerMsg.documentMessage ||
          msg.message?.documentWithCaptionMessage?.message?.documentMessage;
        if (!hasMedia) continue;

        const rawJid = msg.key.remoteJid || '';
        const participantJid = msg.key.participant || '';
        const senderJid = rawJid.endsWith('@g.us') ? participantJid : rawJid;
        // Prefer phone from message metadata when WhatsApp includes it with LID chats.
        const altPn =
          // @ts-expect-error TS(2339): Property 'remoteJidAlt' does not exist on type 'IM... Remove this comment to see the full error message
          msg.key.remoteJidAlt?.replace(/@.*/, '') ||
          // @ts-expect-error TS(2339): Property 'senderPn' does not exist on type 'IMessa... Remove this comment to see the full error message
          msg.key.senderPn?.replace(/@.*/, '') ||
          // @ts-expect-error TS(2551): Property 'participantPn' does not exist on type 'I... Remove this comment to see the full error message
          msg.key.participantPn?.replace(/@.*/, '') ||
          null;
        let phone = altPn;
        let profilePicUrl = null;
        // Address-book name only (never OCR/profile, never WA pushname).
        let contactListName = null;

        if (senderJid.endsWith('@s.whatsapp.net')) {
          phone = senderJid.replace('@s.whatsapp.net', '');
        } else if (senderJid.endsWith('@lid')) {
          const lidNum = senderJid.replace('@lid', '');
          try {
            const data = await resolveLid(lidNum);
            phone = data.phone || phone || lidNum;
            profilePicUrl = data.dpUrl || null;
            // Name comes from cafe address book only (looked up below) — not resolver.
            console.log(`[WA] LID ${lidNum} → ${phone}`);
          } catch (e) {
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            console.warn(`[WA] LID ${lidNum} resolver error: ${e.message}`);
            phone = phone || lidNum;
          }
        } else {
          phone = phone || senderJid.replace(/@.*/, '') || rawJid.replace(/@.*/, '');
          console.warn(`[WA] sender JID has unknown format: ${senderJid} (rawJid=${rawJid})`);
        }

        // 1) Cafe WA address book (Baileys + DB) — ONLY source for contact-list names.
        const local = await lookupLocalContact(session, { phone, senderJid, workspaceId });
        if (local?.name) contactListName = local.name;
        if (!profilePicUrl && local?.imgUrl) profilePicUrl = local.imgUrl;

        // 2) Baileys profile picture for the phone JID (works more often than LID).
        if (!profilePicUrl && phone && /^\d{8,}$/.test(phone)) {
          try {
            profilePicUrl = await sock.profilePictureUrl(`${phone}@s.whatsapp.net`, 'image');
          } catch {
            try {
              profilePicUrl = await sock.profilePictureUrl(senderJid, 'image');
            } catch {
              /* privacy / none */
            }
          }
        }

        // 3) Resolver — DP + LID support only. Do NOT use resolver contact names:
        // resolver is often a different WhatsApp than the cafe phone's address book.
        if (phone && /^\d{8,}$/.test(phone)) {
          try {
            const data = await fetchContactName(phone);
            if (!profilePicUrl && data.dpUrl) profilePicUrl = data.dpUrl;
            console.log(
              `[WA] phone ${phone} contactList=${contactListName || '-'}` +
                ` local=${local?.name || '-'} resolverSaved=${data.savedName || '-'}` +
                ` (ignored for label) dp=${profilePicUrl ? 'yes' : 'no'}`,
            );
          } catch (e) {
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            console.warn(`[WA] phone ${phone} resolver failed: ${e.message}`);
          }
        }

        // Display: cafe contact-list name first; else live WA push name; else phone.
        // Never use document/OCR profile names, never resolver address book.
        const pushName = contactListName || msg.pushName || phone;

        try {
          const buffer = await downloadMedia(sock, msg);
          if (!buffer) {
            session.failedMediaDownloads = (session.failedMediaDownloads || 0) + 1;
            console.warn(
              `[WA:${workspaceId.slice(0, 8)}] Media download empty (${session.failedMediaDownloads})`,
            );
            if (session.failedMediaDownloads >= MEDIA_FAIL_THRESHOLD) {
              await forceReauthWhileConnected('repeated media download failure while connected');
            }
            continue;
          }

          const ext = getExtFromMsg(msg);
          const fileName = `${phone}_${Date.now()}_file.${ext}`;

          await uploadToParent(workspaceId, buffer, fileName, phone, pushName, profilePicUrl);
          session.lastUploadAt = new Date().toISOString();
          session.failedMediaDownloads = 0;
          console.log(`[WA:${workspaceId.slice(0, 8)}] Uploaded ${fileName} from ${pushName}`);
        } catch (e) {
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          console.error(`[WA:${workspaceId.slice(0, 8)}] Media error:`, e.message);
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          desyncTracker.note(e.message);
          session.failedMediaDownloads = (session.failedMediaDownloads || 0) + 1;
          if (session.failedMediaDownloads >= MEDIA_FAIL_THRESHOLD) {
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            await forceReauthWhileConnected(`repeated media error: ${e.message}`);
          }
        }
      }
    });
  }

  async function stopSession(workspaceId: any) {
    const session = sessions.get(workspaceId);
    const sessionDir = path.join(AUTH_DIR, workspaceId);
    if (session?.socket) {
      session.stopping = true;
      await session.socket.logout().catch(() => {});
      session.socket = null;
      session.status = 'disconnected';
    }
    if (session?.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
    // Wipe auth on intentional stop so a later start cannot reload logged-out keys.
    // (close handler returns early when stopping=true, so wipe lives here.)
    try {
      if (pgPool) await clearPostgresAuthState(pgPool, workspaceId);
      else fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (e) {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      console.error(`[WA:${workspaceId.slice(0, 8)}] Failed to clear auth on stop:`, e.message);
    }
    sessions.delete(workspaceId);
  }

  return { sessions, startSession, stopSession };
}
