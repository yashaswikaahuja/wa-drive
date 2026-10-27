/**
 * Resize — re-lay every page onto a target paper size (A4 / 4×6 / Letter),
 * contain-fitting the existing content, with an optional scale.
 */
import { useEffect, useState } from 'react';
import PdfToolShell, { type ToolResult } from './PdfToolShell';
import { PAPERS, resizeToPaper, type PaperId } from './pdfToolkit';
import { toast } from './hub';

const CHOICES: PaperId[] = ['a4', 'a4-landscape', '4x6', '4x6-portrait', 'letter'];

function Body({ source, setResult, setBusy }: {
  source: { fileName: string; fileId?: string; bytes: Uint8Array };
  setResult: (r: ToolResult | null) => void;
  setBusy: (b: string | null) => void;
}) {
  const [paper, setPaper] = useState<PaperId>('a4');
  const [scale, setScale] = useState(100);

  useEffect(() => { setResult(null); }, [source, setResult]);

  const run = async () => {
    try {
      setBusy('Resizing…');
      const bytes = await resizeToPaper(source.bytes, PAPERS[paper], scale);
      setResult({
        bytes,
        name: source.fileName.replace(/\.pdf$/i, '') + '_' + paper,
        meta: { tool: 'pdf-resize', from: source.fileId, op: { paper, scale } },
      });
      toast.success(`Resized to ${PAPERS[paper].label}`);
    } catch (e: any) {
      toast.error(e?.message || 'Resize failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div role="radiogroup" aria-label="Target paper" className="grid grid-cols-2 gap-2">
        {CHOICES.map((id) => {
          const on = paper === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPaper(id)}
              className="rounded-xl border px-3 py-3 text-sm text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--marigold))]"
              style={{
                borderColor: on ? 'hsl(var(--marigold))' : 'hsl(var(--pt-border))',
                background: on ? 'hsl(var(--marigold) / 0.1)' : 'transparent',
                color: 'hsl(var(--pt-ink))',
              }}
              data-pdf-paper={id}
            >
              {PAPERS[id].label}
            </button>
          );
        })}
      </div>

      <label className="block">
        <span className="flex items-center justify-between text-xs" style={{ color: 'hsl(var(--pt-muted))' }}>
          <span>Content scale</span><span>{scale}%</span>
        </span>
        <input
          type="range"
          min={25}
          max={150}
          step={5}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="w-full mt-1 accent-[hsl(var(--marigold))]"
          aria-label="Content scale"
          data-pdf-scale="1"
        />
      </label>

      <button type="button" onClick={run} className="btn-primary text-sm px-4 py-2.5" data-pdf-run="1">
        Resize pages
      </button>
    </div>
  );
}

export default function PdfResize() {
  return (
    <PdfToolShell title="Resize PDF" hindi="आकार बदलें" subtitle="Fit pages to A4, 4×6 or Letter.">
      {(ctx) => (ctx.source ? <Body source={ctx.source} setResult={ctx.setResult} setBusy={ctx.setBusy} /> : null)}
    </PdfToolShell>
  );
}
