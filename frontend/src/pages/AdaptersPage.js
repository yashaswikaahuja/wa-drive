import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../utils/helpers';
const FIELDS = [
    ['triggerSelector', 'Trigger Selector'],
    ['optionSelector', 'Option Selector'],
    ['verifySelector', 'Verify Selector'],
    ['optionsContainer', 'Options Container'],
];
export default function AdaptersPage() {
    const [data, setData] = useState({});
    const [edits, setEdits] = useState({});
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState('');
    const load = () => {
        setLoading(true);
        fetch(`${API_BASE_URL}/adapters`).then(r => r.json()).then((store) => {
            setData(store);
            const init = {};
            Object.entries(store).forEach(([host, map]) => Object.entries(map).forEach(([cls, a]) => { init[`${host}::${cls}`] = { ...a }; }));
            setEdits(init);
        }).finally(() => setLoading(false));
    };
    useEffect(load, []);
    const notify = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };
    const setField = (host, cls, field, val) => {
        const k = `${host}::${cls}`;
        setEdits(prev => ({ ...prev, [k]: { ...prev[k], [field]: val } }));
    };
    const save = async (host, cls) => {
        const e = edits[`${host}::${cls}`] || {};
        const res = await fetch(`${API_BASE_URL}/adapters/${host}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ componentClass: cls, triggerSelector: e.triggerSelector, optionSelector: e.optionSelector, verifySelector: e.verifySelector, optionsContainer: e.optionsContainer }),
        });
        const d = await res.json();
        d.ok ? (notify('Saved'), load()) : notify(d.error || 'Failed');
    };
    const del = async (host, cls) => {
        if (!confirm(`Delete ${cls} for ${host}?`))
            return;
        await fetch(`${API_BASE_URL}/adapters/${host}/${cls}`, { method: 'DELETE' });
        notify('Deleted');
        load();
    };
    const toggleStale = async (host, cls, stale) => {
        await fetch(`${API_BASE_URL}/adapters/${host}/${cls}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stale }),
        });
        notify(stale ? 'Marked stale' : 'Marked active');
        load();
    };
    const total = Object.values(data).reduce((s, h) => s + Object.keys(h).length, 0);
    return (_jsxs("div", { className: "h-full flex flex-col overflow-hidden", children: [_jsxs("div", { className: "px-4 md:px-6 py-3 border-b border-border flex items-center justify-between shrink-0", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("h1", { className: "text-base font-bold text-white", children: "Adapters" }), _jsxs("span", { className: "text-[11px] text-[#64748b]", children: [total, " adapter", total !== 1 ? "s" : ""] })] }), _jsx("button", { onClick: load, className: "btn-ghost p-1.5", title: "Refresh", children: _jsx("span", { className: "material-symbols-outlined text-[18px]", children: "refresh" }) })] }), toast && (_jsx("div", { className: "mx-4 mt-2 px-3 py-2 rounded text-xs bg-blue-900/50 text-blue-300", children: toast })), _jsxs("div", { className: "flex-1 overflow-y-auto p-4", children: [loading && _jsx("div", { className: "text-[#475569] text-sm mt-8 text-center", children: "Loading..." }), !loading && total === 0 && _jsx("div", { className: "text-[#475569] text-sm mt-8 text-center", children: "No adapters saved yet." }), Object.entries(data).map(([host, adapters]) => (_jsxs("div", { className: "mb-6", children: [_jsx("div", { className: "text-xs text-[#7dd3fc] font-semibold uppercase tracking-wider mb-2", children: host }), Object.entries(adapters).map(([cls, a]) => {
                                const e = edits[`${host}::${cls}`] || a;
                                return (_jsxs("div", { className: "bg-[#1e293b] border border-[#334155] rounded p-4 mb-3", children: [_jsxs("div", { className: "flex items-start justify-between mb-3", children: [_jsxs("div", { children: [_jsx("span", { className: "text-sm font-semibold", children: cls }), _jsx("span", { className: `ml-2 text-[10px] px-1.5 py-0.5 rounded ${a.stale ? 'bg-yellow-900 text-yellow-300' : 'bg-emerald-900 text-emerald-300'}`, children: a.stale ? '⚠ stale' : '✓ active' }), _jsxs("div", { className: "text-[11px] text-[#64748b] mt-0.5", children: ["v", a.adapterVersion, " \u00B7 ", a.learnedAt, " \u00B7 \u2713", a.successCount, " \u2717", a.failureCount] })] }), _jsx("button", { onClick: () => del(host, cls), className: "text-red-400 hover:text-red-300 text-xs", children: "\u2715 Delete" })] }), FIELDS.map(([f, label]) => (_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("span", { className: "text-[11px] text-[#94a3b8] w-36 shrink-0", children: label }), _jsx("input", { value: e[f] || '', onChange: ev => setField(host, cls, f, ev.target.value), className: "flex-1 bg-[#0c1322] border border-[#334155] rounded px-2 py-1 text-xs text-[#dce2f7] focus:outline-none focus:border-blue-500" })] }, f))), _jsxs("div", { className: "flex gap-2 mt-3", children: [_jsx("button", { onClick: () => save(host, cls), className: "text-[11px] bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-white", children: "\uD83D\uDCBE Save" }), _jsx("button", { onClick: () => toggleStale(host, cls, !a.stale), className: "text-[11px] bg-[#334155] hover:bg-[#475569] px-3 py-1 rounded", children: a.stale ? '✅ Mark Active' : '⚠ Mark Stale' })] })] }, cls));
                            })] }, host)))] })] }));
}
