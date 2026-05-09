import type { Customer, WhatsAppFile } from './types/index.js';
declare const customers: Customer[];
declare const files: WhatsAppFile[];
/**
 * Find or create a customer by WhatsApp phone number
 * In production, this should query PostgreSQL
 */
export declare function findOrCreateCustomer(waId: string): Promise<Customer>;
/**
 * Save a WhatsApp file record
 * In production, this should insert into PostgreSQL
 */
export declare function saveWhatsAppFile(customerId: string, customerName: string, fileName: string, fileUrl: string, filePath: string): Promise<WhatsAppFile>;
/**
 * Get all WhatsApp files (or filtered by type)
 */
export declare function getWhatsAppFiles(type?: string): Promise<WhatsAppFile[]>;
/**
 * Delete a file record
 */
export declare function deleteFile(fileId: string): Promise<boolean>;
export { customers, files };
//# sourceMappingURL=db.d.ts.map