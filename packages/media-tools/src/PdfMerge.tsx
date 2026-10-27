/**
 * Merge / Add — combine several PDFs and images into one document.
 * The first file comes from the shell (local pick or Drive deep-link); more can
 * be added here. Items reorder with the arrows, then Combine emits one PDF.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, Trash, Plus, FilePdf, Image as ImageIcon } from '@phosphor-icons/react';
import PdfToolShell, { type ToolResult } from './PdfToolShell';
import {
  PAPERS, imagesToPdf, mergePdfs, reorderIndices,
} from './pdfToolkit';
import { toast } from './hub';

type Part = { id: string; name: string; kind: 'pdf' | 'image'; bytes: Uint8Array; type: string };

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function Body({ source, setResult, setBusy }: {
  source: { fileName: string; fileId?: string; bytes: Uint8Array };
  setResult: (r: ToolResult | null) => void;
  setBusy: (b: string | null) => void;
}) {
  const addRef = useRef<HTMLInputElement>(null);
  const [parts, setParts] = useState<Part[]>([]);

  // Seed with the source file (may be a PDF or an image when opened via the shell).
  useEffect(() => {
    const isPdf = /\.pdf$/i.test(source.fileName);
    setParts([{ id: uid(), name: source.fileName, kind: isPdf ? 'pdf' : 'image', bytes: source.bytes, type: isPdf ? 'application/pdf' : 'image/jpeg' }]);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    try {
      setBusy('Adding…');
      const next: Part[] = [];
      for (const f of Array.from(list)) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const isPdf = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
        next.push({ id: uid(), name: f.name, kind: isPdf ? 'pdf' : 'image', bytes, type: f.type || (isPdf ? 'application/pdf' : 'image/jpeg') });
      }
      setParts((p) => [...p, ...next]);
      setResult(null);
      toast.success(`Added ${next.length} item(s)`);
    } catch (e: any) {
      toast.error(e?.message || 'Could not add files');
    } finally {
      setBusy(null);
    }
  };

  const move = (i: number, dir: -1 | 1) => setParts((a) => reorderIndices(a, i, i + dir));
  const remove = (i: number) => setParts((a) => a.filter((_, j) => j !== i));

  const combine = async () => {
    if (parts.length < 1) { toast.error('Add at least one file'); return; }
    try {
      setBusy('Combining…');
      // Convert image runs to single-page PDFs, then merge everything in order.
      const pdfByteList: Uint8Array[] = [];
      for (const part of parts) {
        if (part.kind === 'pdf') pdfByteList.push(part.bytes);
        else pdfByteList.push(await imagesToPdf([{ bytes: part.bytes, type: part.type }], PAPERS.a4));
      }
      const bytes = await mergePdfs(pdfByteList);
      setResult({
        bytes,
        name: (source.fileName.replace(/\.pdf$/i, '') || 'merged') + '_merged',
        meta: { tool: 'pdf-merge', from: source.fileId, op: { parts: parts.length } },
      });
      toast.success(`Combined ${parts.length} item(s)`);
    } catch (e: any) {
      toast.error(e?.message || 'Merge failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'hsl(var(--pt-ink))' }}>{parts.length} item(s)</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => addRef.current?.click()} className="btn-secondary text-sm inline-flex items-center gap-1.5 px-3 py-2" data-pdf-add="1">
            <Plus size={16} /> Add files
          </button>
          <button type="button" onClick={combine} disabled={parts.length < 1} className="btn-primary text-sm px-4 py-2 disabled:opacity-40" data-pdf-combine="1">
            Combine
          </button>
        </div>
      </div>

      <ul className="space-y-2" data-pdf-list="1">
        {parts.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: 'hsl(var(--pt-border))' }} data-pdf-item={i}>
            <span className="grid place-items-center w-9 h-9 rounded-lg shrink-0 text-white" style={{ background: p.kind === 'pdf' ? 'hsl(var(--confidence))' : 'hsl(var(--marigold))' }}>
              {p.kind === 'pdf' ? <FilePdf size={18} weight="fill" /> : <ImageIcon size={18} weight="fill" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm truncate" style={{ color: 'hsl(var(--pt-ink))' }}>{p.name}</span>
              <span className="block text-[11px]" style={{ color: 'hsl(var(--pt-muted))' }}>{p.kind === 'pdf' ? 'PDF' : 'Image → page'}</span>
            </span>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1.5 rounded-md disabled:opacity-30 hover:bg-[hsl(var(--pt-secondary))]"><ArrowUp size={16} /></button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === parts.length - 1} aria-label="Move down" className="p-1.5 rounded-md disabled:opacity-30 hover:bg-[hsl(var(--pt-secondary))]"><ArrowDown size={16} /></button>
            <button type="button" onClick={() => remove(i)} aria-label="Remove" className="p-1.5 rounded-md text-red-500 hover:bg-red-500/10"><Trash size={16} /></button>
          </li>
        ))}
      </ul>

      <input ref={addRef} type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} data-pdf-add-input="1" />
    </div>
  );
}

export default function PdfMerge() {
  return (
    <PdfToolShell title="Merge / Add" hindi="जोड़ें" subtitle="Combine PDFs and images into one document." acceptImages>
      {(ctx) => (ctx.source ? <Body source={ctx.source} setResult={ctx.setResult} setBusy={ctx.setBusy} /> : null)}
    </PdfToolShell>
  );
}
