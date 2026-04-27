import { create } from "zustand";
import type { User } from "firebase/auth";

interface AuthState {
  user: User | null;
  isInitialized: boolean;
  setUser: (user: User | null) => void;
  clearUser: () => void;
  setInitialized: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isInitialized: false,

  setUser: (user) => set({ user }),

  clearUser: () => set({ user: null }),

  setInitialized: () => set({ isInitialized: true }),
}));