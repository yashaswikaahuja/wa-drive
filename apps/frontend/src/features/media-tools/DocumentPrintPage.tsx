/**
 * Print editor — one surface, the PDF itself (iLovePDF-style).
 * Photos are placed on the chosen paper, then text, drawing, highlight,
 * whiteout, and images are edited on that PDF. Print keeps the paper size.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Printer,
  CaretLeft,
  SpinnerGap,
  DownloadSimple,
  Cursor,
  TextT,
  Square,
  Image as ImageIcon,
  FolderOpen,
  PencilSimple,
  Highlighter,
} from '@phosphor-icons/react';
import api from '../../shared/api';
import { getCachedBlob, printBlob } from '../../shared/fileCache';
import { toast } from '../../shared/toast';
import { downloadBlob, loadImageFromFile } from './imageOps';
import MozillaPdfEmbed, { type MozillaPdfHandle, type PdfEditorMode } from '../files/MozillaPdfEmbed';
import DrivePicker from '../photo-tool/DrivePicker';
import {
  DOC_PAPERS,
  blankPage,
  cellInMargin,
  type DocMark,
  type DocPage,
  type DocPaperId,
  fitImageOnPage,
  imageToCanvas,
  pagesToPdfBlob,
  ptsToMm,
  readPdfMediaBoxPts,
} from './documentPrintLayout';
import { pdfBytesToPages } from './pdfPaper';

const MARGIN_MM = 10;

async function loadDriveBlob(fileId: string): Promise<Blob> {
  return getCachedBlob(fileId, async () => {
    const res = await api.get(`/drive/download/${fileId}`, { responseType: 'blob' });
    return new Blob([res.data], {
      type: String(res.headers['content-type'] ?? 'application/octet-stream'),
    });
  });
}

function isPdfBlob(blob: Blob, head: Uint8Array): boolean {
  const sig = String.fromCharCode(head[0] || 0, head[1] || 0, head[2] || 0, head[3] || 0, head[4] || 0);
  return blob.type.includes('pdf') || sig === '%PDF-';
}

function whiteoutFile(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 140;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not make whiteout'));
        return;
      }
      resolve(new File([blob], 'whiteout.png', { type: 'image/png' }));
    }, 'image/png');
  });
}

export default function DocumentPrintPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fileId = params.get('fileId') || '';
  const extraIds = (params.get('fileIds') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const phone = params.get('phone') || '';
  const name = params.get('name') || '';
  const fromRaw = params.get('from') || '';
  const from =
    fromRaw.startsWith('/app/') && !fromRaw.startsWith('//') && !fromRaw.includes('://')
      ? fromRaw
      : '';
  const initialPaper = (params.get('paper') as DocPaperId) || 'a4';

  const [paperId, setPaperId] = useState<DocPaperId>(
    initialPaper in DOC_PAPERS ? initialPaper : 'a4',
  );
  const paper = DOC_PAPERS[paperId];
  const [pages, setPages] = useState<DocPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sheetRev, setSheetRev] = useState(0);
  const [originalPdfUrl, setOriginalPdfUrl] = useState('');
  const [layoutPdfUrl, setLayoutPdfUrl] = useState('');
  const [driveOpen, setDriveOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<PdfEditorMode | 'whiteout'>('none');
  /** Paper of the PDF currently open in the viewer. Empty while a new sheet is building. */
  const [openSheet, setOpenSheet] = useState('');
  const originalUrlRef = useRef('');
  const layoutKeyRef = useRef('');
  const pdfRef = useRef<MozillaPdfHandle>(null);
  const touchSheet = () => setSheetRev((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = DOC_PAPERS[paperId];
      if (!fileId) {
        setPages([blankPage(p)]);
        setSheetRev(0);
        layoutKeyRef.current = '';
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const ids = [fileId, ...extraIds.filter((id) => id !== fileId)];
        const built: DocPage[] = [];
        let firstPdfUrl = '';
        for (let i = 0; i < ids.length; i++) {
          try {
            const blob = await loadDriveBlob(ids[i]);
            const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
            if (isPdfBlob(blob, head)) {
              const data = await blob.arrayBuffer();
              const copy = data.slice(0);
              const box = await readPdfMediaBoxPts(new Blob([copy], { type: 'application/pdf' }));
              const fits =
                !!box &&
                Math.abs(ptsToMm(box.w) - p.wMm) <= 2 &&
                Math.abs(ptsToMm(box.h) - p.hMm) <= 2;
              built.push(...(await pdfBytesToPages(data, p)));
              if (!firstPdfUrl && fits) {
                firstPdfUrl = URL.createObjectURL(new Blob([copy], { type: 'application/pdf' }));
              }
            } else {
              const img = await loadImageFromFile(blob);
              built.push(fitImageOnPage(imageToCanvas(img), p, MARGIN_MM, i === 0 ? name || undefined : undefined));
            }
          } catch {
            /* skip missing */
          }
        }
        if (cancelled) {
          if (firstPdfUrl) URL.revokeObjectURL(firstPdfUrl);
          return;
        }
        if (!built.length) throw new Error('Could not load document');
        setPages(built);
        setSheetRev(0);
        layoutKeyRef.current = '';
        if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
        originalUrlRef.current = firstPdfUrl;
        setOriginalPdfUrl(firstPdfUrl);
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e?.message || 'Failed to load document');
          setPages([blankPage(p)]);
          setSheetRev(0);
          layoutKeyRef.current = '';
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  useEffect(() => {
    return () => {
      if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
    };
  }, []);

  const changePaper = (next: DocPaperId) => {
    if (next === paperId) return;
    const prevPaper = DOC_PAPERS[paperId];
    setOpenSheet('');
    touchSheet();
    setPaperId(next);
    const p = DOC_PAPERS[next];
    const sx = p.w / Math.max(1, prevPaper.w);
    const sy = p.h / Math.max(1, prevPaper.h);
    const scaleMark = (m: DocMark): DocMark => {
      const scaled: DocMark = {
        ...m,
        x: Math.max(0, Math.round(m.x * sx)),
        y: Math.max(0, Math.round(m.y * sy)),
        w: Math.max(28, Math.round(m.w * sx)),
        h: Math.max(28, Math.round(m.h * sy)),
      };
      if (m.kind === 'text' && scaled.kind === 'text') {
        scaled.size = Math.max(12, Math.round(m.size * Math.min(sx, sy)));
      }
      return scaled;
    };
    layoutKeyRef.current = '';
    setPages((prev) =>
      prev.map((pg) => {
        const marks = (pg.marks || []).map(scaleMark);
        if (pg.cells.length === 1) {
          const c = pg.cells[0];
          return { ...pg, cells: [{ ...c, ...cellInMargin(c, p, MARGIN_MM) }], marks };
        }
        const minCell = Math.round((10 * 300) / 25.4);
        return {
          ...pg,
          marks,
          cells: pg.cells.map((c) => ({
            ...c,
            x: Math.round(c.x * sx),
            y: Math.round(c.y * sy),
            w: Math.max(minCell, Math.round(c.w * sx)),
            h: Math.max(minCell, Math.round(c.h * sy)),
          })),
        };
      }),
    );
  };

  // The viewer shows the sharp original only when it is already this paper.
  // Any sheet change rebuilds the print PDF. Same sheet keeps the open PDF.
  useEffect(() => {
    if (!pages.length) return;
    if (originalPdfUrl && sheetRev === 0) return;
    const key = `${paper.wMm}x${paper.hMm}@${sheetRev}`;
    if (layoutKeyRef.current === key) return;
    let cancelled = false;
    (async () => {
      try {
        const blob = await pagesToPdfBlob(pages, paper);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        layoutKeyRef.current = key;
        setOpenSheet(`${paper.wMm}x${paper.hMm}`);
        setLayoutPdfUrl((prev) => {
          if (prev && prev !== url) URL.revokeObjectURL(prev);
          return url;
        });
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message || 'Could not open the PDF');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetRev, pages, paper, originalPdfUrl]);

  const viewerUrl = originalPdfUrl && sheetRev === 0 ? originalPdfUrl : layoutPdfUrl;

  useEffect(() => {
    if (originalPdfUrl && sheetRev === 0) setOpenSheet(`${paper.wMm}x${paper.hMm}`);
  }, [originalPdfUrl, sheetRev, paper.wMm, paper.hMm]);

  // A new PDF starts with no tool armed. The highlight must match the page.
  useEffect(() => {
    setActiveTool('none');
  }, [viewerUrl]);

  const assertPaper = async (pdfBlob: Blob) => {
    const box = await readPdfMediaBoxPts(pdfBlob);
    if (box) {
      const wMm = ptsToMm(box.w);
      const hMm = ptsToMm(box.h);
      if (Math.abs(wMm - paper.wMm) > 2 || Math.abs(hMm - paper.hMm) > 2) {
        throw new Error(
          `PDF is ${wMm.toFixed(0)}×${hMm.toFixed(0)} mm but you chose ${paper.wMm.toFixed(0)}×${paper.hMm.toFixed(0)} mm`,
        );
      }
    }
    return pdfBlob;
  };

  const buildPdf = async () => assertPaper(await pagesToPdfBlob(pages, paper));

  const outputPdf = async () => {
    if (pdfRef.current && viewerUrl) {
      try {
        return await assertPaper(await pdfRef.current.exportPdf());
      } catch {
        // Viewer is still opening, or it is a previous paper size. Use the sheet.
      }
    }
    return buildPdf();
  };

  const handlePrint = async () => {
    if (!pages.length) return;
    setBusy(true);
    try {
      const pdfBlob = await outputPdf();
      printBlob(pdfBlob, {
        widthMm: paper.wMm,
        heightMm: paper.hMm,
        fileName: `print_${paperId}.pdf`,
      });
      toast.success(`Print ${paper.label} PDF… check paper size in the dialog`);
    } catch (e: any) {
      toast.error(e?.message || 'Print failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!pages.length) return;
    setBusy(true);
    try {
      const pdfBlob = await outputPdf();
      downloadBlob(pdfBlob, `document_${paperId}_${pages.length}p.pdf`);
      toast.success(`Saved ${paper.label} PDF`);
    } catch (e: any) {
      toast.error(e?.message || 'PDF failed');
    } finally {
      setBusy(false);
    }
  };

  const setViewerTool = (mode: PdfEditorMode) => {
    setActiveTool(mode);
    pdfRef.current?.setEditorMode(mode);
  };

  const placeWhiteout = async () => {
    setActiveTool('whiteout');
    try {
      const file = await whiteoutFile();
      pdfRef.current?.stampFile(file);
    } catch {
      toast.error('Could not add whiteout');
    }
  };

  const onDrivePick = async (file: File) => {
    const looksImage = !file.type || file.type.startsWith('image/');
    if (!looksImage) {
      toast.error('Choose a photo (JPG or PNG)');
      return;
    }
    setActiveTool('image');
    pdfRef.current?.stampFile(file);
    toast.success('Image placed on the page');
  };

  const addBlankPage = async () => {
    setBusy(true);
    try {
      let base = pages;
      if (pdfRef.current && viewerUrl) {
        try {
          const blob = await pdfRef.current.exportPdf();
          const raster = await pdfBytesToPages(await blob.arrayBuffer(), paper);
          if (raster.length) base = raster;
        } catch {
          /* keep the current sheets */
        }
      }
      layoutKeyRef.current = '';
      setPages([...base, blankPage(paper)]);
      touchSheet();
      toast.success('Blank page added');
    } catch (e: any) {
      toast.error(e?.message || 'Could not add a page');
    } finally {
      setBusy(false);
    }
  };

  const backTo = from || '/app/whatsapp';
  const subtitle = useMemo(() => {
    const who = name || phone;
    return who ? `For ${who}` : 'WhatsApp / Drive document → paper';
  }, [name, phone]);
  const paperSizeLabel = `${paper.label} · ${paper.wMm.toFixed(0)}×${paper.hMm.toFixed(0)} mm`;

  const chip = (on: boolean) =>
    ({
      borderColor: on ? 'hsl(27 95% 55%)' : 'var(--border)',
      background: on ? 'hsl(27 95% 55% / 0.14)' : 'transparent',
      color: on ? 'hsl(18 80% 32%)' : 'inherit',
    }) as const;

  const toolBtn = (on: boolean) =>
    ({
      color: on ? 'hsl(18 80% 32%)' : 'inherit',
      background: on ? 'hsl(27 95% 55% / 0.16)' : 'transparent',
      borderRadius: 8,
    }) as const;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-sm text-[var(--muted-foreground)]">
        <SpinnerGap size={22} className="animate-spin" /> Loading document…
      </div>
    );
  }

  if (!pages.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">No document loaded for print.</p>
        <button type="button" className="btn-secondary text-sm" onClick={() => navigate(backTo)}>
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0" data-doc-print="1">
      <header className="shrink-0 border-b" style={{ background: '#fff', borderColor: 'hsl(var(--pt-border))' }}>
        <div className="h-12 px-2 flex items-center gap-1">
          <button type="button" className="btn-secondary text-xs py-1.5 px-2 shrink-0" onClick={() => navigate(backTo)}>
            <CaretLeft size={14} className="inline" /> Back
          </button>
          <span className="text-sm font-semibold truncate min-w-0 flex-1 px-1" title={subtitle}>{subtitle}</span>
          <span className="sr-only" data-doc-print-paper={paperId}>{paperSizeLabel}</span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className="btn-secondary text-xs py-1.5 px-2 shrink-0"
              onClick={handleDownloadPdf}
              disabled={busy || !pages.length}
              data-doc-print-download="1"
            >
              <DownloadSimple size={14} /> PDF
            </button>
            <button
              type="button"
              className="btn-primary text-xs py-1.5 px-3 shrink-0 flex items-center gap-1"
              onClick={handlePrint}
              disabled={busy || !pages.length}
              data-doc-print-submit="1"
            >
              {busy ? <SpinnerGap size={14} className="animate-spin" /> : <Printer size={14} />}
              Print
            </button>
          </div>
        </div>
        <div
          className="flex items-center gap-0.5 px-2 overflow-x-auto border-t"
          style={{ borderColor: 'hsl(var(--pt-border))' }}
          data-doc-print-pdf-tools="1"
        >
          <button type="button" className="flex flex-col items-center justify-center w-12 sm:w-14 h-12 shrink-0 text-[10px] font-medium" style={toolBtn(activeTool === 'none')} onClick={() => setViewerTool('none')} data-doc-print-tool="select" data-doc-print-viewer-tool="select">
            <Cursor size={18} /> Select
          </button>
          <button type="button" className="flex flex-col items-center justify-center w-12 sm:w-14 h-12 shrink-0 text-[10px] font-medium" style={toolBtn(activeTool === 'text')} onClick={() => setViewerTool('text')} data-doc-print-tool="text" data-doc-print-viewer-tool="text">
            <TextT size={18} /> Text
          </button>
          <button type="button" className="flex flex-col items-center justify-center w-12 sm:w-14 h-12 shrink-0 text-[10px] font-medium" style={toolBtn(activeTool === 'draw')} onClick={() => setViewerTool('draw')} data-doc-print-tool="draw" data-doc-print-viewer-tool="draw">
            <PencilSimple size={18} /> Draw
          </button>
          <button type="button" className="flex flex-col items-center justify-center w-14 sm:w-16 h-12 shrink-0 text-[10px] font-medium" style={toolBtn(activeTool === 'highlight')} onClick={() => setViewerTool('highlight')} data-doc-print-tool="highlight" data-doc-print-viewer-tool="highlight">
            <Highlighter size={18} /> Highlight
          </button>
          <button type="button" className="flex flex-col items-center justify-center w-14 sm:w-16 h-12 shrink-0 text-[10px] font-medium" style={toolBtn(activeTool === 'whiteout')} onClick={() => void placeWhiteout()} data-doc-print-tool="box" data-doc-print-viewer-tool="whiteout">
            <Square size={18} /> Whiteout
          </button>
          <button type="button" className="flex flex-col items-center justify-center w-12 sm:w-14 h-12 shrink-0 text-[10px] font-medium" style={toolBtn(activeTool === 'image')} onClick={() => setViewerTool('image')} data-doc-print-tool="image" data-doc-print-viewer-tool="image" title="Add an image from this computer">
            <ImageIcon size={18} /> Image
          </button>
          <button type="button" className="flex flex-col items-center justify-center w-12 sm:w-14 h-12 shrink-0 text-[10px] font-medium" onClick={() => setDriveOpen(true)} data-doc-print-tool="files" data-doc-print-viewer-tool="files" title="Choose an image from File Manager">
            <FolderOpen size={18} /> Files
          </button>
          <span className="w-px h-6 mx-1 shrink-0" style={{ background: 'hsl(var(--pt-border))' }} />
          <button type="button" className="text-[11px] rounded-md px-2 py-1 border font-medium shrink-0" onClick={() => void addBlankPage()} data-doc-print-blank="1">
            + Page
          </button>
          {(Object.keys(DOC_PAPERS) as DocPaperId[]).map((id) => (
            <button
              key={id}
              type="button"
              className="text-[11px] rounded-md px-2 py-1 border font-medium shrink-0"
              style={chip(paperId === id)}
              onClick={() => changePaper(id)}
            >
              {id === 'a4' ? 'A4' : id === 'a4-landscape' ? 'A4 wide' : '4×6'}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 min-h-0" data-doc-print-pdf="1" data-doc-print-sheet={openSheet}>
        {viewerUrl ? (
          <MozillaPdfEmbed
            key={viewerUrl}
            ref={pdfRef}
            fileUrl={viewerUrl}
            mode="editor"
            onPickDriveImage={() => setDriveOpen(true)}
          />
        ) : (
          <div className="h-full flex items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
            <SpinnerGap size={22} className="animate-spin" /> Opening PDF…
          </div>
        )}
      </div>

      <DrivePicker
        open={driveOpen}
        imagesOnly
        onClose={() => setDriveOpen(false)}
        onPick={(file) => {
          setDriveOpen(false);
          void onDrivePick(file);
        }}
      />
    </div>
  );
}
