import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
function getDriveId(url) {
    return url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ?? null;
}
function detectFields(file) {
    const name = file.customerName && !file.customerName.startsWith('Guest') ? file.customerName : '';
    const phone = file.id.match(/\d{10,}/)?.[0] ?? '';
    const dateStr = new Date().toLocaleDateString('en-IN');
    const fn = file.fileName.toLowerCase();
    const base = [
        { key: 'name', label: 'Full Name', value: name },
        { key: 'date', label: 'Date', value: dateStr },
        { key: 'phone', label: 'Phone Number', value: phone },
    ];
    if (fn.includes('aadhaar') || fn.includes('adhar')) {
        base.push({ key: 'aadhaar', label: 'Aadhaar Number', value: '' });
        base.push({ key: 'dob', label: 'Date of Birth', value: '' });
        base.push({ key: 'address', label: 'Address', value: '' });
    }
    else if (fn.includes('pan')) {
        base.push({ key: 'pan', label: 'PAN Number', value: '' });
        base.push({ key: 'father', label: "Father's Name", value: '' });
    }
    else if (fn.includes('passport')) {
        base.push({ key: 'passport', label: 'Passport No', value: '' });
        base.push({ key: 'expiry', label: 'Expiry Date', value: '' });
    }
    else {
        base.push({ key: 'id', label: 'ID / Reference', value: '' });
        base.push({ key: 'remarks', label: 'Remarks', value: '' });
    }
    return base;
}
export default function FormReadyPage() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const [files, setFiles] = useState([]);
    const [activeFile, setActiveFile] = useState(null);
    const [fields, setFields] = useState([]);
    const [isPdf, setIsPdf] = useState(false);
    useEffect(() => {
        const raw = params.get('files');
        if (!raw)
            return;
        try {
            const parsed = JSON.parse(decodeURIComponent(raw));
            setFiles(parsed);
            if (parsed.length > 0)
                selectFile(parsed[0]);
        }
        catch { /* ignore */ }
    }, [params]);
    function selectFile(f) {
        setActiveFile(f);
        setFields(detectFields(f));
        setIsPdf(f.fileName.toLowerCase().endsWith('.pdf'));
    }
    function updateField(key, value) {
        setFields(prev => prev.map(f => f.key === key ? { ...f, value } : f));
    }
    function handlePrint() {
        if (!activeFile)
            return;
        const id = getDriveId(activeFile.fileUrl);
        const ext = activeFile.fileName.split('.').pop()?.toLowerCase();
        if (ext === 'pdf' && id) {
            window.open(`https://drive.google.com/file/d/${id}/view`, '_blank');
            return;
        }
        const url = id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : activeFile.fileUrl;
        const win = window.open('', '_blank');
        if (!win)
            return;
        win.document.write(`<html><body style="margin:0"><img src="${url}" style="width:100%" onload="window.print()"/></body></html>`);
        win.document.close();
    }
    function handleDownload() {
        if (!activeFile)
            return;
        const id = getDriveId(activeFile.fileUrl);
        const url = id ? `https://drive.google.com/uc?export=download&id=${id}` : activeFile.fileUrl;
        const a = document.createElement('a');
        a.href = url;
        a.download = activeFile.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    const previewUrl = activeFile ? (() => {
        const id = getDriveId(activeFile.fileUrl);
        if (!id)
            return activeFile.fileUrl;
        return isPdf ? `https://drive.google.com/file/d/${id}/preview` : `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;
    })() : null;
    return (_jsxs("div", { className: "min-h-screen bg-[#0c1322] text-[#dce2f7] font-['Inter',sans-serif] flex flex-col", children: [_jsxs("div", { className: "bg-[#1e293b] border-b border-[#334155] px-4 h-10 flex items-center justify-between shrink-0", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => navigate('/'), className: "text-[#94a3b8] hover:text-white transition-colors", children: _jsx("span", { className: "material-symbols-outlined text-[20px]", children: "arrow_back" }) }), _jsx("span", { className: "text-sm font-bold uppercase tracking-wider", children: "Form Ready" }), activeFile && _jsx("span", { className: "text-[10px] text-[#94a3b8] truncate max-w-[200px]", children: activeFile.fileName })] }), _jsxs("div", { className: "flex gap-2", children: [_jsxs("button", { onClick: handlePrint, disabled: !activeFile, className: "px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded flex items-center gap-1.5 transition-colors", children: [_jsx("span", { className: "material-symbols-outlined text-[16px]", children: "print" }), " Print"] }), _jsxs("button", { onClick: handleDownload, disabled: !activeFile, className: "px-3 py-1.5 border border-[#334155] text-[#94a3b8] hover:text-white disabled:opacity-40 text-xs rounded flex items-center gap-1.5 transition-colors", children: [_jsx("span", { className: "material-symbols-outlined text-[16px]", children: "download" }), " Download"] })] })] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsxs("div", { className: "w-64 bg-[#141b2b] border-r border-[#334155] flex flex-col shrink-0", children: [files.length > 1 && (_jsx("div", { className: "border-b border-[#334155]", children: files.map(f => (_jsx("button", { onClick: () => selectFile(f), className: `w-full text-left px-3 py-2 text-[11px] truncate transition-colors ${activeFile?.id === f.id ? 'bg-blue-600/20 text-blue-300 border-l-2 border-blue-500' : 'text-[#94a3b8] hover:bg-[#1e293b]'}`, children: f.fileName }, f.id))) })), _jsxs("div", { className: "px-3 py-2 border-b border-[#334155] text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider flex items-center gap-1", children: [_jsx("span", { className: "material-symbols-outlined text-[14px]", children: "auto_fix_high" }), "Detected Fields"] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-3 flex flex-col gap-3", children: [fields.map(f => (_jsxs("div", { children: [_jsx("label", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider block mb-1", children: f.label }), _jsx("input", { value: f.value, onChange: e => updateField(f.key, e.target.value), placeholder: `Enter ${f.label.toLowerCase()}…`, className: "w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1.5 text-xs text-[#dce2f7] focus:outline-none focus:border-blue-500 transition-colors placeholder:text-[#475569]" })] }, f.key))), fields.length === 0 && (_jsx("p", { className: "text-[11px] text-[#94a3b8] text-center mt-4", children: "Select a file to detect fields" }))] }), fields.length > 0 && (_jsx("div", { className: "p-3 border-t border-[#334155]", children: _jsxs("div", { className: "text-[9px] text-[#475569] text-center", children: ["Fields are for reference only.", _jsx("br", {}), "Edit before printing."] }) }))] }), _jsx("div", { className: "flex-1 flex flex-col items-center justify-center bg-[#0c1322] p-4 overflow-auto", children: previewUrl ? (_jsxs("div", { className: "flex flex-col items-center gap-3 w-full max-w-2xl", children: [_jsx("div", { className: "text-[10px] text-[#94a3b8] uppercase tracking-wider", children: activeFile?.fileName }), isPdf ? (_jsx("iframe", { src: previewUrl, className: "w-full rounded border border-[#334155] shadow-xl", style: { height: '70vh' }, title: "PDF Preview" })) : (_jsx("div", { className: "bg-white rounded shadow-xl overflow-hidden w-full", children: _jsx("img", { src: previewUrl, alt: "Document", className: "w-full h-auto" }) }))] })) : (_jsxs("div", { className: "flex flex-col items-center gap-3 text-[#94a3b8]", children: [_jsx("span", { className: "material-symbols-outlined text-[48px]", children: "description" }), _jsx("p", { className: "text-sm", children: "No document selected" }), _jsx("button", { onClick: () => navigate('/'), className: "px-4 py-2 border border-[#334155] text-[#94a3b8] hover:text-white text-xs rounded transition-colors", children: "\u2190 Back to Inbox" })] })) })] })] }));
}
