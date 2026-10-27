/**
 * Print editor chrome: a top action bar (Back / title / PDF / Print) plus the
 * editing tools. The tools adapt to the device so the operator never fights the
 * UI:
 *   - Tablet/desktop (>=768px): one grouped row that WRAPS (never a hidden
 *     sideways scroll), grouped in the operator's order of work.
 *   - Phone (<768px): a thumb-reachable bottom bar with the most-used tools and
 *     a "More" button that opens a bottom sheet with the full grouped set as a
 *     readable grid — no sideways scrolling, every tool visible with a label.
 * Every control is a real button with a visible label, a 44px touch target,
 * aria-pressed for toggles, and a focus ring. All data-* hooks are preserved.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  CaretLeft,
  Crop,
  Cursor,
  DotsThree,
  DownloadSimple,
  FilePlus,
  FolderOpen,
  Highlighter,
  Eraser,
  Image as ImageIcon,
  PencilSimple,
  Printer,
  SpinnerGap,
  Square,
  TextT,
  X,
} from '@phosphor-icons/react';
import type { PdfEditorMode } from '@cybercontrol/media-viewer';
import type { DocPaperId } from './documentPrintLayout';
import { DOC_SCAN_FILTERS, type DocScanFilter } from './docScanFilters';
import { useIsNarrow } from './hub';

export type PrintTool = PdfEditorMode | 'whiteout';

const PAPER_LABEL: Record<DocPaperId, string> = { a4: 'A4', 'a4-landscape': 'A4 wide', '4x6': '4×6' };
// A4 wide (landscape) is rare for documents; keep the code, hide it from the bar.
const PAPERS: DocPaperId[] = ['a4', '4x6'];

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--marigold))] focus-visible:ring-offset-1 focus-visible:ring-offset-[hsl(var(--pt-card))]';

type ToolProps = {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
  title?: string;
  data: string;
  viewer: string;
  disabled?: boolean;
  /** Stretch to fill a grid cell (used in the phone "More" sheet). */
  block?: boolean;
};

function Tool({ label, icon, active, onClick, title, data, viewer, disabled, block }: ToolProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      aria-pressed={active === undefined ? undefined : active}
      data-doc-print-tool={data}
      data-doc-print-viewer-tool={viewer}
      className={`relative flex flex-col items-center justify-center gap-0.5 ${
        block ? 'w-full' : 'min-w-[52px]'
      } h-12 px-1.5 shrink-0 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${focusRing}`}
      style={{
        color: active ? 'hsl(var(--marigold-deep))' : 'hsl(var(--pt-ink))',
        background: active ? 'hsl(var(--marigold) / 0.16)' : 'transparent',
      }}
    >
      {icon}
      <span className={active ? 'font-semibold' : undefined}>{label}</span>
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0.5 shrink-0">
      <span
        className="hidden lg:block text-[10px] font-semibold uppercase tracking-[0.06em] px-1.5 select-none"
        style={{ color: 'hsl(var(--pt-muted))' }}
        aria-hidden="true"
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/** Group header used inside the phone "More" sheet (always visible there). */
function SheetGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" role="group" aria-label={label}>
      <h3
        className="text-[11px] font-semibold uppercase tracking-[0.06em] select-none"
        style={{ color: 'hsl(var(--pt-muted))' }}
      >
        {label}
      </h3>
      {children}
    </section>
  );
}

function Divider() {
  return <span aria-hidden="true" className="w-px h-8 mx-1.5 shrink-0" style={{ background: 'hsl(var(--pt-border))' }} />;
}

export type PrintToolbarProps = {
  title: string;
  paperId: DocPaperId;
  paperSizeLabel: string;
  busy: boolean;
  canExport: boolean;
  activeTool: PrintTool;
  cropOpen: boolean;
  filter: DocScanFilter;
  filterScope: 'selected' | 'all';
  onFilterScope: (scope: 'selected' | 'all') => void;
  onBack: () => void;
  onDownload: () => void;
  onPrint: () => void;
  onTool: (mode: PdfEditorMode) => void;
  onWhiteout: () => void;
  onImage: () => void;
  onFiles: () => void;
  onCrop: () => void;
  cleanupOpen: boolean;
  onCleanup: () => void;
  colorOpen: boolean;
  onColor: () => void;
  onFilter: (id: DocScanFilter) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAddPage: () => void;
  onPaper: (id: DocPaperId) => void;
  copies: number;
  onCopies: (n: number) => void;
  nUp: 1 | 2 | 4;
  onNUp: (n: 1 | 2 | 4) => void;
};

const ICON = 20;

/** Segmented control shared by Filter scope, Paper and Per-sheet. */
function Segmented({
  ariaLabel,
  options,
  value,
  onChange,
  getData,
  getTitle,
}: {
  ariaLabel: string;
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  getData: (key: string) => Record<string, string>;
  getTitle?: (key: string) => string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex items-center rounded-md p-0.5 shrink-0"
      style={{ background: 'hsl(var(--pt-secondary))', border: '1px solid hsl(var(--pt-border))' }}
    >
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.key)}
            title={getTitle?.(o.key)}
            {...getData(o.key)}
            className={`h-8 min-h-[32px] min-w-[36px] px-2.5 text-[11px] font-semibold rounded-[5px] ${focusRing}`}
            style={
              on
                ? { background: 'hsl(var(--pt-marigold))', color: 'hsl(var(--pt-marigold-ink, 24 30% 16%))' }
                : { background: 'transparent', color: 'hsl(var(--pt-muted))' }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function PrintToolbar(p: PrintToolbarProps) {
  const isNarrow = useIsNarrow();
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetCloseRef = useRef<HTMLButtonElement>(null);

  // Close the "More" sheet when we grow out of phone width.
  useEffect(() => {
    if (!isNarrow) setMoreOpen(false);
  }, [isNarrow]);

  // Focus the close button when the sheet opens; Esc closes it.
  useEffect(() => {
    if (!moreOpen) return;
    sheetCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  // ---- Reusable control blocks (shared by desktop row and phone sheet) ----

  const filterBlock = (stacked?: boolean) => (
    <label
      className={`flex ${stacked ? 'flex-col items-start' : 'flex-col items-start'} justify-center h-12 px-1.5 shrink-0 text-[11px] font-medium gap-0.5`}
      style={{ color: 'hsl(var(--pt-ink))' }}
    >
      <span>Filter</span>
      <div className="flex items-center gap-1">
        <select
          aria-label="Filter"
          data-doc-print-filter={p.filter}
          value={p.filter}
          onChange={(e) => p.onFilter(e.target.value as DocScanFilter)}
          className={`h-9 text-xs rounded-md border pl-1.5 pr-6 font-medium ${focusRing}`}
          style={{ borderColor: 'hsl(var(--pt-border))', color: 'hsl(var(--pt-ink))', background: 'hsl(var(--pt-card))' }}
        >
          {DOC_SCAN_FILTERS.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
        <Segmented
          ariaLabel="Apply filter to"
          value={p.filterScope}
          onChange={(k) => p.onFilterScope(k as 'selected' | 'all')}
          options={[{ key: 'selected', label: 'Selected' }, { key: 'all', label: 'All' }]}
          getData={(k) => ({ 'data-doc-print-filter-scope': k })}
          getTitle={(k) => (k === 'selected' ? 'Apply to the selected photo only' : 'Apply to every page')}
        />
      </div>
    </label>
  );

  const paperBlock = (
    <Segmented
      ariaLabel="Paper size"
      value={p.paperId}
      onChange={(k) => p.onPaper(k as DocPaperId)}
      options={PAPERS.map((id) => ({ key: id, label: PAPER_LABEL[id] }))}
      getData={(k) => ({ 'data-doc-print-paper-pick': k })}
    />
  );

  const addPageBtn = (
    <button
      type="button"
      onClick={p.onAddPage}
      data-doc-print-blank="1"
      title="Add a blank page"
      className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] h-12 px-1.5 shrink-0 rounded-lg text-[11px] font-medium ${focusRing}`}
      style={{ color: 'hsl(var(--pt-ink))' }}
    >
      <FilePlus size={ICON} />
      <span>+ Page</span>
    </button>
  );

  const copiesBlock = (
    <label
      className="flex flex-col items-start justify-center h-12 px-1.5 shrink-0 text-[11px] font-medium gap-0.5"
      style={{ color: 'hsl(var(--pt-ink))' }}
    >
      <span>Copies</span>
      <input
        type="number"
        min={1}
        max={99}
        inputMode="numeric"
        aria-label="Copies"
        data-doc-print-copies="1"
        value={p.copies}
        onChange={(e) => {
          const n = Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 1)));
          p.onCopies(n);
        }}
        className={`h-9 w-16 text-xs rounded-md border px-2 font-medium tabular-nums ${focusRing}`}
        style={{ borderColor: 'hsl(var(--pt-border))', color: 'hsl(var(--pt-ink))', background: 'hsl(var(--pt-card))' }}
      />
    </label>
  );

  const perSheetBlock = (
    <label
      className="flex flex-col items-start justify-center h-12 px-1.5 shrink-0 text-[11px] font-medium gap-0.5"
      style={{ color: 'hsl(var(--pt-ink))' }}
    >
      <span>Per sheet</span>
      <Segmented
        ariaLabel="Documents per sheet"
        value={String(p.nUp)}
        onChange={(k) => p.onNUp(Number(k) as 1 | 2 | 4)}
        options={[1, 2, 4].map((n) => ({ key: String(n), label: String(n) }))}
        getData={(k) => ({ 'data-doc-print-nup': k })}
        getTitle={(k) => (k === '1' ? 'One document per sheet' : `${k} documents on one sheet`)}
      />
    </label>
  );

  // ---- Individual tools (reused across layouts) ----
  const tools = {
    crop: (block?: boolean) => <Tool block={block} label="Crop" data="crop" viewer="crop" icon={<Crop size={ICON} />} active={p.cropOpen} onClick={() => { p.onCrop(); setMoreOpen(false); }} title="Crop and straighten the photo" />,
    clean: (block?: boolean) => <Tool block={block} label="Clean" data="cleanup" viewer="cleanup" icon={<Eraser size={ICON} />} active={p.cleanupOpen} onClick={() => { p.onCleanup(); setMoreOpen(false); }} title="Remove stains, marks and fingers by painting over them" />,
    undo: (block?: boolean) => <Tool block={block} label="Undo" data="undo" viewer="undo" icon={<ArrowCounterClockwise size={ICON} />} disabled={!p.canUndo} onClick={p.onUndo} title="Undo (Ctrl+Z)" />,
    redo: (block?: boolean) => <Tool block={block} label="Redo" data="redo" viewer="redo" icon={<ArrowClockwise size={ICON} />} disabled={!p.canRedo} onClick={p.onRedo} title="Redo (Ctrl+Y)" />,
    select: (block?: boolean) => <Tool block={block} label="Select" data="select" viewer="select" icon={<Cursor size={ICON} />} active={p.activeTool === 'none'} onClick={() => { p.onTool('none'); setMoreOpen(false); }} title="Select, move and resize" />,
    text: (block?: boolean) => <Tool block={block} label="Text" data="text" viewer="text" icon={<TextT size={ICON} />} active={p.activeTool === 'text'} onClick={() => { p.onTool('text'); setMoreOpen(false); }} />,
    draw: (block?: boolean) => <Tool block={block} label="Draw" data="draw" viewer="draw" icon={<PencilSimple size={ICON} />} active={p.activeTool === 'draw'} onClick={() => { p.onTool('draw'); setMoreOpen(false); }} title="Draw on the page" />,
    highlight: (block?: boolean) => <Tool block={block} label="Highlight" data="highlight" viewer="highlight" icon={<Highlighter size={ICON} />} active={p.activeTool === 'highlight'} onClick={() => { p.onTool('highlight'); setMoreOpen(false); }} title="Highlight part of the page" />,
    whiteout: (block?: boolean) => <Tool block={block} label="Whiteout" data="box" viewer="whiteout" icon={<Square size={ICON} />} active={p.activeTool === 'whiteout'} onClick={() => { p.onWhiteout(); setMoreOpen(false); }} title="Cover part of the page with white" />,
    image: (block?: boolean) => <Tool block={block} label="Image" data="image" viewer="image" icon={<ImageIcon size={ICON} />} active={p.activeTool === 'image'} onClick={() => { p.onImage(); setMoreOpen(false); }} title="Add an image from this computer" />,
    files: (block?: boolean) => <Tool block={block} label="Files" data="files" viewer="files" icon={<FolderOpen size={ICON} />} onClick={() => { p.onFiles(); setMoreOpen(false); }} title="Add an image from File Manager" />,
  };

  const topBar = (
    <div className="min-h-14 py-1 px-2 sm:px-3 flex items-center gap-2">
      <button
        type="button"
        onClick={p.onBack}
        aria-label="Back"
        className={`btn-secondary !px-3 !py-2 min-h-[44px] min-w-[44px] text-xs shrink-0 ${focusRing}`}
      >
        <CaretLeft size={14} weight="bold" />
        <span className="hidden sm:inline">Back</span>
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="text-sm font-semibold truncate leading-tight" title={p.title}>{p.title}</h1>
        <p className="text-[11px] truncate" style={{ color: 'hsl(var(--pt-muted))' }}>{p.paperSizeLabel}</p>
      </div>
      <span className="sr-only" data-doc-print-paper={p.paperId}>{p.paperSizeLabel}</span>
      <button
        type="button"
        onClick={p.onDownload}
        disabled={p.busy || !p.canExport}
        data-doc-print-download="1"
        title="Save as PDF"
        className={`btn-secondary !px-3 !py-2 min-h-[44px] min-w-[44px] text-xs shrink-0 ${focusRing}`}
      >
        <DownloadSimple size={15} /> <span className="hidden sm:inline">PDF</span>
      </button>
      <button
        type="button"
        onClick={p.onPrint}
        disabled={p.busy || !p.canExport}
        data-doc-print-submit="1"
        className={`btn-primary !px-4 !py-2 min-h-[44px] text-xs shrink-0 ${focusRing}`}
      >
        {p.busy ? <SpinnerGap size={15} className="animate-spin" /> : <Printer size={15} weight="bold" />}
        <span>Print <span className="hidden sm:inline">{PAPER_LABEL[p.paperId]}</span></span>
      </button>
    </div>
  );

  // ---- Desktop / tablet: grouped row that WRAPS (no hidden sideways scroll) ----
  if (!isNarrow) {
    return (
      <header
        className="shrink-0 border-b"
        style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))', color: 'hsl(var(--pt-ink))' }}
      >
        {topBar}
        <div
          className="flex flex-wrap items-center gap-y-1 px-1.5 sm:px-2 py-1 border-t"
          style={{ borderColor: 'hsl(var(--pt-border))' }}
          data-doc-print-pdf-tools="1"
          role="toolbar"
          aria-label="Edit document"
        >
          <Group label="Photo">
            {tools.crop()}
            {tools.clean()}
            {filterBlock()}
          </Group>
          <Divider />
          <Group label="Edit">
            {tools.undo()}
            {tools.redo()}
            {tools.select()}
          </Group>
          <Divider />
          <Group label="Add">
            {tools.text()}
            {tools.draw()}
            {tools.highlight()}
            {tools.whiteout()}
            {tools.image()}
            {tools.files()}
          </Group>
          <Divider />
          <Group label="Paper">
            {paperBlock}
            {addPageBtn}
            {copiesBlock}
            {perSheetBlock}
          </Group>
        </div>
      </header>
    );
  }

  // ---- Phone: compact bottom bar + "More" bottom sheet ----
  const primary = [tools.select(), tools.crop(), tools.text(), tools.draw(), tools.image()];

  return (
    <>
      <header
        className="shrink-0 border-b"
        style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))', color: 'hsl(var(--pt-ink))' }}
      >
        {topBar}
      </header>

      {/* Bottom tool bar — thumb-reachable, no sideways scrolling. */}
      <nav
        className="fixed bottom-0 inset-x-0 z-30 border-t flex items-stretch justify-between gap-0.5 px-1 pt-1"
        style={{
          background: 'hsl(var(--pt-card))',
          borderColor: 'hsl(var(--pt-border))',
          color: 'hsl(var(--pt-ink))',
          paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))',
        }}
        data-doc-print-pdf-tools="1"
        role="toolbar"
        aria-label="Edit document"
      >
        {primary.map((t, i) => (
          <div key={i} className="flex-1 flex justify-center">{t}</div>
        ))}
        <div className="flex-1 flex justify-center">
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            data-doc-print-more="1"
            title="More tools"
            className={`flex flex-col items-center justify-center gap-0.5 w-full h-12 px-1.5 rounded-lg text-[11px] font-medium ${focusRing}`}
            style={{ color: 'hsl(var(--pt-ink))' }}
          >
            <DotsThree size={ICON} weight="bold" />
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* More sheet: the full grouped set as a readable grid. */}
      {moreOpen && (
        <div className="fixed inset-0 z-40" role="presentation">
          <button
            type="button"
            aria-label="Close tools"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 w-full h-full"
            style={{ background: 'hsl(var(--ink) / 0.45)' }}
            tabIndex={-1}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="All tools"
            data-doc-print-more-sheet="1"
            className="absolute bottom-0 inset-x-0 rounded-t-2xl border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-4 max-h-[80vh] overflow-y-auto"
            style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))', color: 'hsl(var(--pt-ink))' }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">All tools</h2>
              <button
                ref={sheetCloseRef}
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close tools"
                data-doc-print-more-close="1"
                className={`flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg ${focusRing}`}
                style={{ color: 'hsl(var(--pt-ink))' }}
              >
                <X size={20} weight="bold" />
              </button>
            </div>

            <SheetGroup label="Photo">
              <div className="grid grid-cols-4 gap-1">
                {tools.crop(true)}
                {tools.clean(true)}
                {tools.undo(true)}
                {tools.redo(true)}
              </div>
              {filterBlock(true)}
            </SheetGroup>

            <SheetGroup label="Add">
              <div className="grid grid-cols-4 gap-1">
                {tools.text(true)}
                {tools.draw(true)}
                {tools.highlight(true)}
                {tools.whiteout(true)}
                {tools.image(true)}
                {tools.files(true)}
                {tools.select(true)}
              </div>
            </SheetGroup>

            <SheetGroup label="Paper">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-[11px] font-medium" style={{ color: 'hsl(var(--pt-ink))' }}>
                  <span>Size</span>
                  {paperBlock}
                </label>
                {copiesBlock}
                {perSheetBlock}
                {addPageBtn}
              </div>
            </SheetGroup>
          </div>
        </div>
      )}
    </>
  );
}
