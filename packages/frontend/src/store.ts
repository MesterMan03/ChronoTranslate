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

// Mock values persisted in localStorage per key
type MockStore = {
  mocks: Record<string, string>; // keyed by `${keyId}:${argName}`
  setMock: (keyId: string, argName: string, value: string) => void;
  getMocks: (keyId: string) => Record<string, string>;
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
    }),
    { name: "chronotranslate-mocks" }
  )
);
