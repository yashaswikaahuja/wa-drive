/**
 * Background removal — try server remove.bg first, then client fallback.
 * Medicine for “BG button does nothing / fake white ✓”.
 */
import api from '../../shared/api';
import { canvasToBlob, loadImageFromFile } from './imageOps';

export type RemoveBgResult = {
  canvas: HTMLCanvasElement;
  via: 'server' | 'client';
};

async function canvasFromPngBlob(blob: Blob): Promise<HTMLCanvasElement> {
  const img = await loadImageFromFile(blob);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

async function removeBgServer(source: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const blob = await canvasToBlob(source, 'image/png');
  const fd = new FormData();
  fd.append('image_file', blob, 'photo.png');
  const res = await api.post('/process/remove-bg', fd, { responseType: 'blob' });
  return canvasFromPngBlob(new Blob([res.data], { type: 'image/png' }));
}

/** Client-side cutout via @imgly/background-removal (lazy-loaded). */
async function removeBgClient(source: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const { removeBackground } = await import('@imgly/background-removal');
  const blob = await canvasToBlob(source, 'image/jpeg', 0.92);
  const cutout = await removeBackground(blob, {
    progress: () => {},
    output: { format: 'image/png', quality: 0.9 },
  });
  return canvasFromPngBlob(cutout as Blob);
}

/**
 * Prefer server (fast when keyed). On 503 / network failure, fall back to client WASM.
 */
export async function removeBackgroundSmart(
  source: HTMLCanvasElement,
  onStatus?: (msg: string) => void,
): Promise<RemoveBgResult> {
  try {
    onStatus?.('Removing background (server)…');
    const canvas = await removeBgServer(source);
    return { canvas, via: 'server' };
  } catch (e: any) {
    const status = e?.response?.status;
    const allowFallback = !status || status === 503 || status === 502 || status === 402 || status >= 500;
    if (!allowFallback && status !== 401) {
      // e.g. 400 bad image — don't silently WASM
      let msg = e.message || 'Remove BG failed';
      if (e.response?.data instanceof Blob) {
        try {
          const t = await e.response.data.text();
          const j = JSON.parse(t);
          if (j.error) msg = j.error;
        } catch { /* ignore */ }
      }
      throw new Error(msg);
    }
    onStatus?.('Server unavailable — trying on-device cutout (first time may download a model)…');
    try {
      const canvas = await removeBgClient(source);
      return { canvas, via: 'client' };
    } catch (clientErr: any) {
      throw new Error(
        clientErr?.message
          || 'Background removal failed. Set REMOVE_BG_API_KEY on the server, or check network for on-device model.',
      );
    }
  }
}
