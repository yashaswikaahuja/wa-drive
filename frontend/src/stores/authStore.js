import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export const useAuthStore = create()(persist((set) => ({
    accessToken: null,
    expiresAt: null,
    setAccessToken: (accessToken, expiresAt) => set({ accessToken, expiresAt }),
}), { name: 'auth-store' }));
