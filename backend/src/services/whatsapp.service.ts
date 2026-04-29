import WhatsAppWeb from 'whatsapp-web.js';
import qrcodeTerminal from 'qrcode-terminal';
import qrcode from 'qrcode';
import { Server as SocketIOServer } from 'socket.io';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { Readable } from 'stream';

const { Client, LocalAuth, NoAuth } = WhatsAppWeb as any;

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = resolve(__dirname, '../../uploads/customers');

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
  'application/pdf': 'pdf', 'application/zip': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
};

const customerMap = new Map<string, { id: string; name: string }>();
function findOrCreateCustomer(phone: string) {
  if (!customerMap.has(phone)) customerMap.set(phone, { id: phone, name: `Guest ${phone.slice(-4)}` });
  return customerMap.get(phone)!;
}

export class WhatsAppService {
  private client: any = null;
  private io: SocketIOServer | null = null;
  private isConnected = false;
  private isInitializing = false;
  private lastQrCode: string | null = null;
  private driveAccessToken: string | null = null;

  setSocketIO(io: SocketIOServer) { this.io = io; }
  setDriveToken(token: string | null) { this.driveAccessToken = token; }
  getDriveToken() { return this.driveAccessToken; }
  getStatus() { return this.isConnected; }
  getQrCode() { return this.lastQrCode; }

  async init() {

    this.isInitializing = true;
    try {
    const isDocker = process.env['PUPPETEER_EXECUTABLE_PATH'];
    this.client = new Client({
      authStrategy: isDocker ? new NoAuth() : new LocalAuth({ clientId: 'cybercafe_main' }),
      puppeteer: {
        headless: true,
        executablePath: process.env['PUPPETEER_EXECUTABLE_PATH'] || undefined,
        args: [
          '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
          '--disable-gpu', '--disable-extensions', '--mute-audio',
          '--js-flags=--max-old-space-size=256',
        ],
      },
    });

    this.client.on('qr', async (qr: string) => {
      console.log('[WhatsApp] QR received');
      qrcodeTerminal.generate(qr, { small: true });
      try {
        this.lastQrCode = await qrcode.toDataURL(qr);
        this.io?.emit('connection:status', { connected: false, qrCode: this.lastQrCode });
      } catch {
        this.io?.emit('connection:status', { connected: false });
      }
    });

    this.client.on('authenticated', () => {
      console.log('[WhatsApp] Authenticated ✓');
      this.isConnected = true;
      this.lastQrCode = null;
      this.io?.emit('connection:status', { connected: true });
    });

    this.client.on('ready', () => {
      console.log('[WhatsApp] Client ready! ✓');
      this.isConnected = true;
      this.lastQrCode = null;
      this.io?.emit('connection:status', { connected: true });
    });

    this.client.on('disconnected', () => {
      console.log('[WhatsApp] Client disconnected');
      this.isConnected = false;
      this.io?.emit('connection:status', { connected: false });
    });

    this.client.on('message_create', async (message: any) => {
      if (message.fromMe) return;
      console.log(`[WhatsApp] message_create: from=${message.from} hasMedia=${message.hasMedia} type=${message.type}`);
      if (message.hasMedia) {
        try { await this.handleMedia(message); }
        catch (e) { console.error('[WhatsApp] Media error:', e); }
      }
    });

    await this.client.initialize();
    } finally {
      this.isInitializing = false;
    }
  }

  private async handleMedia(message: any) {
    const rawFrom: string = message._data?.from ?? message.from;
    let phone: string;
    if (rawFrom.includes('@lid')) {
      try {
        const contact = await message.getContact();
        phone = contact.number || contact.id.user;
      } catch { phone = rawFrom.replace(/[^0-9+]/g, ''); }
    } else {
      phone = rawFrom.replace('@c.us', '').replace('@s.whatsapp.net', '').replace(/[^0-9+]/g, '');
    }

    const media = await message.downloadMedia();
    if (!media) { console.warn('[WhatsApp] downloadMedia() returned null'); return; }

    const mimetype: string = (media as any).mimetype ?? '';
    const ext = MIME_TO_EXT[mimetype] ?? 'bin';
    const rawName: string = media.filename ?? message._data?.filename ?? '';
    const baseName = rawName
      ? rawName.replace(/\s+/g, '_').replace(/[:\\*?<>|]/g, '').replace(/\.[^.]+$/, '')
      : `file_${Date.now()}`;
    const fileName = `${phone}_${baseName}.${ext}`;
    const buffer = Buffer.from(media.data, 'base64');
    console.log(`[WhatsApp] Downloaded ${fileName} (${mimetype}, ${buffer.length} bytes)`);

    const customer = findOrCreateCustomer(phone);
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
        // Use thumbnail URL for images, webContentLink for download
        const fileId = file.data.id!;
        // Use thumbnail URL (works without Google login for public files)
        fileUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`;
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
    try { profilePicUrl = await this.client.getProfilePicUrl(message.from) ?? null; } catch { /* unavailable */ }

    this.io?.emit('new_whatsapp_file', {
      id: `${Date.now()}-${phone}`,
      customerId: phone, customerName: customer.name,
      fileName, fileUrl, profilePicUrl,
      timestamp: new Date().toISOString(),
    });
    console.log(`[WhatsApp] Emitted: ${fileUrl}`);
  }

  async disconnect() {
    try { await this.client?.logout(); } catch { /* ignore */ }
    try { await this.client?.destroy(); } catch { /* ignore */ }
    this.client = null;
    this.isConnected = false;
    this.isInitializing = false;
    this.lastQrCode = null;
  }
}

export const whatsappService = new WhatsAppService();
