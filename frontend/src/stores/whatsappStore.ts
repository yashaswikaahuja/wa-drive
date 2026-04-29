import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WhatsAppFile } from '../types/whatsapp';

interface WhatsAppState {
  files: WhatsAppFile[];
  connected: boolean;
  loading: boolean;
  error: string | null;
  setFiles: (files: WhatsAppFile[]) => void;
  addFile: (file: WhatsAppFile) => void;
  removeFile: (id: string) => void;
  setConnected: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}

export const useWhatsAppStore = create<WhatsAppState>()(
  persist(
    (set) => ({
      files: [],
      connected: false,
      loading: false,
      error: null,
      setFiles: (files) => set({ files: Array.isArray(files) ? files : [] }),
      addFile: (file) => set((s) => ({ files: [file, ...(Array.isArray(s.files) ? s.files : [])] })),
      removeFile: (id) => set((s) => ({ files: (Array.isArray(s.files) ? s.files : []).filter((f) => f.id !== id) })),
      setConnected: (connected) => set({ connected }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
    }),
    {
      name: 'whatsapp-store',
      // Don't persist loading/error states
      partialize: (s) => ({ files: s.files }),
    }
  )
);
