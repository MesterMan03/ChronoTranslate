import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "./types.ts";

type AuthStore = {
  user: User | null;
  setUser: (user: User | null) => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

// Username cache: accumulated across all API responses so @mention autocomplete works
// without a dedicated users endpoint
type UserCacheEntry = { id: string; username: string; avatarUrl: string | null };

type UserCacheStore = {
  users: UserCacheEntry[];
  addUsers: (entries: UserCacheEntry[]) => void;
};

export const useUserCache = create<UserCacheStore>((set, get) => ({
  users: [],
  addUsers: (entries) => {
    const existing = new Set(get().users.map((u) => u.id));
    const fresh = entries.filter((e) => !existing.has(e.id));
    if (fresh.length > 0) set((s) => ({ users: [...s.users, ...fresh] }));
  },
}));

// Mock values persisted in localStorage per key
type MockStore = {
  mocks: Record<string, string>;
  setMock: (keyId: string, argName: string, value: string) => void;
  getMocks: (keyId: string) => Record<string, string>;
  clearMocks: (keyId: string, argNames: string[]) => void;
};

export const useMockStore = create<MockStore>()(
  persist(
    (set, get) => ({
      mocks: {},
      setMock: (keyId, argName, value) =>
        set((s) => ({
          mocks: { ...s.mocks, [`${keyId}:${argName}`]: value },
        })),
      getMocks: (keyId) => {
        const prefix = `${keyId}:`;
        const result: Record<string, string> = {};
        for (const [k, v] of Object.entries(get().mocks)) {
          if (k.startsWith(prefix)) {
            result[k.slice(prefix.length)] = v;
          }
        }
        return result;
      },
      clearMocks: (keyId, argNames) => {
        const keys = new Set(argNames.map((n) => `${keyId}:${n}`));
        set((s) => {
          const mocks = { ...s.mocks };
          for (const k of keys) delete mocks[k];
          return { mocks };
        });
      },
    }),
    { name: "chronotranslate-mocks" }
  )
);
