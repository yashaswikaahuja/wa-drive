import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export const useWhatsAppStore = create()(persist((set) => ({
    files: [],
    connected: false,
    loading: false,
    error: null,
    setFiles: (files) => set({ files }),
    addFile: (file) => set((s) => ({ files: [file, ...s.files] })),
    removeFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),
    setConnected: (connected) => set({ connected }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
}), {
    name: 'whatsapp-store',
    // Don't persist loading/error states
    partialize: (s) => ({ files: s.files }),
}));
