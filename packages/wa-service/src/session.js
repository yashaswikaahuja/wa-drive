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
    });

    const session = { socket: sock, qr: null, status: 'connecting', phone: null };
    sessions.set(workspaceId, session);

    sock.ev.on('creds.update', saveCreds);

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
        let phone;
        let profilePicUrl = null;
        let savedName = null;

        if (senderJid.endsWith('@s.whatsapp.net')) {
          phone = senderJid.replace('@s.whatsapp.net', '');
          try {
            profilePicUrl = await sock.profilePictureUrl(senderJid, 'image');
          } catch {
            /* ignore — often blocked by privacy; resolver /contact may still have DP */
          }
          try {
            const data = await fetchContactName(phone);
            savedName = data.name || null;
            if (!profilePicUrl && data.dpUrl) profilePicUrl = data.dpUrl;
            console.log(
              `[WA] phone ${phone} resolver name=${data.name}` +
                ` isMyContact=${data.isMyContact}` +
                ` dp=${profilePicUrl ? 'yes' : 'no'}`,
            );
          } catch (e) {
            console.warn(`[WA] phone ${phone} resolver failed: ${e.message}`);
          }
        } else if (senderJid.endsWith('@lid')) {
          const lidNum = senderJid.replace('@lid', '');
          try {
            const data = await resolveLid(lidNum);
            phone = data.phone || lidNum;
            profilePicUrl = data.dpUrl || null;
            savedName = data.name || null;
            console.log(`[WA] LID ${lidNum} → ${phone}${savedName ? ' (' + savedName + ')' : ''}`);
          } catch (e) {
            console.warn(`[WA] LID ${lidNum} resolver error: ${e.message}`);
            phone = lidNum;
          }
        } else {
          phone = senderJid.replace(/@.*/, '') || rawJid.replace(/@.*/, '');
          console.warn(`[WA] sender JID has unknown format: ${senderJid} (rawJid=${rawJid})`);
        }

        const pushName = savedName || msg.pushName || phone;

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
