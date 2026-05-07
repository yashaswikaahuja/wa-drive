import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../utils/helpers';
const PROFILE_KEY_LABELS = {
    name: 'Full Name', dob: 'Date of Birth', father_name: "Father's Name",
    mother_name: "Mother's Name", gender: 'Gender', aadhaar_number: 'Aadhaar',
    pan_number: 'PAN', address: 'Full Address', village: 'Village',
    district: 'District', state: 'State', block: 'Block', pincode: 'Pincode',
    mobile: 'Mobile', email: 'Email', category: 'Category', nationality: 'Nationality',
    religion: 'Religion', marital_status: 'Marital Status',
};
export default function MappingsPage() {
    const navigate = useNavigate();
    const [formKeys, setFormKeys] = useState([]);
    const [selected, setSelected] = useState(null);
    const [mapping, setMapping] = useState({});
    const [saving, setSaving] = useState(false);
    useEffect(() => { loadKeys(); }, []);
    async function loadKeys() {
        try {
            const res = await fetch(`${API_BASE_URL}/mappings`);
            const keys = await res.json();
            setFormKeys(keys.filter((k) => k !== 'test_form_123'));
        }
        catch { /* ignore */ }
    }
    async function loadMapping(key) {
        setSelected(key);
        try {
            const res = await fetch(`${API_BASE_URL}/mappings/${key}`);
            const data = await res.json();
            setMapping(data || {});
        }
        catch { /* ignore */ }
    }
    function confidence(m) {
        const f = m.fills || 0, c = m.corrections || 0;
        if (f + c === 0)
            return 0.5;
        return Math.round((f / (f + c * 3)) * 100);
    }
    function confColor(pct) {
        if (pct >= 75)
            return 'text-emerald-400';
        if (pct >= 40)
            return 'text-yellow-400';
        return 'text-red-400';
    }
    async function updateMapping(fieldLabel, newProfileKey) {
        if (!selected)
            return;
        setSaving(true);
        await fetch(`${API_BASE_URL}/mappings/${selected}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: { [fieldLabel]: { profileKey: newProfileKey, delta: { fills: 1, corrections: 0 } } } }),
        });
        await loadMapping(selected);
        setSaving(false);
    }
    async function deleteField(fieldLabel) {
        if (!selected)
            return;
        await fetch(`${API_BASE_URL}/mappings/${selected}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: { [fieldLabel]: { profileKey: mapping[fieldLabel]?.profileKey || '', delta: { fills: 0, corrections: 99 } } } }),
        });
        await loadMapping(selected);
    }
    const entries = Object.entries(mapping).filter(([k]) => k !== 'savedAt');
    return (_jsxs("div", { className: "min-h-screen bg-[#0c1322] text-[#dce2f7] font-['Inter',sans-serif] flex flex-col", children: [_jsxs("div", { className: "bg-[#1e293b] border-b border-[#334155] px-4 h-10 flex items-center gap-3 shrink-0", children: [_jsx("button", { onClick: () => navigate('/'), className: "text-[#94a3b8] hover:text-white", children: _jsx("span", { className: "material-symbols-outlined text-[20px]", children: "arrow_back" }) }), _jsx("span", { className: "text-sm font-bold uppercase tracking-wider", children: "Learned Form Mappings" }), _jsxs("span", { className: "text-[11px] text-[#64748b]", children: [formKeys.length, " forms"] })] }), _jsxs("div", { className: "flex flex-1 overflow-hidden", children: [_jsxs("div", { className: "w-64 bg-[#141b2b] border-r border-[#334155] flex flex-col shrink-0 overflow-y-auto", children: [_jsx("div", { className: "px-3 py-2 text-[10px] text-[#94a3b8] uppercase tracking-wider border-b border-[#334155]", children: "Forms" }), formKeys.length === 0 && _jsx("div", { className: "p-4 text-[11px] text-[#475569]", children: "No learned mappings yet." }), formKeys.map(k => (_jsxs("div", { className: `flex items-center border-b border-[#1e293b] ${selected === k ? 'bg-blue-600/20 border-l-2 border-blue-500' : ''}`, children: [_jsx("button", { onClick: () => loadMapping(k), className: `flex-1 text-left px-3 py-2 text-[11px] truncate transition-colors ${selected === k ? 'text-blue-300' : 'text-[#94a3b8] hover:bg-[#1e293b]'}`, children: k.replace(/_/g, '.') }), _jsx("button", { onClick: async () => { if (confirm(`Delete mapping for ${k}?`)) {
                                            await fetch(`${API_BASE_URL}/mappings/${k}`, { method: 'DELETE' });
                                            if (selected === k) {
                                                setSelected(null);
                                                setMapping({});
                                            }
                                            await loadKeys();
                                        } }, className: "px-2 text-red-500 hover:text-red-300 text-[13px]", title: "Delete form mapping", children: "\u2715" })] }, k)))] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-4", children: [!selected && _jsx("div", { className: "text-[#475569] text-sm mt-8 text-center", children: "Select a form to view its learned mappings" }), selected && (_jsxs("div", { children: [_jsx("div", { className: "text-xs text-[#64748b] mb-3", children: selected.replace(/_/g, '.') }), _jsxs("div", { className: "text-[10px] text-[#94a3b8] mb-2", children: ["Confidence: ", _jsx("span", { className: "text-emerald-400", children: "\u226575% reliable" }), " \u00B7 ", _jsx("span", { className: "text-yellow-400", children: "40-74% uncertain" }), " \u00B7 ", _jsx("span", { className: "text-red-400", children: "<40% wrong" })] }), _jsxs("table", { className: "w-full text-xs border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { className: "text-[#64748b] border-b border-[#334155]", children: [_jsx("th", { className: "text-left py-2 pr-4", children: "Form Field Label" }), _jsx("th", { className: "text-left py-2 pr-4", children: "Maps To" }), _jsx("th", { className: "text-left py-2 pr-4", children: "Confidence" }), _jsx("th", { className: "text-left py-2", children: "Actions" })] }) }), _jsx("tbody", { children: entries.map(([label, m]) => (_jsxs("tr", { className: "border-b border-[#1e293b] hover:bg-[#1e293b]", children: [_jsx("td", { className: "py-2 pr-4 text-[#dce2f7]", children: label }), _jsx("td", { className: "py-2 pr-4", children: _jsxs("select", { value: m.profileKey, onChange: e => updateMapping(label, e.target.value), className: "bg-[#1e293b] border border-[#334155] rounded px-2 py-1 text-xs text-[#dce2f7] focus:outline-none focus:border-blue-500", children: [Object.entries(PROFILE_KEY_LABELS).map(([k, v]) => (_jsxs("option", { value: k, children: [v, " (", k, ")"] }, k))), _jsx("option", { value: m.profileKey, children: m.profileKey })] }) }), _jsxs("td", { className: `py-2 pr-4 font-bold ${confColor(confidence(m))}`, children: [confidence(m), "%"] }), _jsx("td", { className: "py-2", children: _jsx("button", { onClick: () => deleteField(label), className: "text-red-400 hover:text-red-300 text-[10px]", children: "\u2715 Remove" }) })] }, label))) })] }), saving && _jsx("div", { className: "text-[11px] text-blue-400 mt-2", children: "Saving..." })] }))] })] })] }));
}
