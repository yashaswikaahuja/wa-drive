import { v4 as uuidv4 } from 'uuid';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { Customer, WhatsAppFile } from './types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../data');
const FILES_DB_PATH = resolve(DATA_DIR, 'whatsapp-files.json');

function loadFiles(): WhatsAppFile[] {
  if (!existsSync(FILES_DB_PATH)) return [];

  try {
    const parsed = JSON.parse(readFileSync(FILES_DB_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[DB] Failed to read WhatsApp file index:', error);
    return [];
  }
}

function persistFiles(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILES_DB_PATH, JSON.stringify(files, null, 2));
}

// Mock database
const customers: Customer[] = [
  { id: '1', name: 'John Doe', whatsapp: '1234567890' },
  { id: '2', name: 'Jane Smith', whatsapp: '9876543210' },
];

const files: WhatsAppFile[] = loadFiles();

/**
 * Find or create a customer by WhatsApp phone number
 * In production, this should query PostgreSQL
 */
export async function findOrCreateCustomer(waId: string): Promise<Customer> {
  // waId format: "1234567890@c.us"
  const phoneNumber = waId.replace('@c.us', '');
  
  // Try to find existing customer
  const existing = customers.find((c) => c.whatsapp === phoneNumber);
  if (existing) {
    return existing;
  }

  // Create guest customer
  const lastFourDigits = phoneNumber.slice(-4);
  const newCustomer: Customer = {
    id: uuidv4(),
    name: `Guest ${lastFourDigits}`,
    whatsapp: phoneNumber,
  };

  customers.push(newCustomer);
  return newCustomer;
}

/**
 * Save a WhatsApp file record
 * In production, this should insert into PostgreSQL
 */
export async function saveWhatsAppFile(
  customerId: string,
  customerName: string,
  fileName: string,
  fileUrl: string,
  filePath: string,
): Promise<WhatsAppFile> {
  const fileRecord: WhatsAppFile = {
    id: uuidv4(),
    customerId,
    customerName,
    fileName,
    fileUrl,
    filePath,
    type: 'whatsapp_image',
    timestamp: new Date().toISOString(),
  };

  files.push(fileRecord);
  persistFiles();
  return fileRecord;
}

/**
 * Get all WhatsApp files (or filtered by type)
 */
export async function getWhatsAppFiles(type?: string): Promise<WhatsAppFile[]> {
  if (type) {
    return files.filter((f) => f.type === type);
  }
  return files;
}

/**
 * Delete a file record
 */
export async function deleteFile(fileId: string): Promise<boolean> {
  const index = files.findIndex((f) => f.id === fileId);
  if (index > -1) {
    files.splice(index, 1);
    persistFiles();
    return true;
  }
  return false;
}

export { customers, files };
