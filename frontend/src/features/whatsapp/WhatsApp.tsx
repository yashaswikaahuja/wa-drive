import { useEffect, useState, useRef, memo, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client'; // v2
import api, { API_URL, SOCKET_URL } from '../../shared/api';
import { toast } from '../../shared/toast';
import { getCachedBlob } from '../../shared/fileCache';

interface Message {
  id: string; phone: string; name: string; fileName?: string; text?: string;
  fileUrl?: string; timestamp: string; type?: string;
}
interface Chat { phone: string; name: string; lastTime: string; messages: Message[]; newCount: number; }

interface Person { id: string; name: string; displayLabel: string; relationship: string; }
interface Household { phone: string; persons: Person[]; person_count: string; }

function docTitle(fileName: string): { title: string; badge: string; icon: string } {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) return { title: 'Photo', badge: 'IMG', icon: '🖼️' };
  if (['mp4','3gp','mov','avi','webm'].includes(ext)) return { title: 'Video', badge: 'VID', icon: '🎬' };
  if (ext === 'pdf') return { title: 'PDF Document', badge: 'PDF', icon: '📕' };
  if (['mp3','ogg','wav','aac','opus'].includes(ext)) return { title: 'Audio', badge: 'AUD', icon: '🎵' };
  return { title: 'Document', badge: ext.toUpperCase() || 'FILE', icon: '📄' };
}

function timeAgo(ts: string): string {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  return new Date(ts).toLocaleDateString();
}

const LazyThumbnail = memo(({ src, ext, alt }: { src?: string; ext: string; alt?: string }) => {
  const [visible, setVisible] = useState(false);
  const [imgError, setImgError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || visible) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { rootMargin: '100px' });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visible]);
  const isImage = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext);
  const isVideo = ['mp4','3gp','mov','avi','webm'].includes(ext);
  const isPdf = ext === 'pdf';
  const hasThumbnail = isImage || isVideo || isPdf;
  const { icon, badge } = docTitle(alt || ('file.' + ext));
  return (
    <div ref={ref} className="w-[72px] h-[72px] rounded-xl bg-white/5 relative overflow-hidden flex items-center justify-center">
      {visible && src && hasThumbnail && !imgError ? (
        <>
          <img src={src} className="w-full h-full object-cover" loading="lazy" alt={alt}
            onError={() => setImgError(true)} />
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-1">
          <span className="text-2xl">{isVideo ? '🎬' : icon}</span>
          <span className="text-[8px] px-1 py-0.5 rounded bg-white/10 text-gray-400 font-bold">{badge}</span>
        </div>
      )}
      {isVideo && visible && src && !imgError && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white text-[10px]">▶</span>
        </span>
      )}
    </div>
  );
});

const MessageCard = memo(({ msg, onClick, selectionMode, selected, onToggleSelect }: any) => {
  const ext = msg.fileName?.split('.').pop()?.toLowerCase() || '';
  const thumbUrl = msg.fileUrl?.includes('uc?export=view') ? msg.fileUrl.replace('uc?export=view&id=','thumbnail?id=')+'&sz=w400' : (msg.fileUrl?.replace('sz=w200','sz=w400') || msg.fileUrl);
  const { title, badge } = docTitle(msg.fileName || '');

  if (msg.text && !msg.fileName) return (
    <div className="bg-[#1a2236] rounded-lg px-3 py-2 max-w-[80%]">
      <p className="text-sm text-gray-300">{msg.text}</p>
      <p className="text-[10px] text-gray-600 mt-1">{timeAgo(msg.timestamp)}</p>
    </div>
  );

  return (
    <div className={`bg-[#1a2236] border rounded-xl p-3 flex gap-3 max-w-[480px] transition group ${selected ? 'border-blue-500/60' : 'border-white/5 hover:border-blue-500/20'}`}>
      {selectionMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(msg)}
          className="w-4 h-4 self-center accent-blue-500 cursor-pointer"
        />
      )}
      <div onClick={() => selectionMode ? onToggleSelect(msg) : onClick(msg)} className="shrink-0 cursor-pointer">
        <LazyThumbnail src={thumbUrl} ext={ext} alt={title} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{badge} · {timeAgo(msg.timestamp)}</p>
        </div>
        {!selectionMode && (
          <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition">
            <button onClick={() => onClick(msg)} className="text-[10px] px-2 py-0.5 rounded-md bg-blue-600/20 text-blue-400 hover:bg-blue-600/30">Open</button>
            <button onClick={(e) => { e.stopPropagation(); const driveId = msg.fileUrl?.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1]; if (!driveId) return; const w = window.open('', '_blank'); if(!w) return; w.document.write('<p>Loading...</p>'); getCachedBlob(driveId, async () => { const res = await api.get(`/drive/download/${driveId}`, {responseType:'blob'}); return new Blob([res.data], {type: res.headers['content-type']||'application/pdf'}); }).then(blob => { w.location.href = URL.createObjectURL(blob); }).catch(() => { w.document.write('<p>Failed to load file</p>'); }); }} className="text-[10px] px-2 py-0.5 rounded-md bg-green-600/20 text-green-400 hover:bg-green-600/30">Print</button>
            <button onClick={(e) => { e.stopPropagation(); const driveId = msg.fileUrl?.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1]; if (!driveId) return; getCachedBlob(driveId, async () => { const res = await api.get(`/drive/download/${driveId}`, {responseType:'blob'}); return new Blob([res.data], {type: res.headers['content-type']||'application/octet-stream'}); }).then(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = msg.fileName || 'file'; a.click(); }); }} className="text-[10px] px-2 py-0.5 rounded-md bg-purple-600/20 text-purple-400 hover:bg-purple-600/30">Download</button>
          </div>
        )}
      </div>
    </div>
  );
});

const ChatItem = memo(({ chat, selected, onClick, unreadCount, pinned, onPin }: any) => (
  <div onClick={() => onClick(chat.phone)}
    className={`px-3 py-3 border-b border-white/5 cursor-pointer hover:bg-white/5 ${selected ? 'bg-blue-600/10' : ''}`}>
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-full bg-green-600/20 flex items-center justify-center text-green-400 text-xs font-bold shrink-0">
        {chat.name[0]?.toUpperCase() || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium truncate">{chat.name} {pinned && <span className="text-[9px] text-gray-500">📌</span>}</p>
        <p className="text-[11px] text-gray-500">{chat.newCount} document{chat.newCount !== 1 ? 's' : ''}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[10px] text-gray-600">{timeAgo(chat.lastTime)}</span>
        {unreadCount > 0 && <span className="w-5 h-5 rounded-full bg-green-500 text-white text-[10px] flex items-center justify-center font-bold">{unreadCount}</span>}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onPin(chat.phone); }} className="text-gray-600 hover:text-white text-xs opacity-0 group-hover:opacity-100" title={pinned ? 'Unpin' : 'Pin'}>📌</button>
    </div>
  </div>
));

export default function WhatsApp() {
  const [connected, setConnected] = useState<boolean | null>(() => {
    const cached = localStorage.getItem('cc-wa-connected');
    return cached !== null ? cached === 'true' : null;
  });
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [chats, setChats] = useState<Map<string, Chat>>(new Map());
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [viewerFile, setViewerFile] = useState<Message | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<Map<string, Message>>(new Map());
  const [showPicker, setShowPicker] = useState(false);
  const [unread, setUnread] = useState<Map<string, number>>(new Map());
  const [chatSearch, setChatSearch] = useState('');
  const [pinnedChats, setPinnedChats] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('cc-pinned-chats') || '[]')); } catch { return new Set(); }
  });
  const [msgSearch, setMsgSearch] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractedSuggestions, setExtractedSuggestions] = useState<any | null>(null);
  const [targetPersonId, setTargetPersonId] = useState<string | null>(null);
  const targetPersonIdRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const msgContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  useEffect(() => {
    api.get('/whatsapp/status').then(r => {
      if (r.data.connected) {
        setConnected(true);
        localStorage.setItem('cc-wa-connected', 'true');
      } else if (localStorage.getItem('cc-wa-connected') !== 'true') {
        setConnected(false);
        localStorage.setItem('cc-wa-connected', 'false');
        localStorage.removeItem('cc-drive-files');
      }
      // Auto-start session if none exists
      if (r.data.status === 'none' || (!r.data.connected && !r.data.qr)) {
        api.post('/whatsapp/connect').catch(() => {});
      }
      if (r.data.qr) setQrCode(r.data.qr);
    }).catch(() => {});
    // Load cached data instantly, then refresh from server
    const cached = localStorage.getItem('cc-drive-files');
    if (cached) {
      try { const msgs = JSON.parse(cached); groupMessages(msgs); } catch {}
    }
    api.get('/drive/files/ws').then(r => {
      const msgs: Message[] = r.data.map((f: any) => ({
        id: f.id, phone: f.customerId || 'unknown', name: f.customerName || f.customerId || 'Unknown',
        fileName: f.fileName, fileUrl: f.fileUrl, timestamp: f.timestamp
      }));
      localStorage.setItem('cc-drive-files', JSON.stringify(msgs));
      groupMessages(msgs);
    }).catch(() => {});
    const baseUrl = SOCKET_URL;
    const socket = io(baseUrl, { transports: ['polling', 'websocket'], reconnectionAttempts: 3, timeout: 5000 });
    socketRef.current = socket;
    socket.on('connection:status', (data: any) => {
      if (data.connected) {
        setConnected(true); setQrCode(null); setReconnecting(false);
        localStorage.setItem('cc-wa-connected', 'true');
      }
      // Don't set disconnected from socket — let poll handle it to avoid flash
    });
    socket.on('qr', (data: any) => setQrCode(data.qr || data));
    socket.on('new_whatsapp_file', (file: any) => {
      const phone = file.phoneNumber || file.customerId || 'unknown';
      const name = file.customerName || file.phoneNumber || 'Unknown';
      addMessage({ id: file.id || Date.now().toString(), phone, name, fileName: file.fileName,
        fileUrl: file.fileUrl, timestamp: file.timestamp || new Date().toISOString() });
      // Browser notification
      if (Notification.permission === 'granted') {
        new Notification(`📄 ${name}`, { body: file.fileName || 'New document received', icon: '/favicon.ico' });
        new Audio('/notify.mp3').play().catch(() => {});
      }
      // Track unread
      setUnread(prev => { const m = new Map(prev); m.set(phone, (m.get(phone) || 0) + 1); const total = Array.from(m.values()).reduce((a,b)=>a+b,0); localStorage.setItem('cc-wa-unread', String(total)); return m; });
    });
    // Request notification permission
    if (Notification.permission === 'default') Notification.requestPermission();
    return () => { socket.disconnect(); };
  }, []);

  const groupMessages = useCallback((msgs: Message[]) => {
    const map = new Map<string, Chat>();
    msgs.forEach(m => {
      const key = m.phone;
      if (!map.has(key)) map.set(key, { phone: key, name: m.name, lastTime: m.timestamp, messages: [], newCount: 0 });
      const chat = map.get(key)!;
      chat.messages.push(m);
      if (m.timestamp > chat.lastTime) chat.lastTime = m.timestamp;
      chat.newCount = chat.messages.length;
    });
    setChats(map);
  }, []);

  const addMessage = useCallback((msg: Message) => {
    setChats(prev => {
      const map = new Map(prev);
      const key = msg.phone;
      if (!map.has(key)) map.set(key, { phone: key, name: msg.name, lastTime: msg.timestamp, messages: [], newCount: 0 });
      const chat = map.get(key)!;
      chat.messages.unshift(msg);
      chat.lastTime = msg.timestamp;
      chat.newCount++;
      return map;
    });
  }, []);

  const handleShowQR = useCallback(async () => { const r = await api.get('/whatsapp/qr'); if (r.data.qrCode) setQrCode(r.data.qrCode); }, []);

  // Poll status - detect connect/disconnect
  useEffect(() => {
    let disconnectCount = 0;
    const interval = connected ? 3000 : 3000;
    const poll = setInterval(() => {
      api.get('/whatsapp/status').then(r => {
        if (r.data.connected) {
          if (!connected) { setConnected(true); setQrCode(null); setReconnecting(false); }
          localStorage.setItem('cc-wa-connected', 'true');
          // Refresh files when connected
          api.get('/drive/files/ws').then(fr => {
            const msgs: Message[] = fr.data.map((f: any) => ({
              id: f.id, phone: f.customerId || 'unknown', name: f.customerName || f.customerId || 'Unknown',
              fileName: f.fileName, fileUrl: f.fileUrl, timestamp: f.timestamp
            }));
            if (msgs.length > 0) { localStorage.setItem('cc-drive-files', JSON.stringify(msgs)); groupMessages(msgs); }
          }).catch(() => {});
          disconnectCount = 0;
        } else if (r.data.qr) {
          setQrCode(r.data.qr); setReconnecting(false);
          disconnectCount++;
          if (disconnectCount >= 2) { setConnected(false); localStorage.setItem('cc-wa-connected', 'false'); }
        } else {
          disconnectCount++;
          if (disconnectCount >= 2) { setConnected(false); setReconnecting(true); localStorage.setItem('cc-wa-connected', 'false'); localStorage.removeItem('cc-drive-files'); }
        }
      }).catch(() => {});
    }, interval);
    return () => clearInterval(poll);
  }, [connected]);

  const handleSelectChat = useCallback((phone: string) => {
    setSelectedChat(phone);
    setSelectionMode(false);
    setSelectedDocs(new Map());
    setUnread(prev => { const m = new Map(prev); m.delete(phone); const total = Array.from(m.values()).reduce((a,b)=>a+b,0); localStorage.setItem('cc-wa-unread', String(total)); return m; });
    userScrolledUpRef.current = false;
    setMsgSearch('');
    setTimeout(() => messagesEndRef.current?.scrollIntoView(), 100);
  }, []);

  const togglePin = useCallback((phone: string) => {
    setPinnedChats(prev => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone); else next.add(phone);
      localStorage.setItem('cc-pinned-chats', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const assignChat = useCallback(async (phone: string, name: string) => {
    const isLid = !/^[0-9]{10,13}$/.test(phone);
    const realPhone = isLid ? prompt(`Enter real phone for "${name}" (e.g. 919876543210):`) : phone;
    if (!realPhone) return;
    try {
      await api.post('/customers/persons', { phone: realPhone, name, displayLabel: name, relationship: 'self' });
      if (isLid) await api.post('/whatsapp/link-lid', { lid: phone, phone: realPhone }).catch(() => {});
      toast.success(`Assigned ${name} → ${realPhone}`);
    } catch (e: any) {
      if (e.response?.status === 409) toast.info('Already assigned');
      else toast.error(e.response?.data?.error || 'Failed to assign');
    }
  }, []);

  const requestDocs = useCallback(async (phone: string) => {
    try {
      await api.post('/whatsapp/send', { phone, message: 'नमस्ते! कृपया अपने डॉक्यूमेंट्स (आधार कार्ड, मार्कशीट, फोटो आदि) WhatsApp पर भेजें। / Hello! Please send your documents (Aadhaar, marksheets, photo etc.) on this WhatsApp.' });
      toast.success('Document request sent');
    } catch { toast.error('Failed to send request'); }
  }, []);

  const handleOpenFile = useCallback((msg: Message) => setViewerFile(msg), []);
  const handleCloseViewer = useCallback(() => setViewerFile(null), []);

  const toggleDocSelection = useCallback((msg: Message) => {
    setSelectedDocs(prev => {
      const next = new Map(prev);
      if (next.has(msg.id)) next.delete(msg.id);
      else next.set(msg.id, msg);
      return next;
    });
  }, []);

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedDocs(new Map());
  };

  const startBuildProfile = async () => {
    setShowPicker(true);
  };

  const onPickerConfirm = async (personId: string) => {
    setShowPicker(false);
    targetPersonIdRef.current = personId;
    setTargetPersonId(personId);
    setExtracting(true);
    setExtractError('');
    try {
      // Multi-document extraction — call extract per doc, merge results
      const docs = Array.from(selectedDocs.values()).filter(d => d.fileName && !['mp4','3gp','mov','avi','webm','mp3','ogg','wav'].includes(d.fileName.split('.').pop()?.toLowerCase() || ''));
      if (docs.length === 0) { setExtractError('No images or PDFs in selection'); setExtracting(false); return; }
      // Run extractions sequentially to avoid Groq rate limits
      const results: any[] = [];
      for (const d of docs) {
        try {
          const r = await api.post('/process/extract', { fileId: d.id });
          results.push({ doc: d, result: r.data });
        } catch (e: any) {
          results.push({ doc: d, result: { error: e.message } });
        }
      }
      // Priority-based merge: each field has a "best source" priority by doc type.
      // Higher priority document types overwrite lower for the same field.
      const TYPE_PRIORITY: Record<string, number> = {
        aadhaar: 100, pan: 95, passport: 95, voter_id: 90, driving_license: 90,
        marksheet_postgrad: 85, marksheet_graduation: 85, marksheet_12th: 80, marksheet_10th: 75,
        admit_card: 70, certificate: 65, bank_passbook: 60, ration_card: 55,
        result: 50, form: 40, other: 20, photo: 10, signature: 10,
      };
      // Field-specific priority overrides (e.g., name from Aadhaar > name from admit card)
      const FIELD_PREFERRED_TYPE: Record<string, string[]> = {
        // Identity fields prefer Aadhaar/PAN/Passport
        name: ['aadhaar', 'pan', 'passport', 'voter_id', 'driving_license'],
        father_name: ['aadhaar', 'pan'],
        dob: ['aadhaar', 'passport', 'pan'],
        gender: ['aadhaar', 'passport'],
        address: ['aadhaar', 'voter_id', 'passport'],
        permanent_address: ['aadhaar', 'voter_id', 'passport'],
        // Marksheet fields prefer their specific marksheet type
        passing_year_10th: ['marksheet_10th'],
        marks_10th: ['marksheet_10th'],
        percentage_10th: ['marksheet_10th'],
        board_10th: ['marksheet_10th'],
        passing_year_12th: ['marksheet_12th'],
        marks_12th: ['marksheet_12th'],
        percentage_12th: ['marksheet_12th'],
        board_12th: ['marksheet_12th'],
        // Exam fields prefer admit card
        roll_number: ['admit_card', 'marksheet_10th', 'marksheet_12th', 'marksheet_graduation'],
        registration_number: ['admit_card'],
        exam_name: ['admit_card'],
        exam_date: ['admit_card'],
        exam_center: ['admit_card'],
        application_number: ['admit_card', 'form'],
      };

      const merged: Record<string, any> = {};
      const errors: string[] = [];

      for (const r of results) {
        if (!r) continue;
        if (r.result?.error) {
          errors.push(r.doc.fileName + ': ' + (r.result.message || r.result.error));
          continue;
        }
        if (!r.result?.suggested) continue;
        const docType = r.result.suggested.document_type?.value || 'other';
        const docPriority = TYPE_PRIORITY[docType] || 30;

        for (const [k, v] of Object.entries(r.result.suggested)) {
          if (k === 'document_type') continue;  // skip the type marker itself
          const fieldInfo = v as any;
          if (!fieldInfo.value || !String(fieldInfo.value).trim()) continue;

          const existing = merged[k];

          // No existing value — accept it
          if (!existing) {
            merged[k] = { ...fieldInfo, documentId: r.doc.id, sourceDocType: docType, _priority: docPriority };
            continue;
          }

          // Field has preferred doc types — check those first
          const preferred = FIELD_PREFERRED_TYPE[k];
          if (preferred) {
            const existingPreferredIdx = preferred.indexOf(existing.sourceDocType);
            const newPreferredIdx = preferred.indexOf(docType);
            if (newPreferredIdx !== -1 && (existingPreferredIdx === -1 || newPreferredIdx < existingPreferredIdx)) {
              merged[k] = { ...fieldInfo, documentId: r.doc.id, sourceDocType: docType, _priority: docPriority };
              continue;
            }
            if (existingPreferredIdx !== -1 && newPreferredIdx === -1) continue;  // existing wins
          }

          // Fall back to general type priority
          if (docPriority > (existing._priority || 0)) {
            merged[k] = { ...fieldInfo, documentId: r.doc.id, sourceDocType: docType, _priority: docPriority };
          }
        }
      }
      // Strip internal merge metadata before showing to operator
      Object.values(merged).forEach((v: any) => { delete v._priority; delete v.sourceDocType; });
      // Debug log so operator can inspect in browser devtools (F12)
      console.log('[Build Profile] Per-document results:', results.map((r: any) => ({
        file: r?.doc?.fileName,
        type: r?.result?.suggested?.document_type?.value,
        fields: r?.result?.suggested ? Object.keys(r.result.suggested) : null,
        error: r?.result?.error || r?.result?.message,
      })));
      console.log('[Build Profile] Merged fields:', Object.keys(merged), merged);
      // Remove document_type from saved fields (it's just a classification, not profile data)
      delete merged.document_type;
      if (Object.keys(merged).length === 0) {
        const errMsg = errors.length > 0
          ? errors.join('\n')
          : 'No extractable data found in selected documents. Make sure you selected actual ID/document images, not photos or screenshots.';
        setExtractError(errMsg);
        return;
      }
      setExtractedSuggestions(merged);
    } catch (e: any) {
      setExtractError(e.message || 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const onConfirmExtraction = async (acceptedFields: Record<string, any>) => {
    const pid = targetPersonIdRef.current || targetPersonId;
    console.log('[Save] personId:', pid, 'fields:', Object.keys(acceptedFields).length);
    if (!pid) { setExtractError('No target person — pick a person first'); return; }
    try {
      await api.patch(`/customers/persons/${pid}`, { fields: acceptedFields });
      setExtractedSuggestions(null);
      setTargetPersonId(null);
      exitSelectionMode();
      alert('Profile updated with extracted fields');
    } catch (e: any) { setExtractError(e.message); }
  };

  const sortedChats = useMemo(() => Array.from(chats.values()).sort((a, b) => b.lastTime.localeCompare(a.lastTime)), [chats]);
  const filteredChats = useMemo(() => {
    let list = sortedChats;
    if (chatSearch.trim()) {
      const q = chatSearch.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }
    // Pinned chats first
    return [...list].sort((a, b) => {
      const ap = pinnedChats.has(a.phone) ? 1 : 0;
      const bp = pinnedChats.has(b.phone) ? 1 : 0;
      return bp - ap;
    });
  }, [sortedChats, chatSearch, pinnedChats]);
  const activeChat = selectedChat ? chats.get(selectedChat) : null;
  const reversedMessages = useMemo(() => {
    if (!activeChat) return [];
    let msgs = [...activeChat.messages].reverse();
    if (msgSearch.trim()) {
      const q = msgSearch.toLowerCase();
      msgs = msgs.filter(m => m.fileName?.toLowerCase().includes(q) || m.text?.toLowerCase().includes(q));
    }
    return msgs;
  }, [activeChat, msgSearch]);

  // Auto-scroll on new messages if user hasn't scrolled up
  useEffect(() => {
    if (!userScrolledUpRef.current) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [reversedMessages.length]);

  if (connected === null) {
    return <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>;
  }

  if (!connected) {
    return (
      <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center">
        <div className="text-5xl mb-4">💬</div>
        <h2 className="text-lg font-bold text-white mb-2">Connect WhatsApp</h2>
        <p className="text-sm text-gray-500 mb-6">Link your WhatsApp to receive customer documents. Files sent to this number will appear here automatically.</p>
        {qrCode ? (
          <div className="bg-white p-4 rounded-xl mb-4 shadow-lg">
            <img src={qrCode.startsWith('data:') ? qrCode : `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`} alt="QR" className="w-48 h-48" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 mb-4">
            {reconnecting && <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
            <button onClick={handleShowQR} className="px-5 py-2.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
              {reconnecting ? 'Connecting...' : 'Connect WhatsApp'}
            </button>
          </div>
        )}
        <div className="text-xs text-gray-600 mt-4 space-y-1">
          <p>1. Open WhatsApp on your phone</p>
          <p>2. Go to Settings → Linked Devices</p>
          <p>3. Scan the QR code above</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-48px)] flex">
      <div className="w-72 border-r border-white/5 flex flex-col">
        <div className="p-3 border-b border-white/5 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-sm text-white font-medium">Inbox</span>
          <span className="text-[10px] text-gray-500 ml-auto">{sortedChats.length} customers</span>
        </div>
        <div className="px-3 py-2 border-b border-white/5">
          <input value={chatSearch} onChange={e => setChatSearch(e.target.value)} placeholder="Search customers..." className="w-full px-2.5 py-1.5 bg-[#1a2236] border border-white/10 rounded-lg text-xs text-white outline-none placeholder:text-gray-600" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredChats.length === 0 ? (
            <p className="text-center text-gray-600 text-xs py-8">{chatSearch ? 'No match' : 'No documents received'}</p>
          ) : filteredChats.map(chat => (
            <ChatItem key={chat.phone} chat={chat} selected={selectedChat === chat.phone} onClick={handleSelectChat} unreadCount={unread.get(chat.phone) || 0} pinned={pinnedChats.has(chat.phone)} onPin={togglePin} />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {!activeChat ? (
          <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">Select a customer to view documents</div>
        ) : (
          <>
            <div className="h-14 px-4 flex items-center gap-3 border-b border-white/5 shrink-0">
              <div className="w-9 h-9 rounded-full bg-green-600/20 flex items-center justify-center text-green-400 font-bold text-sm">
                {activeChat.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{activeChat.name}</p>
                <p className="text-[10px] text-gray-500">{activeChat.messages.length} documents</p>
              </div>
              {!selectionMode ? (
                <div className="flex items-center gap-2">
                  <input value={msgSearch} onChange={e => setMsgSearch(e.target.value)} placeholder="🔍 Search" className="w-28 px-2 py-1 bg-[#1a2236] border border-white/10 rounded text-[10px] text-white outline-none placeholder:text-gray-600" />
                  <button onClick={() => { if (activeChat) requestDocs(activeChat.phone); }} className="text-[10px] px-2 py-1 rounded bg-orange-600/20 text-orange-400 hover:bg-orange-600/30">Request Docs</button>
                  <button onClick={() => { if (activeChat) assignChat(activeChat.phone, activeChat.name); }} className="text-[10px] px-2 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30">Assign</button>
                  <button onClick={() => setSelectionMode(true)} className="text-[10px] px-2 py-1 rounded bg-white/5 text-gray-400 hover:text-white">Select</button>
                </div>
              ) : (
                <button onClick={exitSelectionMode} className="text-xs text-gray-400 hover:text-white">Cancel</button>
              )}
            </div>
            <div ref={msgContainerRef} onScroll={() => { const el = msgContainerRef.current; if (el) userScrolledUpRef.current = el.scrollHeight - el.scrollTop - el.clientHeight > 100; }} className="flex-1 overflow-y-auto p-4 space-y-2 pb-20">
              {reversedMessages.map((msg, i) => {
                const msgDate = new Date(msg.timestamp).toLocaleDateString();
                const prevDate = i > 0 ? new Date(reversedMessages[i-1].timestamp).toLocaleDateString() : null;
                const showDate = msgDate !== prevDate;
                const today = new Date().toLocaleDateString();
                const yesterday = new Date(Date.now()-86400000).toLocaleDateString();
                const label = msgDate === today ? 'Today' : msgDate === yesterday ? 'Yesterday' : msgDate;
                return (<>
                  {showDate && <div key={'d-'+i} className="text-center py-2"><span className="text-[10px] bg-white/5 text-gray-500 px-3 py-1 rounded-full">{label}</span></div>}
                  <MessageCard
                    key={msg.id} msg={msg} onClick={handleOpenFile}
                    selectionMode={selectionMode}
                    selected={selectedDocs.has(msg.id)}
                    onToggleSelect={toggleDocSelection}
                  />
                </>);
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Floating action bar when items selected */}
            {selectionMode && selectedDocs.size > 0 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-5 py-3 rounded-full shadow-xl flex items-center gap-3 z-10">
                <span className="text-sm font-medium">{selectedDocs.size} selected</span>
                <button onClick={startBuildProfile}
                  className="px-3 py-1 bg-white text-blue-600 rounded-full text-xs font-bold hover:bg-blue-50">
                  Build Profile →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Customer Picker Modal */}
      {showPicker && (
        <CustomerPicker
          onCancel={() => setShowPicker(false)}
          onConfirm={onPickerConfirm}
          docCount={selectedDocs.size}
        />
      )}

      {/* Extracting overlay */}
      {extracting && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="bg-[#0d1220] rounded-xl p-6 text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-white text-sm">Extracting from {selectedDocs.size} document{selectedDocs.size !== 1 ? 's' : ''}...</p>
          </div>
        </div>
      )}

      {/* Extraction error */}
      {extractError && !extracting && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setExtractError('')}>
          <div className="bg-[#0d1220] border border-red-500/30 rounded-xl p-6 max-w-sm">
            <p className="text-red-400 text-sm mb-3">Extraction failed</p>
            <p className="text-gray-400 text-xs">{extractError}</p>
          </div>
        </div>
      )}

      {/* Extraction confirm modal */}
      {extractedSuggestions && (
        <ExtractionConfirmModal
          suggestions={extractedSuggestions}
          onCancel={() => { setExtractedSuggestions(null); setTargetPersonId(null); }}
          onConfirm={onConfirmExtraction}
        />
      )}

      {/* Document viewer */}
      {viewerFile && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={handleCloseViewer}>
          <button onClick={handleCloseViewer} className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs">✕ Close</button>
          <button onClick={() => { const driveId = viewerFile.fileUrl?.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1]; if (!driveId) return; const w = window.open('', '_blank'); if(!w) return; w.document.write('<p>Loading...</p>'); getCachedBlob(driveId, async () => { const res = await api.get(`/drive/download/${driveId}`, {responseType:'blob'}); return new Blob([res.data], {type: res.headers['content-type']||'application/pdf'}); }).then(blob => { w.location.href = URL.createObjectURL(blob); }).catch(() => { w.document.write('<p>Failed to load file</p>'); }); }} className="absolute top-4 right-28 px-3 py-1.5 rounded-lg bg-green-600/80 text-white text-xs">🖨 Print</button>
          <div onClick={e => e.stopPropagation()} className="max-w-[90vw] max-h-[85vh]">
            {(() => {
              const ext = viewerFile.fileName?.split('.').pop()?.toLowerCase() || '';
              const driveId = viewerFile.fileUrl?.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] || '';
              const imgUrl = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w1200` : viewerFile.fileUrl || '';
              const previewUrl = driveId ? `https://drive.google.com/file/d/${driveId}/preview` : '';
              if (['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) return <img src={imgUrl} className="max-w-full max-h-[85vh] object-contain rounded-lg" />;
              if (['mp4','3gp','mov','avi','webm'].includes(ext)) return previewUrl ? <iframe src={previewUrl} className="w-[80vw] h-[75vh] rounded-lg border-0" /> : null;
              if (ext === 'pdf') return previewUrl ? <iframe src={previewUrl} className="w-[80vw] h-[75vh] rounded-lg border-0" title="PDF" /> : null;
              return <div className="bg-[#1a2236] rounded-xl p-8 text-center"><p className="text-white">{viewerFile.fileName}</p></div>;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerPicker({ onCancel, onConfirm, docCount }: { onCancel: () => void; onConfirm: (personId: string) => void; docCount: number }) {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ phone: '', name: '', relationship: 'self' });
  const [createdInHousehold, setCreatedInHousehold] = useState<string | null>(null);

  useEffect(() => { api.get('/customers/households').then(r => setHouseholds(r.data)); }, []);

  const handleCreatePerson = async (phone: string, name: string, relationship: string) => {
    const r = await api.post('/customers/persons', { phone, name, displayLabel: name, relationship });
    return r.data.id;
  };

  const handleQuickCreate = async () => {
    if (!form.phone || !form.name) return;
    const id = await handleCreatePerson(form.phone, form.name, form.relationship);
    onConfirm(id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} className="bg-[#0d1220] border border-white/10 rounded-xl p-5 max-w-md w-full max-h-[80vh] overflow-y-auto">
        <h3 className="text-base font-bold text-white mb-1">Build profile from {docCount} document{docCount !== 1 ? 's' : ''}</h3>
        <p className="text-xs text-gray-500 mb-4">Select an existing person, or create a new one</p>

        {!showCreate ? (
          <>
            <div className="space-y-3 mb-4">
              {households.map(h => (
                <div key={h.phone}>
                  <p className="text-[10px] text-gray-500 uppercase mb-1 px-1">{h.phone}</p>
                  <div className="space-y-1">
                    {h.persons.map(p => (
                      <button key={p.id} onClick={() => onConfirm(p.id)}
                        className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-blue-600/20 text-sm text-white flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-600/30 flex items-center justify-center text-xs font-bold">{p.name?.[0]}</div>
                        <div className="flex-1">
                          <div className="text-sm">{p.displayLabel || p.name}</div>
                          <div className="text-[10px] text-gray-500 capitalize">{p.relationship}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowCreate(true)} className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">+ Create New Person</button>
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-gray-500 uppercase">Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="9823745234"
                className="w-full mt-1 px-3 py-2 bg-[#1a2236] border border-white/10 rounded-lg text-sm text-white outline-none" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 uppercase">Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-[#1a2236] border border-white/10 rounded-lg text-sm text-white outline-none" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 uppercase">Relationship</label>
              <select value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-[#1a2236] border border-white/10 rounded-lg text-sm text-white outline-none">
                <option value="self">Self</option>
                <option value="spouse">Spouse</option>
                <option value="parent">Parent</option>
                <option value="child">Child</option>
                <option value="sibling">Sibling</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={handleQuickCreate} disabled={!form.phone || !form.name}
                className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50">Create & Use</button>
              <button onClick={() => setShowCreate(false)} className="px-3 py-2 bg-white/5 text-gray-400 rounded-lg text-sm">Back</button>
            </div>
          </div>
        )}

        <button onClick={onCancel} className="w-full mt-3 text-xs text-gray-500 hover:text-white">Cancel</button>
      </div>
    </div>
  );
}

function ExtractionConfirmModal({ suggestions, onCancel, onConfirm }: any) {
  const [accepted, setAccepted] = useState<Record<string, any>>({ ...suggestions });

  const toggle = (key: string) => {
    setAccepted((prev: any) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = suggestions[key];
      return next;
    });
  };
  const updateValue = (key: string, value: string) => {
    setAccepted((prev: any) => ({ ...prev, [key]: { ...prev[key], value, source: 'document_corrected' } }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} className="bg-[#0d1220] border border-blue-500/30 rounded-xl p-5 max-w-lg w-full max-h-[85vh] overflow-y-auto">
        <p className="text-sm font-medium text-blue-400 mb-3">Review extracted fields</p>
        <p className="text-xs text-gray-500 mb-4">Uncheck fields to skip. Edit values inline. Confirm to save with provenance.</p>
        <div className="space-y-2 mb-4">
          {Object.entries(suggestions).map(([k, v]: [string, any]) => (
            <div key={k} className="flex items-center gap-2">
              <input type="checkbox" checked={!!accepted[k]} onChange={() => toggle(k)} className="accent-blue-500" />
              <span className="text-xs text-gray-400 w-24 capitalize shrink-0">{k.replace(/_/g, ' ')}</span>
              <input
                value={accepted[k]?.value || v.value || ''}
                onChange={e => updateValue(k, e.target.value)}
                disabled={!accepted[k]}
                className="flex-1 px-2 py-1 bg-[#1a2236] border border-white/10 rounded text-xs text-white outline-none disabled:opacity-50" />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => onConfirm(accepted)} className="flex-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded">Confirm & Save</button>
          <button onClick={onCancel} className="px-3 py-1.5 bg-white/5 text-gray-400 text-sm rounded">Cancel</button>
        </div>
      </div>
    </div>
  );
}
