/**
 * Compress — shrink an image-heavy PDF by re-rendering pages at a chosen
 * density / JPEG quality. Shows before/after size so the operator can judge.
 */
import { useEffect, useState } from 'react';
import PdfToolShell, { type ToolResult } from './PdfToolShell';
import { compressPdf, formatBytes } from './pdfToolkit';
import { toast } from '../../shared/toast';

type Level = 'high' | 'balanced' | 'small';
const LEVELS: Record<Level, { label: string; hint: string; dpi: number; quality: number }> = {
  high: { label: 'High quality', hint: 'Print-sharp · 200 DPI', dpi: 200, quality: 0.82 },
  balanced: { label: 'Balanced', hint: 'Email-friendly · 150 DPI', dpi: 150, quality: 0.7 },
  small: { label: 'Smallest', hint: 'Screen only · 110 DPI', dpi: 110, quality: 0.55 },
};

function Body({ source, setResult, setBusy }: {
  source: { fileName: string; fileId?: string; bytes: Uint8Array };
  setResult: (r: ToolResult | null) => void;
  setBusy: (b: string | null) => void;
}) {
  const [level, setLevel] = useState<Level>('balanced');
  const [after, setAfter] = useState<number | null>(null);
  const before = source.bytes.byteLength;

  useEffect(() => { setResult(null); setAfter(null); }, [source, setResult]);

  const run = async () => {
    const cfg = LEVELS[level];
    try {
      setBusy('Compressing…');
      const bytes = await compressPdf(source.bytes, { dpi: cfg.dpi, quality: cfg.quality });
      setAfter(bytes.byteLength);
      setResult({
        bytes,
        name: source.fileName.replace(/\.pdf$/i, '') + '_compressed',
        meta: { tool: 'pdf-compress', from: source.fileId, op: { level, dpi: cfg.dpi, quality: cfg.quality } },
      });
      const saved = before - bytes.byteLength;
      toast.success(saved > 0 ? `Saved ${formatBytes(saved)}` : 'Done (already small)');
    } catch (e: any) {
      toast.error(e?.message || 'Compress failed');
    } finally {
      setBusy(null);
    }
  };

  const pct = after != null && before > 0 ? Math.max(0, Math.round((1 - after / before) * 100)) : null;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span style={{ color: 'hsl(var(--pt-muted))' }}>Current size</span>
        <strong style={{ color: 'hsl(var(--pt-ink))' }}>{formatBytes(before)}</strong>
      </div>

      <div role="radiogroup" aria-label="Compression level" className="grid gap-2">
        {(Object.keys(LEVELS) as Level[]).map((k) => {
          const on = level === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setLevel(k)}
              className="flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--marigold))]"
              style={{
                borderColor: on ? 'hsl(var(--marigold))' : 'hsl(var(--pt-border))',
                background: on ? 'hsl(var(--marigold) / 0.1)' : 'transparent',
              }}
              data-pdf-level={k}
            >
              <span>
                <span className="block text-sm font-medium" style={{ color: 'hsl(var(--pt-ink))' }}>{LEVELS[k].label}</span>
                <span className="block text-xs" style={{ color: 'hsl(var(--pt-muted))' }}>{LEVELS[k].hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <button type="button" onClick={run} className="btn-primary text-sm px-4 py-2.5" data-pdf-run="1">
        Compress
      </button>

      {after != null && (
        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: 'hsl(var(--pt-border))' }} data-pdf-after="1">
          <div className="flex items-center justify-between">
            <span style={{ color: 'hsl(var(--pt-muted))' }}>New size</span>
            <strong style={{ color: 'hsl(var(--confidence))' }}>{formatBytes(after)}{pct != null ? ` · −${pct}%` : ''}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PdfCompress() {
  return (
    <PdfToolShell title="Compress PDF" hindi="छोटा करें" subtitle="Reduce file size for email or upload.">
      {(ctx) => (ctx.source ? <Body source={ctx.source} setResult={ctx.setResult} setBusy={ctx.setBusy} /> : null)}
    </PdfToolShell>
  );
}
