import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { io, Socket } from 'socket.io-client';
import type { WhatsAppFile } from '../types/whatsapp';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL as string ?? 'http://localhost:3000';

interface WhatsAppState {
  files: WhatsAppFile[];
  connected: boolean;
  loading: boolean;
  error: string | null;
  // Socket is stored outside Zustand state (not serialisable) but managed here.
  setFiles: (files: WhatsAppFile[]) => void;
  addFile: (file: WhatsAppFile) => void;
  removeFile: (id: string) => void;
  setConnected: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  /** Call once on app mount. Idempotent — won't open a second socket. */
  connectSocket: () => void;
  /** Call on app unmount / logout. */
  disconnectSocket: () => void;
}

// Socket lives outside Zustand state so it isn't serialised or diffed.
let _socket: Socket | null = null;

export const useWhatsAppStore = create<WhatsAppState>()(
  persist(
    (set, get) => ({
      files: [],
      connected: false,
      loading: false,
      error: null,
      setFiles: (files) => set({ files: Array.isArray(files) ? files : [] }),
      addFile: (file) => set((s) => ({ files: [file, ...(Array.isArray(s.files) ? s.files : [])] })),
      removeFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),
      setConnected: (connected) => set({ connected }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

      connectSocket: () => {
        // Idempotent — only one socket per app lifetime.
        if (_socket?.connected) return;

        _socket = io(SOCKET_URL, {
          transports: ['websocket'],
          reconnection: true,
          reconnectionDelay: 3000,
          reconnectionDelayMax: 10000,
        });

        // WhatsApp connection state — keeps the dashboard indicator live.
        _socket.on('connection:status', (payload: { connected: boolean; qrCode?: string }) => {
          get().setConnected(payload.connected);
        });

        // New file received from worker — prepend to list without a page refresh.
        _socket.on('new_whatsapp_file', (file: WhatsAppFile) => {
          get().addFile(file);
        });

        // Backend emits these when a profile is saved (PATCH /api/customers/persons/:id
        // or POST /api/customers/persons). Keeps the student list reactive.
        _socket.on('student:updated', (updated: WhatsAppFile) => {
          set((s) => ({
            files: s.files.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)),
          }));
        });

        _socket.on('student:new', (file: WhatsAppFile) => {
          get().addFile(file);
        });
      },

      disconnectSocket: () => {
        _socket?.disconnect();
        _socket = null;
      },
    }),
    {
      name: 'whatsapp-store',
      partialize: (_s) => ({ files: [] }), // don't persist files — always load from Drive
    }
  )
);
