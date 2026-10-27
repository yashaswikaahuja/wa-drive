/**
 * Drive I/O for the PDF Tools suite.
 *
 * Load: fetch a source PDF's bytes by Drive fileId (deep-linked from File Manager / WA).
 * Save: upload the result back to the SAME customer folder it came from, tagged
 *       source='pdf-editor' so it is stored as operator output and never appears
 *       in the WhatsApp received-media view (which filters source='whatsapp').
 *       Provenance about the tool + source file is recorded in sourceMetadata.
 */
import api from '../../shared/api';
import { bytesToPdfBlob } from './pdfToolkit';

export type PdfSource = {
  fileId: string;
  fileName: string;
  phone: string;
  personName: string;
  bytes: Uint8Array;
};

/** Resolve the source file's customer (phone/name) so output lands in the same folder. */
export async function fetchSourceMeta(fileId: string): Promise<{ phone: string; personName: string; fileName: string }> {
  try {
    const r = await api.get('/drive/files/ws', { params: { source: 'all' } });
    const row = (r.data || []).find((f: any) => f.id === fileId || f.driveFileId === fileId);
    if (row) {
      return {
        phone: String(row.customerId || ''),
        personName: String(row.customerName || ''),
        fileName: String(row.fileName || 'document.pdf'),
      };
    }
  } catch { /* fall through to blanks; operator can type the phone */ }
  return { phone: '', personName: '', fileName: 'document.pdf' };
}

/** Download a Drive file's raw bytes by id. */
export async function downloadDriveBytes(fileId: string): Promise<Uint8Array> {
  const res = await api.get(`/drive/download/${fileId}`, { responseType: 'arraybuffer' });
  return new Uint8Array(res.data as ArrayBuffer);
}

/** Load a source PDF fully (bytes + customer meta) from a deep-link fileId. */
export async function loadPdfSource(fileId: string): Promise<PdfSource> {
  const [bytes, meta] = await Promise.all([downloadDriveBytes(fileId), fetchSourceMeta(fileId)]);
  return { fileId, bytes, ...meta };
}

export type SaveMeta = {
  /** Tool that produced the file, e.g. 'pdf-split'. */
  tool: string;
  /** Source Drive fileId this was derived from (for provenance). */
  from?: string;
  /** Free-form op description, e.g. { pages: '1-3' }. */
  op?: Record<string, unknown>;
};

/**
 * Save a result PDF to the same customer folder, hidden from WhatsApp.
 * Returns the new Drive fileId.
 */
export async function savePdfToDrive(
  blob: Blob,
  fileName: string,
  phone: string,
  personName: string,
  meta: SaveMeta,
): Promise<string> {
  if (!phone.trim()) throw new Error('Customer phone is required to save to Drive');
  const name = fileName.replace(/\.pdf$/i, '').replace(/[^\w\-]+/g, '_').toLowerCase() + '.pdf';
  const fd = new FormData();
  fd.append('file', blob, name);
  fd.append('phone', phone.trim());
  fd.append('personName', personName || '');
  fd.append('source', 'pdf-editor');
  fd.append('sourceMetadata', JSON.stringify({ ...meta, at: new Date().toISOString() }));
  const res = await api.post('/customers/upload', fd);
  return res.data?.fileId;
}

/** Convenience: save raw pdf-lib/compress bytes. */
export async function saveBytesToDrive(
  bytes: Uint8Array,
  fileName: string,
  phone: string,
  personName: string,
  meta: SaveMeta,
): Promise<string> {
  return savePdfToDrive(bytesToPdfBlob(bytes), fileName, phone, personName, meta);
}
