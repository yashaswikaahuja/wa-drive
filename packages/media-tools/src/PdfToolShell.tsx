/**
 * PdfToolShell — shared device-aware frame for every PDF tool.
 *
 * Owns the parts every tool repeats: a header with a Back link to the PDF hub,
 * loading the source PDF (local file picker or a ?fileId= deep-link from File
 * Manager / WhatsApp), the customer phone/name (so Save lands in the right
 * folder), and a sticky action bar with Download + Save-to-Drive. The tool body
 * is passed as a render-prop that receives the loaded bytes and a setter for its
 * result so the shell can wire the action bar.
 *
 * Mobile-first: on phones the action bar is a fixed bottom bar within thumb
 * reach; on ≥768px it sits inline. Reuses the project's design tokens and the
 * useIsNarrow hook.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, DownloadSimple, FloppyDisk, FilePdf, UploadSimple } from '@phosphor-icons/react';
import { toast } from './hub';
import { downloadBlob } from './imageOps';
import { bytesToPdfBlob } from './pdfToolkit';
import { loadPdfSource, saveBytesToDrive, type SaveMeta } from './pdfDriveIo';

export type ToolResult = {
  /** Result PDF bytes to download / save. */
  bytes: Uint8Array;
  /** Suggested base file name (no extension needed). */
  name: string;
  /** Provenance for Save. */
  meta: SaveMeta;
};

export type PdfToolShellProps = {
  title: string;
  hindi?: string;
  subtitle: string;
  /** Accept images too (merge/organise-from-images). */
  acceptImages?: boolean;
  /** Render the tool body. Receives the loaded source + a way to publish a result. */
  children: (ctx: {
    source: { fileId?: string; fileName: string; bytes: Uint8Array } | null;
    setResult: (r: ToolResult | null) => void;
    busy: boolean;
    setBusy: (b: string | null) => void;
  }) => ReactNode;
};

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--marigold))]';

export default function PdfToolShell(props: PdfToolShellProps) {
  const { title, hindi, subtitle, acceptImages = false, children } = props;
  const [params] = useSearchParams();
  const q = params.toString();
  const hubHref = `../pdf${q ? `?${q}` : ''}`;

  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<{ fileId?: string; fileName: string; bytes: Uint8Array } | null>(null);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [phone, setPhone] = useState(params.get('phone') || '');
  const [personName, setPersonName] = useState(params.get('name') || '');
  const [busy, setBusy] = useState<string | null>(null);

  // Deep-link: load a source PDF straight from Drive.
  useEffect(() => {
    const fileId = params.get('fileId');
    if (!fileId) return;
    let cancelled = false;
    (async () => {
      try {
        setBusy('Loading from Drive…');
        const src = await loadPdfSource(fileId);
        if (cancelled) return;
        setSource({ fileId: src.fileId, fileName: src.fileName, bytes: src.bytes });
        if (src.phone) setPhone((p) => p || src.phone);
        if (src.personName) setPersonName((p) => p || src.personName);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message || 'Could not load from Drive');
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const onPickLocal = useCallback(async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    try {
      setBusy('Opening…');
      const bytes = new Uint8Array(await file.arrayBuffer());
      setSource({ fileName: file.name || 'document.pdf', bytes });
      setResult(null);
    } catch (e: any) {
      toast.error(e?.message || 'Could not open file');
    } finally {
      setBusy(null);
    }
  }, []);

  const doDownload = useCallback(() => {
    if (!result) { toast.error('Nothing to export yet'); return; }
    downloadBlob(bytesToPdfBlob(result.bytes), result.name.replace(/\.pdf$/i, '') + '.pdf');
    toast.success('PDF downloaded');
  }, [result]);

  const doSave = useCallback(async () => {
    if (!result) { toast.error('Nothing to save yet'); return; }
    if (!phone.trim()) { toast.error('Enter the customer phone to save to Drive'); return; }
    try {
      setBusy('Saving to Drive…');
      await saveBytesToDrive(result.bytes, result.name, phone, personName, result.meta);
      toast.success('Saved to Drive (not shown in WhatsApp)');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setBusy(null);
    }
  }, [result, phone, personName]);

  const canExport = !!result && !busy;

  return (
    <div className="flex flex-col h-full min-h-0" data-pdf-tool="1">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 md:px-5 py-2.5 border-b shrink-0"
        style={{ borderColor: 'hsl(var(--pt-border))' }}
      >
        <Link
          to={hubHref}
          aria-label="Back to PDF tools"
          className={`grid place-items-center w-10 h-10 rounded-lg shrink-0 ${focusRing}`}
          style={{ color: 'hsl(var(--pt-ink))' }}
          data-pdf-back="1"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm md:text-base font-semibold truncate" style={{ color: 'hsl(var(--pt-ink))' }}>
            {title}{hindi && <span className="ml-2 text-xs font-normal" style={{ color: 'hsl(var(--pt-muted))' }}>{hindi}</span>}
          </h1>
          <p className="text-[11px] md:text-xs truncate" style={{ color: 'hsl(var(--pt-muted))' }}>{subtitle}</p>
        </div>
      </div>

      {/* Body (scrolls) */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 md:p-5 pb-[calc(96px+env(safe-area-inset-bottom))] md:pb-5">
        {!source ? (
          <div className="max-w-lg mx-auto text-center py-10">
            <FilePdf size={44} className="mx-auto mb-3" style={{ color: 'hsl(var(--pt-muted))' }} />
            <p className="text-sm mb-4" style={{ color: 'hsl(var(--pt-ink))' }}>
              Open a PDF{acceptImages ? ' or image' : ''} to start — from this device, or arrive here from a file in File Manager.
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={`btn-primary inline-flex items-center gap-2 px-4 py-2.5 text-sm ${focusRing}`}
              data-pdf-open-local="1"
            >
              <UploadSimple size={18} /> Choose file
            </button>
            {busy && <p className="mt-4 text-xs animate-pulse" style={{ color: 'hsl(var(--pt-muted))' }}>{busy}</p>}
          </div>
        ) : (
          children({ source, setResult, busy: !!busy, setBusy })
        )}
      </div>

      {/* Action bar */}
      {source && (
        <div
          className="fixed md:static bottom-0 inset-x-0 z-30 border-t md:border-t bg-[hsl(var(--pt-card))] px-3 md:px-5 py-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] md:pb-2.5"
          style={{ borderColor: 'hsl(var(--pt-border))' }}
          data-pdf-actionbar="1"
        >
          <div className="flex items-center gap-2 max-w-4xl mx-auto flex-wrap">
            <input
              className={`input-field text-sm flex-1 min-w-[120px] ${focusRing}`}
              placeholder="Customer phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-label="Customer phone"
              data-pdf-phone="1"
            />
            <input
              className={`input-field text-sm flex-1 min-w-[120px] ${focusRing}`}
              placeholder="Name (optional)"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              aria-label="Customer name"
              data-pdf-name="1"
            />
            <button
              type="button"
              onClick={doDownload}
              disabled={!canExport}
              className={`btn-secondary inline-flex items-center justify-center gap-1.5 text-sm px-4 py-2.5 disabled:opacity-40 ${focusRing}`}
              data-pdf-download="1"
            >
              <DownloadSimple size={18} /> Download
            </button>
            <button
              type="button"
              onClick={doSave}
              disabled={!canExport}
              className={`btn-primary inline-flex items-center justify-center gap-1.5 text-sm px-4 py-2.5 disabled:opacity-40 ${focusRing}`}
              data-pdf-save="1"
            >
              <FloppyDisk size={18} /> Save to Drive
            </button>
          </div>
          {busy && <p className="mt-1.5 text-center text-xs animate-pulse" style={{ color: 'hsl(var(--pt-muted))' }}>{busy}</p>}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={acceptImages ? 'application/pdf,image/*' : 'application/pdf'}
        className="hidden"
        onChange={(e) => onPickLocal(e.target.files)}
        data-pdf-file-input="1"
      />
    </div>
  );
}
