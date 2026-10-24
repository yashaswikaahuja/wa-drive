/**
 * Photos the operator added on top of a customer's document in the print editor.
 * Kept in IndexedDB per document so a page refresh does not lose them.
 */
export type SavedExtra = {
  id: string;
  /** 0-based page index. */
  page: number;
  /** Fractions of the page (0–1), so a paper change keeps the place. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Unfiltered photo, so the current filter can be re-applied. */
  blob: Blob;
  /** Whiteout: never filtered. */
  plain?: boolean;
  /** Scan filter chosen for this photo, so a refresh re-applies the same one. */
  filter?: string;
};

const DB = 'cc-doc-print';
const STORE = 'extras';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('No IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadExtras(docKey: string): Promise<SavedExtra[]> {
  if (!docKey) return [];
  try {
    const v = await run<unknown>('readonly', (s) => s.get(docKey));
    return Array.isArray(v) ? (v as SavedExtra[]).filter((e) => e && e.blob instanceof Blob) : [];
  } catch {
    return [];
  }
}

export async function saveExtras(docKey: string, extras: SavedExtra[]): Promise<void> {
  if (!docKey) return;
  try {
    if (extras.length) await run('readwrite', (s) => s.put(extras, docKey));
    else await run('readwrite', (s) => s.delete(docKey));
  } catch {
    /* storage full or blocked: extras just won't survive a refresh */
  }
}


/** Text, drawings and highlights (pdf.js editor data) for one document. */
export async function loadMarks(docKey: string): Promise<unknown[]> {
  if (!docKey) return [];
  try {
    const v = await run<unknown>('readonly', (s) => s.get(`marks:${docKey}`));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function saveMarks(docKey: string, marks: unknown[]): Promise<void> {
  if (!docKey) return;
  try {
    if (marks.length) await run('readwrite', (s) => s.put(marks, `marks:${docKey}`));
    else await run('readwrite', (s) => s.delete(`marks:${docKey}`));
  } catch {
    /* storage blocked: edits just won't survive a refresh */
  }
}

/** Filter chosen for the customer's own page(s), so a refresh re-applies it. */
export async function loadPageFilter(docKey: string): Promise<string | null> {
  if (!docKey) return null;
  try {
    const v = await run<unknown>('readonly', (s) => s.get(`filter:${docKey}`));
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

export async function savePageFilter(docKey: string, filter: string): Promise<void> {
  if (!docKey) return;
  try {
    await run('readwrite', (s) => s.put(filter, `filter:${docKey}`));
  } catch {
    /* storage blocked: filter choice just won't survive a refresh */
  }
}
