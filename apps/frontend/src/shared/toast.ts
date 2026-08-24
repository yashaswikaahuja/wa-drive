import { create } from 'zustand';

interface Toast {
  id: string;
  message: string;
  type: 'error' | 'success' | 'info';
}

interface ToastStore {
  toasts: Toast[];
  add: (message: string, type?: Toast['type']) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (message, type = 'error') => {
    const id = Date.now().toString(36);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  error: (msg: string) => useToastStore.getState().add(msg, 'error'),
  success: (msg: string) => useToastStore.getState().add(msg, 'success'),
  info: (msg: string) => useToastStore.getState().add(msg, 'info'),
};
