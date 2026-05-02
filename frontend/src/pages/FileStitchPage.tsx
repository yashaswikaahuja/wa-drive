import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../utils/helpers';

interface StitchFile { id: string; fileName: string; fileUrl: string; customerName: string; }

function getDriveId(url: string) {
  return url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ?? null;
}

function getFullUrl(url: string) {
  const id = getDriveId(url);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : url;
}

export default function FileStitchPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [files, setFiles] = useState<StitchFile[]>([]);
  const [layoutUrl, setLayoutUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoApplied, setAutoApplied] = useState(false);

  // Parse files from URL
  useEffect(() => {
    const raw = params.get('files');
    if (!raw) return;
    try { setFiles(JSON.parse(decodeURIComponent(raw))); } catch { /* ignore */ }
  }, [params]);

  // Auto-apply Aadhaar layout if 2 images passed
  useEffect(() => {
    if (files.length === 2 && !autoApplied && !layoutUrl) {
      setAutoApplied(true);
      applyLayout(files);
    }
  }, [files]);

  async function applyLayout(filesToProcess: StitchFile[]) {
    if (filesToProcess.length !== 2) { setError('Select exactly 2 files'); return; }
    setLoading(true); setError(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/process`, {
        fileIds: filesToProcess.map(f => getDriveId(f.fileUrl) ?? f.id),
        action: 'aadhaar_layout',
      }, { responseType: 'blob' });
      setLayoutUrl(URL.createObjectURL(res.data));
    } catch (e) {
      setError('Layout generation failed. Make sure Google Drive is connected.');
    } finally { setLoading(false); }
  }

  function handlePrint() {
    if (!layoutUrl) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><body style="margin:0"><img src="${layoutUrl}" style="width:100%" onload="window.print()"/></body></html>`);
    win.document.close();
  }

  const isAadhaar = files.length === 2;

  return (
    <div className="min-h-screen bg-[#0c1322] text-[#dce2f7] font-['Inter',sans-serif] flex flex-col">
      {/* Header */}
      <div className="bg-[#1e293b] border-b border-[#334155] px-4 h-10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-[#94a3b8] hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <span className="text-sm font-bold uppercase tracking-wider">File Stitch Pro</span>
          {isAadhaar && <span className="text-[10px] bg-green-600/20 border border-green-600/30 text-green-400 px-2 py-0.5 rounded uppercase tracking-wide">Aadhaar Layout Detected</span>}
        </div>
        <div className="flex gap-2">
          {layoutUrl && (
            <button onClick={handlePrint}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded transition-colors flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">print</span> PRINT NOW
            </button>
          )}
          {layoutUrl && (
            <a href={layoutUrl} download="aadhaar_layout.jpg"
              className="px-3 py-1.5 border border-[#334155] text-[#94a3b8] hover:text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">download</span> Download
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: selected files */}
        <div className="w-56 bg-[#141b2b] border-r border-[#334155] flex flex-col shrink-0">
          <div className="px-3 py-2 border-b border-[#334155] text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider">
            Selected Files ({files.length})
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
            {files.map((f, i) => (
              <div key={f.id} className="bg-[#1e293b] border border-[#334155] rounded overflow-hidden">
                <div className="h-24 bg-[#2e3545] relative">
                  <img src={getFullUrl(f.fileUrl)} alt={f.fileName}
                    className="w-full h-full object-cover" />
                  <div className="absolute top-1 left-1 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                    {i === 0 ? 'FRONT' : 'BACK'}
                  </div>
                </div>
                <div className="p-1.5">
                  <p className="text-[10px] text-[#dce2f7] truncate">{f.fileName}</p>
                  <p className="text-[9px] text-[#94a3b8]">{f.customerName}</p>
                </div>
              </div>
            ))}
            {files.length === 0 && (
              <p className="text-[11px] text-[#94a3b8] text-center mt-4">No files selected.<br/>Go back to inbox.</p>
            )}
          </div>
          {files.length === 2 && !layoutUrl && (
            <div className="p-2 border-t border-[#334155]">
              <button onClick={() => applyLayout(files)} disabled={loading}
                className="w-full py-2 bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded hover:bg-blue-500 transition-colors">
                {loading ? 'Generating…' : 'Apply Layout'}
              </button>
            </div>
          )}
        </div>

        {/* Center: A4 preview */}
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0c1322] p-6 overflow-auto">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
              <span className="material-symbols-outlined text-[48px] animate-spin">sync</span>
              <p className="text-sm">Generating Aadhaar layout…</p>
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm max-w-sm text-center">
              {error}
            </div>
          )}
          {layoutUrl && !loading && (
            <div className="flex flex-col items-center gap-4">
              <div className="text-[10px] text-[#94a3b8] uppercase tracking-wider">A4 Preview — Horizontal Layout</div>
              {/* A4 landscape preview */}
              <div className="bg-white rounded shadow-2xl overflow-hidden" style={{maxWidth:'min(90vw, 700px)'}}>
                <img src={layoutUrl} alt="Aadhaar Layout" className="w-full h-auto" />
              </div>
              <p className="text-[11px] text-[#94a3b8]">Front (left) · Back (right) · A4 Landscape</p>
            </div>
          )}
          {!loading && !layoutUrl && !error && files.length === 2 && (
            <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
              <span className="material-symbols-outlined text-[48px]">layers</span>
              <p className="text-sm">Auto-applying layout…</p>
            </div>
          )}
          {!loading && !layoutUrl && !error && files.length !== 2 && (
            <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
              <span className="material-symbols-outlined text-[48px]">layers</span>
              <p className="text-sm">Select 2 files from inbox to generate layout</p>
              <button onClick={() => navigate('/')} className="px-4 py-2 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded transition-colors">
                ← Back to Inbox
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
