import Baileys from '@whiskeysockets/baileys';
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = Baileys as any;
import type { proto } from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import { Server as SocketIOServer } from 'socket.io';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { Readable } from 'stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = resolve(__dirname, '../../uploads/customers');
const AUTH_DIR = '/tmp/.baileys_auth';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/gif': 'gif', 'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
};

const customerMap = new Map<string, { id: string; name: string }>();
function findOrCreateCustomer(phone: string) {
  if (!customerMap.has(phone)) {
    customerMap.set(phone, { id: phone, name: `Guest ${phone.slice(-4)}` });
  }
  return customerMap.get(phone)!;
}

export class WhatsAppService {
  private sock: ReturnType<typeof makeWASocket> | null = null;
  private io: SocketIOServer | null = null;
  private isConnected = false;
  private lastQrCode: string | null = null;
  private driveAccessToken: string | null = null;

  setSocketIO(io: SocketIOServer) { this.io = io; }
  setDriveToken(token: string | null) { this.driveAccessToken = token; }
  getDriveToken() { return this.driveAccessToken; }
  getStatus() { return this.isConnected; }
  getQrCode() { return this.lastQrCode; }

  async init() {
    mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }: any) => {
      if (qr) {
        console.log('[WhatsApp] QR received');
        qrcodeTerminal.generate(qr, { small: true });
        try {
          this.lastQrCode = await qrcode.toDataURL(qr);
          this.io?.emit('connection:status', { connected: false, qrCode: this.lastQrCode });
        } catch {
          this.io?.emit('connection:status', { connected: false });
        }
      }
      if (connection === 'open') {
        console.log('[WhatsApp] Connected ✓');
        this.isConnected = true;
        this.lastQrCode = null;
        this.io?.emit('connection:status', { connected: true });
      }
      if (connection === 'close') {
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut && code !== 405;
        console.log('[WhatsApp] Disconnected, code:', code, 'reconnect:', shouldReconnect);
        this.isConnected = false;
        this.io?.emit('connection:status', { connected: false });
        if (shouldReconnect) {
          setTimeout(() => this.init(), 5000);
        }
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }: any) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        const hasMedia = !!(msg.message?.imageMessage || msg.message?.documentMessage ||
          msg.message?.videoMessage || msg.message?.audioMessage);
        if (hasMedia) {
          try { await this.handleMedia(msg); }
          catch (e) { console.error('[WhatsApp] Media error:', e); }
        }
      }
    });
  }

  private async handleMedia(msg: proto.IWebMessageInfo) {
    const from = msg.key.remoteJid ?? '';
    const phone = from.replace('@s.whatsapp.net', '').replace('@c.us', '').replace(/[^0-9+]/g, '');
    const customer = findOrCreateCustomer(phone);

    const imgMsg = msg.message?.imageMessage;
    const docMsg = msg.message?.documentMessage;
    const vidMsg = msg.message?.videoMessage;
    const audMsg = msg.message?.audioMessage;
    const mediaMsg = imgMsg || docMsg || vidMsg || audMsg;
    if (!mediaMsg) return;

    const mimetype = (mediaMsg as any).mimetype ?? 'application/octet-stream';
    const ext = MIME_TO_EXT[mimetype] ?? 'bin';
    const rawName = (docMsg?.fileName ?? '').replace(/\s+/g, '_').replace(/[:\\*?<>|]/g, '').replace(/\.[^.]+$/, '') || `file_${Date.now()}`;
    const fileName = `${phone}_${rawName}.${ext}`;

    const buffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer;
    console.log(`[WhatsApp] Downloaded ${fileName} (${mimetype}, ${buffer.length} bytes)`);

    let fileUrl: string;

    if (this.driveAccessToken) {
      try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: this.driveAccessToken });
        const drive = google.drive({ version: 'v3', auth });

        async function getOrCreateFolder(name: string, parentId?: string): Promise<string> {
          const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
          const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false and ${parentClause}`;
          const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive', pageSize: 1 });
          if (res.data.files?.length) return res.data.files[0].id!;
          const folder = await drive.files.create({
            requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId ?? 'root'] },
            fields: 'id',
          });
          return folder.data.id!;
        }

        const customersId = await getOrCreateFolder('customers');
        const phoneId = await getOrCreateFolder(phone, customersId);
        const file = await drive.files.create({
          requestBody: { name: fileName, parents: [phoneId] },
          media: { mimeType: mimetype, body: Readable.from(buffer) },
          fields: 'id,webContentLink',
        });
        await drive.permissions.create({
          fileId: file.data.id!,
          requestBody: { role: 'reader', type: 'anyone' },
        });
        fileUrl = file.data.webContentLink!;
        console.log(`[WhatsApp] Uploaded to Drive: ${fileUrl}`);
      } catch (e) {
        console.error('[WhatsApp] Drive upload failed, saving locally:', e);
        const dir = join(UPLOADS_ROOT, phone);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, fileName), buffer);
        fileUrl = `/uploads/customers/${phone}/${fileName}`;
      }
    } else {
      const dir = join(UPLOADS_ROOT, phone);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, fileName), buffer);
      fileUrl = `/uploads/customers/${phone}/${fileName}`;
      console.log(`[WhatsApp] Saved locally: ${fileUrl}`);
    }

    let profilePicUrl: string | null = null;
    try {
      profilePicUrl = await this.sock!.profilePictureUrl(from, 'image') ?? null;
    } catch { /* unavailable */ }

    this.io?.emit('new_whatsapp_file', {
      id: `${Date.now()}-${phone}`,
      customerId: phone,
      customerName: customer.name,
      fileName,
      fileUrl,
      profilePicUrl,
      timestamp: new Date().toISOString(),
    });
    console.log(`[WhatsApp] Emitted new_whatsapp_file: ${fileUrl}`);
  }

  async disconnect() {
    await this.sock?.end(undefined);
    this.sock = null;
    this.isConnected = false;
  }
}

export const whatsappService = new WhatsAppService();
