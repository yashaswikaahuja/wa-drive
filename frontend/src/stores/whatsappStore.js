import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export const useWhatsAppStore = create()(persist((set) => ({
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
}), {
    name: 'whatsapp-store',
    // Don't persist loading/error states
    partialize: (_s) => ({ files: [] }), // don't persist files - always load from Drive
}));
