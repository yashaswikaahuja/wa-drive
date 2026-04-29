import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  expiresAt: number | null;
  setAccessToken: (token: string | null, expiresAt: number | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      expiresAt: null,
      setAccessToken: (accessToken, expiresAt) => set({ accessToken, expiresAt }),
    }),
    { name: 'auth-store' }
  )
);
