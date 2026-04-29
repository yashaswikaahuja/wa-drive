import WhatsAppWeb from 'whatsapp-web.js';
import qrcodeTerminal from 'qrcode-terminal';
import qrcode from 'qrcode';
import { Server as SocketIOServer } from 'socket.io';
import { mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { saveWhatsAppFile } from '../db.js';

const { Client, LocalAuth, NoAuth } = WhatsAppWeb;
type WhatsAppClient = InstanceType<typeof WhatsAppWeb.Client>;
type MessageMedia = InstanceType<typeof WhatsAppWeb.MessageMedia>;

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = resolve(__dirname, '../../uploads/customers');

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
  'application/pdf': 'pdf',
  'application/zip': 'zip', 'application/x-zip-compressed': 'zip',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  'video/mp4': 'mp4', 'video/3gpp': '3gp',
};

function mimeToType(mime: string): string {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'document';
  return 'file';
}

function sanitizeFolderName(name: string): string {
  return name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
}

function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Mock customer store — replace with DB query later
const customerMap = new Map<string, { id: string; name: string; folderName: string }>();

function findOrCreateCustomer(phone: string) {
  if (customerMap.has(phone)) return customerMap.get(phone)!;
  const folderName = phone;
  const customer = { id: phone, name: `Guest ${phone.slice(-4)}`, folderName };
  customerMap.set(phone, customer);
  return customer;
}

export class WhatsAppService {
  private client: WhatsAppClient | null = null;
  private io: SocketIOServer | null = null;
  private isConnected = false;
  private driveAccessToken: string | null = null;
  private lastQrCode: string | null = null;

  setSocketIO(io: SocketIOServer): void { this.io = io; }
  setDriveToken(token: string | null): void { this.driveAccessToken = token; }
  getDriveToken(): string | null { return this.driveAccessToken; }
  getStatus(): boolean { return this.isConnected; }
  getQrCode(): string | null { return this.lastQrCode; }

  async init(): Promise<void> {
    const cacheDir = process.env['PUPPETEER_CACHE_DIR'];
    const executablePath = cacheDir
      ? (() => {
          try {
            const { execSync } = require('child_process');
            return execSync(`find ${cacheDir} -name "chrome" -type f 2>/dev/null | head -1`).toString().trim() || undefined;
          } catch { return undefined; }
        })()
      : undefined;

    this.client = new Client({
      authStrategy: new NoAuth(),
      puppeteer: {
        headless: true,
        executablePath: executablePath || process.env['PUPPETEER_EXECUTABLE_PATH'] || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-sync',
          '--mute-audio'
        ]
      },
    });

    this.client.on('qr', async (qr: string) => {
      console.log('\n[WhatsApp] Scan QR code with your phone:');
      qrcodeTerminal.generate(qr, { small: true });
      try {
        const qrDataUrl = await qrcode.toDataURL(qr);
        this.lastQrCode = qrDataUrl;
        this.io?.emit('connection:status', { connected: false, qrCode: qrDataUrl });
      } catch {
        this.io?.emit('connection:status', { connected: false });
      }
    });

    this.client.on('ready', () => {
      console.log('[WhatsApp] Client ready! ✓');
      this.isConnected = true;
      this.lastQrCode = null;
      this.io?.emit('connection:status', { connected: true });
    });

    // Fallback: authenticated fires before ready, mark connected early
    this.client.on('authenticated', () => {
      console.log('[WhatsApp] Authenticated ✓');
      this.isConnected = true;
      this.lastQrCode = null;
      this.io?.emit('connection:status', { connected: true });
    });

    this.client.on('disconnected', () => {
      console.log('[WhatsApp] Client disconnected');
      this.isConnected = false;
      this.io?.emit('connection:status', { connected: false });
    });

    this.client.on('message_create', async (message) => {
      if (message.fromMe) return;
      console.log(`[WhatsApp] message_create: from=${message.from} hasMedia=${message.hasMedia} type=${message.type}`);
      if (message.hasMedia) {
        try { await this.handleMedia(message); }
        catch (e) { console.error('[WhatsApp] Media error:', e); }
      }
    });

    await this.client.initialize();
  }

  private async handleMedia(message: any): Promise<void> {
    // Debug: log raw sender info
    console.log(`[WhatsApp] message.from=${message.from} author=${message.author} notifyName=${message._data?.notifyName} id=${JSON.stringify(message.id)}`);

    // Skip group messages
    if (message.from.includes('-')) {
      console.warn('[WhatsApp] Skipping group media:', message.from);
      return;
    }

    // Use author for group fallback; strip @lid and use _data.from if available
    const rawFrom: string = message._data?.from ?? message.from;

    // @lid is a linked device ID — resolve real number via contact
    let phone: string;
    if (rawFrom.includes('@lid')) {
      try {
        const contact = await message.getContact();
        phone = contact.number || contact.id.user;
        console.log(`[WhatsApp] Resolved @lid to phone: ${phone}`);
      } catch {
        // Use the numeric part of @lid as fallback
        phone = rawFrom.replace(/[^0-9+]/g, '');
      }
    } else {
      phone = rawFrom
        .replace('@c.us', '')
        .replace('@s.whatsapp.net', '')
        .replace(/[^0-9+]/g, '');
    }

    const media: MessageMedia = await message.downloadMedia();

    if (!media) {
      console.warn('[WhatsApp] downloadMedia() returned null — skipping');
      return;
    }
    const mimetype: string = (media as any).mimetype ?? '';
    const ext = MIME_TO_EXT[mimetype] ?? 'bin';

    const customer = findOrCreateCustomer(phone);

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}_${pad(now.getDate())}-${pad(now.getMonth() + 1)}`;

    const rawName: string = media.filename ?? message._data?.filename ?? '';
    const baseName = rawName
      ? rawName.replace(/\s+/g, '_').replace(/[:\\*?<>|/]/g, '').replace(/\.[^.]+$/, '')
      : 'file';
    const fileName = `${timestamp}_${phone}_${baseName}.${ext}`;

    const buffer = Buffer.from(media.data, 'base64');
    let fileUrl: string;
    let filePath: string;

    if (this.driveAccessToken) {
      console.log('[Drive] Uploading to Google Drive...');
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: this.driveAccessToken });
      const drive = google.drive({ version: 'v3', auth });

      // Helper: find or create a folder by name under a parent
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

      // Structure: customers / {phone} / file
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
      filePath = `customers/${phone}/${fileName}`;
      console.log(`[WhatsApp] Uploaded to Drive: customers/${phone}/${fileName}`);
    } else {
      // Fallback: save locally
      const { writeFileSync } = await import('fs');
      const dir = join(UPLOADS_ROOT, phone);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, fileName), buffer);
      fileUrl = `/uploads/customers/${phone}/${fileName}`;
      filePath = join(dir, fileName);
      console.log(`[WhatsApp] Saved locally: ${fileUrl} (${buffer.length} bytes)`);
    }

    let profilePicUrl: string | null = null;
    try {
      profilePicUrl = await this.client!.getProfilePicUrl(message.from) ?? null;
    } catch { /* unavailable */ }

    const savedFile = await saveWhatsAppFile(
      customer.id,
      customer.name,
      fileName,
      fileUrl,
      filePath,
    );

    this.io?.emit('new_whatsapp_file', {
      ...savedFile,
      profilePicUrl,
    });
    console.log(`[WhatsApp] Emitted new_whatsapp_file: ${fileUrl}`);
  }

  async disconnect(): Promise<void> {
    await this.client?.destroy();
    this.client = null;
    this.isConnected = false;
  }
}

export const whatsappService = new WhatsAppService();
