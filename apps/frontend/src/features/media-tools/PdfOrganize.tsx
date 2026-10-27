/**
 * Organize — thumbnail grid to reorder, rotate and delete pages, then re-emit
 * a new PDF. Structural ops are lossless (pdf-lib); thumbnails come from pdf.js.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowClockwise, Trash } from '@phosphor-icons/react';
import PdfToolShell, { type ToolResult } from './PdfToolShell';
import { extractPages, renderThumbnails, reorderIndices, rotatePages, type Thumb } from './pdfToolkit';
import { toast } from '../../shared/toast';

type Item = { srcIndex: number; rotate: number; thumb: Thumb };

function Body({ source, setResult, setBusy }: {
  source: { fileName: string; fileId?: string; bytes: Uint8Array };
  setResult: (r: ToolResult | null) => void;
  setBusy: (b: string | null) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ok = true;
    setLoading(true);
    setResult(null);
    renderThumbnails(source.bytes)
      .then((thumbs) => { if (ok) setItems(thumbs.map((t) => ({ srcIndex: t.index, rotate: 0, thumb: t }))); })
      .catch((e) => ok && toast.error(e?.message || 'Could not read PDF'))
      .finally(() => ok && setLoading(false));
    return () => { ok = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const dirty = useMemo(
    () => items.some((it, i) => it.srcIndex !== i || it.rotate !== 0) || items.length === 0,
    [items],
  );

  const move = (i: number, dir: -1 | 1) => setItems((a) => reorderIndices(a, i, i + dir));
  const rotate = (i: number) => setItems((a) => a.map((it, j) => (j === i ? { ...it, rotate: (it.rotate + 90) % 360 } : it)));
  const remove = (i: number) => setItems((a) => a.filter((_, j) => j !== i));

  const apply = async () => {
    if (!items.length) { toast.error('Keep at least one page'); return; }
    try {
      setBusy('Saving changes…');
      // 1) reorder/keep via the chosen source indices
      let bytes = await extractPages(source.bytes, items.map((it) => it.srcIndex));
      // 2) apply rotations against the NEW page positions, grouped by angle
      const byAngle = new Map<number, number[]>();
      items.forEach((it, pos) => { if (it.rotate) { const g = byAngle.get(it.rotate) || []; g.push(pos); byAngle.set(it.rotate, g); } });
      for (const [angle, positions] of byAngle) bytes = await rotatePages(bytes, positions, angle);
      setResult({
        bytes,
        name: source.fileName.replace(/\.pdf$/i, '') + '_organized',
        meta: { tool: 'pdf-organize', from: source.fileId, op: { order: items.map((it) => it.srcIndex + 1), kept: items.length } },
      });
      toast.success('Ready — Download or Save');
    } catch (e: any) {
      toast.error(e?.message || 'Could not apply changes');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="text-center text-sm py-10 animate-pulse" style={{ color: 'hsl(var(--pt-muted))' }}>Reading pages…</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'hsl(var(--pt-ink))' }}>{items.length} page(s)</p>
        <button type="button" onClick={apply} disabled={!dirty} className="btn-primary text-sm px-4 py-2 disabled:opacity-40" data-pdf-apply="1">
          Apply changes
        </button>
      </div>

      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" data-pdf-grid="1">
        {items.map((it, i) => (
          <li key={it.thumb.index} className="rounded-xl border p-2" style={{ borderColor: 'hsl(var(--pt-border))' }} data-pdf-page={i}>
            <div className="aspect-[3/4] grid place-items-center overflow-hidden rounded-lg bg-white">
              <img
                src={it.thumb.dataUrl}
                alt={`Page ${i + 1}`}
                className="max-h-full max-w-full object-contain transition-transform"
                style={{ transform: `rotate(${it.rotate}deg)` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs" style={{ color: 'hsl(var(--pt-muted))' }}>#{i + 1}</span>
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move left" className="p-1.5 rounded-md disabled:opacity-30 hover:bg-[hsl(var(--pt-secondary))]" data-pdf-move-up><ArrowLeft size={16} /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move right" className="p-1.5 rounded-md disabled:opacity-30 hover:bg-[hsl(var(--pt-secondary))]" data-pdf-move-down><ArrowRight size={16} /></button>
                <button type="button" onClick={() => rotate(i)} aria-label="Rotate" className="p-1.5 rounded-md hover:bg-[hsl(var(--pt-secondary))]" data-pdf-rotate><ArrowClockwise size={16} /></button>
                <button type="button" onClick={() => remove(i)} aria-label="Delete page" className="p-1.5 rounded-md text-red-500 hover:bg-red-500/10" data-pdf-delete><Trash size={16} /></button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PdfOrganize() {
  return (
    <PdfToolShell title="Organize PDF" hindi="पेज क्रम" subtitle="Reorder, rotate and delete pages.">
      {(ctx) => (ctx.source ? <Body source={ctx.source} setResult={ctx.setResult} setBusy={ctx.setBusy} /> : null)}
    </PdfToolShell>
  );
}
