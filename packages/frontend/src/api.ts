import type { Project, TranslationFile, TranslationKey, User } from "./types.ts";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  me: () => fetch("/auth/me", { credentials: "include" }).then((r) => {
    if (r.status === 401) return null;
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json() as Promise<User>;
  }),

  projects: () => get<Project[]>("/projects"),

  project: (id: string) => get<Project>(`/projects/${id}`),

  files: (projectId: string) =>
    get<TranslationFile[]>(`/projects/${projectId}/files`),

  keys: (projectId: string, fileId: string, locale?: string) =>
    get<TranslationKey[]>(
      `/projects/${projectId}/files/${fileId}/keys${locale ? `?locale=${locale}` : ""}`
    ),
};
