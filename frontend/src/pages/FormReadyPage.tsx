import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

interface FormFile { id: string; fileName: string; fileUrl: string; customerName: string; }
interface Field { key: string; label: string; value: string; }

function getDriveId(url: string) {
  return url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ?? null;
}

function detectFields(file: FormFile): Field[] {
  const name = file.customerName && !file.customerName.startsWith('Guest') ? file.customerName : '';
  const phone = file.id.match(/\d{10,}/)?.[0] ?? '';
  const dateStr = new Date().toLocaleDateString('en-IN');
  const fn = file.fileName.toLowerCase();

  const base: Field[] = [
    { key: 'name',  label: 'Full Name',    value: name },
    { key: 'date',  label: 'Date',         value: dateStr },
    { key: 'phone', label: 'Phone Number', value: phone },
  ];

  if (fn.includes('aadhaar') || fn.includes('adhar')) {
    base.push({ key: 'aadhaar', label: 'Aadhaar Number', value: '' });
    base.push({ key: 'dob',     label: 'Date of Birth',  value: '' });
    base.push({ key: 'address', label: 'Address',        value: '' });
  } else if (fn.includes('pan')) {
    base.push({ key: 'pan',    label: 'PAN Number',  value: '' });
    base.push({ key: 'father', label: "Father's Name", value: '' });
  } else if (fn.includes('passport')) {
    base.push({ key: 'passport', label: 'Passport No', value: '' });
    base.push({ key: 'expiry',   label: 'Expiry Date', value: '' });
  } else {
    base.push({ key: 'id',      label: 'ID / Reference', value: '' });
    base.push({ key: 'remarks', label: 'Remarks',         value: '' });
  }
  return base;
}

export default function FormReadyPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [files, setFiles] = useState<FormFile[]>([]);
  const [activeFile, setActiveFile] = useState<FormFile | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [isPdf, setIsPdf] = useState(false);

  useEffect(() => {
    const raw = params.get('files');
    if (!raw) return;
    try {
      const parsed: FormFile[] = JSON.parse(decodeURIComponent(raw));
      setFiles(parsed);
      if (parsed.length > 0) selectFile(parsed[0]);
    } catch { /* ignore */ }
  }, [params]);

  function selectFile(f: FormFile) {
    setActiveFile(f);
    setFields(detectFields(f));
    setIsPdf(f.fileName.toLowerCase().endsWith('.pdf'));
  }

  function updateField(key: string, value: string) {
    setFields(prev => prev.map(f => f.key === key ? { ...f, value } : f));
  }

  function handlePrint() {
    if (!activeFile) return;
    const id = getDriveId(activeFile.fileUrl);
    const ext = activeFile.fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf' && id) { window.open(`https://drive.google.com/file/d/${id}/view`, '_blank'); return; }
    const url = id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : activeFile.fileUrl;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><body style="margin:0"><img src="${url}" style="width:100%" onload="window.print()"/></body></html>`);
    win.document.close();
  }

  function handleDownload() {
    if (!activeFile) return;
    const id = getDriveId(activeFile.fileUrl);
    const url = id ? `https://drive.google.com/uc?export=download&id=${id}` : activeFile.fileUrl;
    const a = document.createElement('a'); a.href = url; a.download = activeFile.fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  const previewUrl = activeFile ? (() => {
    const id = getDriveId(activeFile.fileUrl);
    if (!id) return activeFile.fileUrl;
    return isPdf ? `https://drive.google.com/file/d/${id}/preview` : `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;
  })() : null;

  return (
    <div className="min-h-screen bg-[#0c1322] text-[#dce2f7] font-['Inter',sans-serif] flex flex-col">
      {/* Header */}
      <div className="bg-[#1e293b] border-b border-[#334155] px-4 h-10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-[#94a3b8] hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <span className="text-sm font-bold uppercase tracking-wider">Form Ready</span>
          {activeFile && <span className="text-[10px] text-[#94a3b8] truncate max-w-[200px]">{activeFile.fileName}</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} disabled={!activeFile}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded flex items-center gap-1.5 transition-colors">
            <span className="material-symbols-outlined text-[16px]">print</span> Print
          </button>
          <button onClick={handleDownload} disabled={!activeFile}
            className="px-3 py-1.5 border border-[#334155] text-[#94a3b8] hover:text-white disabled:opacity-40 text-xs rounded flex items-center gap-1.5 transition-colors">
            <span className="material-symbols-outlined text-[16px]">download</span> Download
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Fields */}
        <div className="w-64 bg-[#141b2b] border-r border-[#334155] flex flex-col shrink-0">
          {/* File selector */}
          {files.length > 1 && (
            <div className="border-b border-[#334155]">
              {files.map(f => (
                <button key={f.id} onClick={() => selectFile(f)}
                  className={`w-full text-left px-3 py-2 text-[11px] truncate transition-colors ${activeFile?.id === f.id ? 'bg-blue-600/20 text-blue-300 border-l-2 border-blue-500' : 'text-[#94a3b8] hover:bg-[#1e293b]'}`}>
                  {f.fileName}
                </button>
              ))}
            </div>
          )}
          <div className="px-3 py-2 border-b border-[#334155] text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
            Detected Fields
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
            {fields.map(f => (
              <div key={f.key}>
                <label className="text-[10px] text-[#94a3b8] uppercase tracking-wider block mb-1">{f.label}</label>
                <input value={f.value} onChange={e => updateField(f.key, e.target.value)}
                  placeholder={`Enter ${f.label.toLowerCase()}…`}
                  className="w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1.5 text-xs text-[#dce2f7] focus:outline-none focus:border-blue-500 transition-colors placeholder:text-[#475569]" />
              </div>
            ))}
            {fields.length === 0 && (
              <p className="text-[11px] text-[#94a3b8] text-center mt-4">Select a file to detect fields</p>
            )}
          </div>
          {fields.length > 0 && (
            <div className="p-3 border-t border-[#334155]">
              <div className="text-[9px] text-[#475569] text-center">Fields are for reference only.<br/>Edit before printing.</div>
            </div>
          )}
        </div>

        {/* Center: Document preview */}
        <div className="flex-1 flex flex-col items-center justify-center bg-[#0c1322] p-4 overflow-auto">
          {previewUrl ? (
            <div className="flex flex-col items-center gap-3 w-full max-w-2xl">
              <div className="text-[10px] text-[#94a3b8] uppercase tracking-wider">{activeFile?.fileName}</div>
              {isPdf ? (
                <iframe src={previewUrl} className="w-full rounded border border-[#334155] shadow-xl" style={{height:'70vh'}} title="PDF Preview" />
              ) : (
                <div className="bg-white rounded shadow-xl overflow-hidden w-full">
                  <img src={previewUrl} alt="Document" className="w-full h-auto" />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-[#94a3b8]">
              <span className="material-symbols-outlined text-[48px]">description</span>
              <p className="text-sm">No document selected</p>
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
