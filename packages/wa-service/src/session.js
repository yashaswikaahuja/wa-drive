import fs from 'fs';
import path from 'path';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from 'baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { usePostgresAuthState, clearPostgresAuthState } from '@cybercontrol/wa-auth';
import { downloadMedia, getExtFromMsg } from './media.js';

/**
 * @param {{
 *   config: ReturnType<import('./config.js').loadConfig>,
 *   parent: ReturnType<import('./parent.js').createParentBridge>,
 *   broadcastToWs: (workspaceId: string, data: object) => void,
 * }} deps
 */
export function createSessionManager({ config, parent, broadcastToWs }) {
  const sessions = new Map();
  const { AUTH_DIR, pgPool } = config;
  const { uploadToParent, notifyParent, resolveLid, fetchContactName } = parent;

  async function ensureContactsTable() {
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
      ensureContactsTable._done = true;
    } catch (e) {
      console.warn('[WA] workspace_wa_contacts ensure failed:', e.message);
    }
  }

  async function persistContactName(workspaceId, phone, name) {
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
      console.warn('[WA] persist contact failed:', e.message);
    }
  }

  async function loadPersistedContacts(session, workspaceId) {
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
      console.warn('[WA] load contacts failed:', e.message);
    }
  }

  function indexContact(session, contact, workspaceId) {
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

  async function lookupLocalContact(session, { phone, senderJid, workspaceId }) {
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

  async function startSession(workspaceId) {
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

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      browser: ['CyberControl', 'Chrome', '1.0'],
      syncFullHistory: true,
      shouldSyncHistoryMessage: () => true,
    });

    const session = {
      socket: sock,
      qr: null,
      status: 'connecting',
      phone: null,
      contacts: new Map(),
      workspaceId,
    };
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

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        session.qr = qr;
        session.status = 'qr_pending';
        broadcastToWs(workspaceId, { type: 'qr', qr, workspaceId });
        notifyParent(workspaceId, 'qr', { qr });
      }

      if (connection === 'open') {
        session.status = 'connected';
        session.qr = null;
        session.phone = sock.user?.id?.split(':')[0] || null;
        console.log(`[WA:${workspaceId.slice(0, 8)}] Connected as ${session.phone}`);
        sock.sendPresenceUpdate('unavailable').catch(() => {});
        notifyParent(workspaceId, 'connected', { phone: session.phone });
        broadcastToWs(workspaceId, {
          type: 'status',
          connected: true,
          phone: session.phone,
          workspaceId,
        });
      }

      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const loggedOut = reason === DisconnectReason.loggedOut;
        session.status = loggedOut ? 'logged_out' : 'disconnected';
        session.socket = null;
        console.log(`[WA:${workspaceId.slice(0, 8)}] Disconnected: ${reason} loggedOut=${loggedOut}`);
        notifyParent(workspaceId, 'disconnected', { loggedOut });
        broadcastToWs(workspaceId, { type: 'status', connected: false, workspaceId });

        if (loggedOut) {
          if (pgPool) clearPostgresAuthState(pgPool, workspaceId).catch(() => {});
          else fs.rmSync(sessionDir, { recursive: true, force: true });
        } else {
          setTimeout(() => startSession(workspaceId), 5000);
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
          msg.key.remoteJidAlt?.replace(/@.*/, '') ||
          msg.key.senderPn?.replace(/@.*/, '') ||
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
            console.warn(`[WA] phone ${phone} resolver failed: ${e.message}`);
          }
        }

        // Display: cafe contact-list name first; else live WA push name; else phone.
        // Never use document/OCR profile names, never resolver address book.
        const pushName = contactListName || msg.pushName || phone;

        try {
          const buffer = await downloadMedia(sock, msg);
          if (!buffer) continue;

          const ext = getExtFromMsg(msg);
          const fileName = `${phone}_${Date.now()}_file.${ext}`;

          await uploadToParent(workspaceId, buffer, fileName, phone, pushName, profilePicUrl);
          console.log(`[WA:${workspaceId.slice(0, 8)}] Uploaded ${fileName} from ${pushName}`);
        } catch (e) {
          console.error(`[WA:${workspaceId.slice(0, 8)}] Media error:`, e.message);
        }
      }
    });
  }

  async function stopSession(workspaceId) {
    const session = sessions.get(workspaceId);
    if (session?.socket) {
      await session.socket.logout().catch(() => {});
      session.socket = null;
      session.status = 'disconnected';
    }
    sessions.delete(workspaceId);
  }

  return { sessions, startSession, stopSession };
}
