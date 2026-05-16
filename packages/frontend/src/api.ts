import type { Project, TranslationFile, TranslationKey, Translation, User, Comment } from "./types.ts";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  me: () =>
    fetch("/auth/me", { credentials: "include" }).then((r) => {
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

  submitTranslation: (
    projectId: string,
    keyId: string,
    locale: string,
    value: string
  ) =>
    post<Translation>(
      `/projects/${projectId}/keys/${keyId}/translations/${locale}`,
      { value }
    ),

  comments: (projectId: string, keyId: string, locale: string) =>
    get<Comment[]>(
      `/projects/${projectId}/keys/${keyId}/comments?locale=${locale}`
    ),

  postComment: (
    projectId: string,
    keyId: string,
    locale: string,
    content: string
  ) =>
    post<Comment>(
      `/projects/${projectId}/keys/${keyId}/comments?locale=${locale}`,
      { content }
    ),
};
