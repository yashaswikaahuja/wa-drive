/**
 * Print editor chrome: title bar + one grouped tool row.
 * Groups follow the operator's order of work: fix the photo, mark it up,
 * pick the paper, print. Every control is a real button with a visible label,
 * a 44px touch target, aria-pressed for toggles, and a focus ring.
 */
import type { ReactNode } from 'react';
import {
  CaretLeft,
  Crop,
  Cursor,
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
} from '@phosphor-icons/react';
import type { PdfEditorMode } from '../files/MozillaPdfEmbed';
import type { DocPaperId } from './documentPrintLayout';
import { DOC_SCAN_FILTERS, type DocScanFilter } from './docScanFilters';

export type PrintTool = PdfEditorMode | 'whiteout';

const PAPER_LABEL: Record<DocPaperId, string> = { a4: 'A4', 'a4-landscape': 'A4 wide', '4x6': '4×6' };
const PAPERS: DocPaperId[] = ['a4', 'a4-landscape', '4x6'];

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
};

function Tool({ label, icon, active, onClick, title, data, viewer }: ToolProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      aria-pressed={active}
      data-doc-print-tool={data}
      data-doc-print-viewer-tool={viewer}
      className={`relative flex flex-col items-center justify-center gap-0.5 min-w-[52px] h-12 px-1.5 shrink-0 rounded-lg text-[11px] font-medium transition-colors ${focusRing}`}
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
  onFilter: (id: DocScanFilter) => void;
  onAddPage: () => void;
  onPaper: (id: DocPaperId) => void;
};

export default function PrintToolbar(p: PrintToolbarProps) {
  const ico = 20;
  return (
    <header
      className="shrink-0 border-b"
      style={{ background: 'hsl(var(--pt-card))', borderColor: 'hsl(var(--pt-border))', color: 'hsl(var(--pt-ink))' }}
    >
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
          <DownloadSimple size={15} /> PDF
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

      <div
        className="flex items-center px-1.5 sm:px-2 py-1 overflow-x-auto border-t"
        style={{ borderColor: 'hsl(var(--pt-border))', scrollbarWidth: 'thin' }}
        data-doc-print-pdf-tools="1"
        role="toolbar"
        aria-label="Edit document"
      >
        <Group label="Photo">
          <Tool label="Crop" data="crop" viewer="crop" icon={<Crop size={ico} />} active={p.cropOpen} onClick={p.onCrop} title="Crop and straighten the photo" />
          <Tool label="Clean" data="cleanup" viewer="cleanup" icon={<Eraser size={ico} />} active={p.cleanupOpen} onClick={p.onCleanup} title="Remove stains, marks and fingers by painting over them" />
          <label
            className="flex flex-col items-start justify-center h-12 px-1.5 shrink-0 text-[11px] font-medium gap-0.5"
            style={{ color: 'hsl(var(--pt-ink))' }}
          >
            <span>Filter</span>
            <select
              aria-label="Filter"
              data-doc-print-filter={p.filter}
              value={p.filter}
              onChange={(e) => p.onFilter(e.target.value as DocScanFilter)}
              className={`h-8 text-xs rounded-md border pl-1.5 pr-6 font-medium ${focusRing}`}
              style={{ borderColor: 'hsl(var(--pt-border))', color: 'hsl(var(--pt-ink))', background: 'hsl(var(--pt-card))' }}
            >
              {DOC_SCAN_FILTERS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
        </Group>
        <Divider />
        <Group label="Edit">
          <Tool label="Select" data="select" viewer="select" icon={<Cursor size={ico} />} active={p.activeTool === 'none'} onClick={() => p.onTool('none')} title="Select, move and resize" />
          <Tool label="Text" data="text" viewer="text" icon={<TextT size={ico} />} active={p.activeTool === 'text'} onClick={() => p.onTool('text')} />
          <Tool label="Draw" data="draw" viewer="draw" icon={<PencilSimple size={ico} />} active={p.activeTool === 'draw'} onClick={() => p.onTool('draw')} />
          <Tool label="Highlight" data="highlight" viewer="highlight" icon={<Highlighter size={ico} />} active={p.activeTool === 'highlight'} onClick={() => p.onTool('highlight')} />
          <Tool label="Whiteout" data="box" viewer="whiteout" icon={<Square size={ico} />} active={p.activeTool === 'whiteout'} onClick={p.onWhiteout} title="Cover part of the page with white" />
          <Tool label="Image" data="image" viewer="image" icon={<ImageIcon size={ico} />} active={p.activeTool === 'image'} onClick={p.onImage} title="Add an image from this computer" />
          <Tool label="Files" data="files" viewer="files" icon={<FolderOpen size={ico} />} onClick={p.onFiles} title="Add an image from File Manager" />
        </Group>
        <Divider />
        <Group label="Paper">
          <div
            className="flex items-center rounded-lg p-0.5 shrink-0"
            style={{ background: 'hsl(var(--pt-secondary))', border: '1px solid hsl(var(--pt-border))' }}
          >
            {PAPERS.map((id) => {
              const on = p.paperId === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => p.onPaper(id)}
                  className={`h-11 min-w-[44px] px-2.5 rounded-md text-xs font-semibold transition-colors ${focusRing}`}
                  style={{
                    background: on ? 'hsl(var(--pt-card))' : 'transparent',
                    color: on ? 'hsl(var(--marigold-deep))' : 'hsl(var(--pt-muted))',
                    boxShadow: on ? '0 1px 2px hsl(var(--ink) / 0.12)' : undefined,
                  }}
                >
                  {PAPER_LABEL[id]}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={p.onAddPage}
            data-doc-print-blank="1"
            title="Add a blank page"
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[52px] h-12 px-1.5 shrink-0 rounded-lg text-[11px] font-medium ${focusRing}`}
            style={{ color: 'hsl(var(--pt-ink))' }}
          >
            <FilePlus size={ico} />
            <span>+ Page</span>
          </button>
        </Group>
      </div>
    </header>
  );
}
