import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
import { Alert, Avatar, Badge, Button, Card, Col, Empty, Image, Input, List, Popconfirm, Row, Space, Typography, notification, } from 'antd';
import { DeleteOutlined, DownloadOutlined, FileOutlined, FilePdfOutlined, PlayCircleOutlined, PrinterOutlined, ReloadOutlined, ScissorOutlined, SearchOutlined, SoundOutlined, UserOutlined, } from '@ant-design/icons';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useWhatsAppStore } from '../stores/whatsappStore';
import { fetchWhatsAppFiles, fetchWhatsAppStatus, deleteWhatsAppFile } from '../services/whatsapp.api';
import GoogleDriveLogin from '../components/GoogleDriveLogin';
import { SOCKET_URL, getPreviewUrl } from '../utils/helpers';
dayjs.extend(relativeTime);
const { Text, Title } = Typography;
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
function fileExt(name) {
    return name.split('.').pop()?.toLowerCase() ?? '';
}
function FileIcon({ fileName }) {
    const ext = fileExt(fileName);
    if (IMAGE_EXTS.has(ext))
        return null; // handled by Image component
    if (ext === 'pdf')
        return _jsx(FilePdfOutlined, { style: { fontSize: 48, color: '#ff4d4f' } });
    if (['mp4', '3gp', 'mov', 'avi'].includes(ext))
        return _jsx(PlayCircleOutlined, { style: { fontSize: 48, color: '#1677ff' } });
    if (['mp3', 'ogg', 'wav', 'aac'].includes(ext))
        return _jsx(SoundOutlined, { style: { fontSize: 48, color: '#fa8c16' } });
    return _jsx(FileOutlined, { style: { fontSize: 48, color: '#8c8c8c' } });
}
function formatTime(ts) {
    const d = dayjs(ts);
    return dayjs().diff(d, 'hour') < 24
        ? d.format('h:mm A')
        : d.format('MMM D, h:mm A');
}
const SLIDE_IN_CSS = `
@keyframes slideIn {
  from { opacity: 0; transform: translateY(-16px); background: #f6ffed; }
  to   { opacity: 1; transform: translateY(0);     background: transparent; }
}
.new-file-card { animation: slideIn 0.6s ease-out; }
`;
export default function WhatsAppInboxPage() {
    const navigate = useNavigate();
    const newIds = useRef(new Set());
    const { files, connected, loading, error, setFiles, addFile, removeFile, setConnected, setLoading, setError } = useWhatsAppStore();
    useEffect(() => {
        const socket = io(SOCKET_URL);
        socket.on('connection:status', (s) => setConnected(s.connected));
        socket.on('new_whatsapp_file', (file) => {
            newIds.current.add(file.id);
            addFile(file);
            notification.success({
                message: 'New file received',
                description: `${file.customerName}: ${file.fileName}`,
                placement: 'topRight',
                duration: 4,
            });
            setTimeout(() => newIds.current.delete(file.id), 3000);
        });
        load();
        return () => { socket.disconnect(); };
    }, []);
    async function load() {
        setLoading(true);
        setError(null);
        try {
            const [f, c] = await Promise.all([fetchWhatsAppFiles(), fetchWhatsAppStatus()]);
            setFiles(f);
            setConnected(c);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load');
        }
        finally {
            setLoading(false);
        }
    }
    async function handleDelete(id) {
        await deleteWhatsAppFile(id);
        removeFile(id);
        notification.success({ message: 'File deleted', placement: 'topRight' });
    }
    function handlePrint(fileUrl) {
        const win = window.open(getPreviewUrl(fileUrl), '_blank');
        win?.addEventListener('load', () => win.print());
    }
    return (_jsxs(_Fragment, { children: [_jsx("style", { children: SLIDE_IN_CSS }), _jsx("div", { style: { padding: 24, background: '#f5f5f5', minHeight: '100vh' }, children: _jsxs(Card, { variant: "outlined", style: { borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }, children: [_jsxs(Row, { justify: "space-between", align: "middle", style: { marginBottom: 8 }, children: [_jsxs(Col, { children: [_jsxs(Space, { align: "center", size: 12, children: [_jsx(Title, { level: 3, style: { margin: 0 }, children: "WhatsApp Inbox" }), _jsx(Badge, { status: connected ? 'success' : 'error' })] }), _jsx(Text, { type: "secondary", style: { display: 'block', marginTop: 2 }, children: "Real-time customer files from WhatsApp" })] }), _jsx(Col, { children: _jsxs(Space, { children: [_jsxs(Text, { type: "secondary", children: [files.length, " file", files.length !== 1 ? 's' : ''] }), _jsx(Input, { prefix: _jsx(SearchOutlined, {}), placeholder: "Search\u2026", style: { width: 180 }, disabled: true }), _jsx(GoogleDriveLogin, {}), _jsx(Button, { icon: _jsx(ReloadOutlined, {}), onClick: load, loading: loading, children: "Refresh" })] }) })] }), _jsx(Alert, { type: connected ? 'success' : 'warning', message: connected ? 'Connected – receiving files' : 'Disconnected. Scan QR code in the server terminal.', showIcon: true, style: { marginBottom: 16, borderRadius: 8 } }), error && (_jsx(Alert, { type: "error", message: error, showIcon: true, style: { marginBottom: 16, borderRadius: 8 } })), _jsx(List, { loading: loading, dataSource: files, locale: { emptyText: (_jsx(Empty, { description: _jsxs(Text, { type: "secondary", children: ["No files received yet.", _jsx("br", {}), "Ask customers to send files via WhatsApp."] }) })) }, renderItem: (file) => {
                                const isImg = IMAGE_EXTS.has(fileExt(file.fileName));
                                const isNew = newIds.current.has(file.id);
                                const previewUrl = getPreviewUrl(file.fileUrl);
                                return (_jsx(List.Item, { style: { padding: '12px 0' }, children: _jsx(Card, { hoverable: true, className: isNew ? 'new-file-card' : '', style: { width: '100%', borderRadius: 10 }, styles: { body: { padding: '12px 16px' } }, children: _jsxs(Row, { align: "middle", gutter: 16, wrap: false, children: [_jsx(Col, { flex: "88px", children: _jsx("div", { style: {
                                                            width: 80, height: 80, borderRadius: 8, overflow: 'hidden',
                                                            background: '#fafafa', border: '1px solid #f0f0f0',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }, children: isImg ? (_jsx(Image, { src: previewUrl, width: 80, height: 80, style: { objectFit: 'cover' }, preview: { src: previewUrl }, fallback: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" })) : (_jsx(FileIcon, { fileName: file.fileName })) }) }), _jsxs(Col, { flex: "auto", style: { minWidth: 0 }, children: [_jsx(Text, { strong: true, style: { fontSize: 15, display: 'block' }, ellipsis: true, children: file.fileName }), _jsxs(Space, { size: 8, style: { marginTop: 4 }, children: [_jsx(Avatar, { src: file.profilePicUrl ?? undefined, icon: !file.profilePicUrl && _jsx(UserOutlined, {}), size: 22 }), _jsx(Text, { type: "secondary", style: { fontSize: 13 }, children: file.customerName }), _jsx(Text, { type: "secondary", style: { fontSize: 13 }, children: "\u00B7" }), _jsx(Text, { type: "secondary", style: { fontSize: 13 }, children: file.customerId })] }), _jsx(Text, { type: "secondary", style: { fontSize: 12, display: 'block', marginTop: 4 }, children: formatTime(file.timestamp) })] }), _jsx(Col, { flex: "none", children: _jsxs(Space, { size: 6, wrap: true, children: [_jsx("a", { href: previewUrl, download: file.fileName, children: _jsx(Button, { size: "small", icon: _jsx(DownloadOutlined, {}), children: "Download" }) }), _jsx(Button, { size: "small", type: "primary", ghost: true, icon: _jsx(ScissorOutlined, {}), onClick: () => navigate('/photo-stitch', { state: { file } }), children: "Photo Stitch" }), _jsx(Button, { size: "small", icon: _jsx(PrinterOutlined, {}), onClick: () => handlePrint(file.fileUrl), children: "Print" }), _jsx(Popconfirm, { title: "Delete this file?", okText: "Delete", okType: "danger", onConfirm: () => handleDelete(file.id), children: _jsx(Button, { size: "small", danger: true, icon: _jsx(DeleteOutlined, {}), children: "Delete" }) })] }) })] }) }) }));
                            } })] }) })] }));
}
