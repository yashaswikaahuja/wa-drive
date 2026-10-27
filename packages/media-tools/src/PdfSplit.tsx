/**
 * Split — extract page ranges from a PDF into a new PDF.
 * "1-3, 5" keeps those pages (in order) as one document.
 */
import { useEffect, useMemo, useState } from 'react';
import PdfToolShell, { type ToolResult } from './PdfToolShell';
import { extractPages, pageCountOf, parsePageRanges } from './pdfToolkit';
import { toast } from '../../shared/toast';

function Body({ source, setResult, setBusy }: {
  source: { fileName: string; fileId?: string; bytes: Uint8Array };
  setResult: (r: ToolResult | null) => void;
  setBusy: (b: string | null) => void;
}) {
  const [count, setCount] = useState(0);
  const [ranges, setRanges] = useState('');

  useEffect(() => {
    let ok = true;
    pageCountOf(source.bytes).then((n) => ok && setCount(n)).catch(() => ok && setCount(0));
    setResult(null);
    return () => { ok = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const parsed = useMemo(() => {
    if (!count) return { indices: [] as number[], error: '' };
    try { return { indices: parsePageRanges(ranges, count), error: '' }; }
    catch (e: any) { return { indices: [], error: e?.message || 'Invalid range' }; }
  }, [ranges, count]);

  const run = async () => {
    if (parsed.error || !parsed.indices.length) { toast.error(parsed.error || 'Enter pages to keep'); return; }
    try {
      setBusy('Splitting…');
      const bytes = await extractPages(source.bytes, parsed.indices);
      setResult({
        bytes,
        name: source.fileName.replace(/\.pdf$/i, '') + '_pages',
        meta: { tool: 'pdf-split', from: source.fileId, op: { pages: ranges.trim() || 'all' } },
      });
      toast.success(`Extracted ${parsed.indices.length} page(s)`);
    } catch (e: any) {
      toast.error(e?.message || 'Split failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <p className="text-sm" style={{ color: 'hsl(var(--pt-ink))' }}>
        This PDF has <strong>{count || '…'}</strong> page{count === 1 ? '' : 's'}.
      </p>
      <label className="block">
        <span className="text-xs font-medium" style={{ color: 'hsl(var(--pt-muted))' }}>Pages to keep</span>
        <input
          className="input-field text-sm w-full mt-1"
          placeholder="e.g. 1-3, 5, 8-10  (blank = all)"
          value={ranges}
          onChange={(e) => setRanges(e.target.value)}
          data-pdf-ranges="1"
          aria-label="Pages to keep"
        />
      </label>
      {parsed.error && <p className="text-xs" style={{ color: 'hsl(var(--marigold-deep))' }}>{parsed.error}</p>}
      {!parsed.error && !!count && (
        <p className="text-xs" style={{ color: 'hsl(var(--pt-muted))' }}>
          {parsed.indices.length} page(s) selected: {parsed.indices.map((i) => i + 1).join(', ') || '—'}
        </p>
      )}
      <button
        type="button"
        onClick={run}
        disabled={!count || !!parsed.error}
        className="btn-primary text-sm px-4 py-2.5 disabled:opacity-40"
        data-pdf-run="1"
      >
        Extract pages
      </button>
    </div>
  );
}

export default function PdfSplit() {
  return (
    <PdfToolShell title="Split PDF" hindi="अलग करें" subtitle="Pull out the pages you need into a new PDF.">
      {(ctx) => (ctx.source ? <Body source={ctx.source} setResult={ctx.setResult} setBusy={ctx.setBusy} /> : null)}
    </PdfToolShell>
  );
}
