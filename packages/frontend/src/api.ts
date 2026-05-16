import type {
  Project,
  TranslationFile,
  TranslationKey,
  Translation,
  User,
  Comment,
  Role,
  Locale,
  Suggestion,
  CustomTag,
  BannedUser,
} from "./types.ts";

const BASE = "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const hasBody = body !== undefined;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: hasBody ? { "Content-Type": "application/json" } : {},
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export type PendingItem = {
  translationId: string;
  value: string;
  submittedAt: string;
  submitterName: string | null;
  submitterAvatar: string | null;
  keyId: string;
  key: string;
  sourceValue: string;
  isArray: boolean;
  detectedArgs: { name: string; style: "tag" | "brace" }[];
  filePath: string;
  projectId: string;
  projectName: string;
  customTags: CustomTag[];
  localeId: string;
  localeCode: string;
  localeName: string;
};

export type AdminProject = Project & {
  locales: Locale[];
  keyCount: number;
};

export const api = {
  me: () =>
    fetch("/auth/me", { credentials: "include" }).then((r) => {
      if (r.status === 401) return null;
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json() as Promise<User>;
    }),

  projects: () => get<Project[]>("/projects"),
  project: (id: string) => get<Project>(`/projects/${id}`),
  files: (projectId: string) => get<TranslationFile[]>(`/projects/${projectId}/files`),

  keys: (projectId: string, fileId: string, locale?: string) =>
    get<TranslationKey[]>(
      `/projects/${projectId}/files/${fileId}/keys${locale ? `?locale=${locale}` : ""}`
    ),

  suggestions: (projectId: string, keyId: string, locale: string) =>
    get<Suggestion[]>(`/projects/${projectId}/keys/${keyId}/suggestions?locale=${locale}`),

  submitTranslation: (projectId: string, keyId: string, locale: string, value: string) =>
    post<Translation>(`/projects/${projectId}/keys/${keyId}/translations/${locale}`, { value }),

  sourceSuggestions: (projectId: string, keyId: string) =>
    get<Suggestion[]>(`/projects/${projectId}/keys/${keyId}/source-suggestions`),

  submitSourceSuggestion: (projectId: string, keyId: string, value: string) =>
    post<Suggestion>(`/projects/${projectId}/keys/${keyId}/source-suggestions`, { value }),

  approveSourceSuggestion: (suggestionId: string) =>
    post<Suggestion>(`/source-suggestions/${suggestionId}/approve`),

  rejectSourceSuggestion: (suggestionId: string) =>
    post<Suggestion>(`/source-suggestions/${suggestionId}/reject`),

  approveSuggestion: (suggestionId: string) =>
    post<Translation>(`/suggestions/${suggestionId}/approve`),

  rejectSuggestion: (suggestionId: string) =>
    post<Translation>(`/suggestions/${suggestionId}/reject`),

  comments: (projectId: string, keyId: string, locale: string) =>
    get<Comment[]>(`/projects/${projectId}/keys/${keyId}/comments?locale=${locale}`),

  postComment: (projectId: string, keyId: string, locale: string, content: string, parentId?: string) =>
    post<Comment>(
      `/projects/${projectId}/keys/${keyId}/comments?locale=${locale}`,
      { content, ...(parentId ? { parentId } : {}) }
    ),

  // Admin
  adminUsers: () => get<User[]>("/admin/users"),
  setUserRole: (userId: string, role: Role) => patch<User>(`/admin/users/${userId}/role`, { role }),
  adminProjects: () => get<AdminProject[]>("/admin/projects"),

  createProject: (body: {
    name: string;
    sourceLocale?: string;
    githubOwner?: string;
    githubRepo?: string;
  }) => post<Project>("/projects", body),

  addLocale: (projectId: string, localeCode: string, displayName: string) =>
    post<Locale>(`/projects/${projectId}/locales`, { localeCode, displayName }),

  importProject: (projectId: string, langDir: string) =>
    post<{ filesImported: number; keysImported: number; translationsImported: Record<string, number> }>(
      `/projects/${projectId}/import`,
      { langDir }
    ),

  updateProjectTags: (projectId: string, customTags: CustomTag[]) =>
    patch<Project>(`/admin/projects/${projectId}/tags`, { customTags }),

  projectBans: (projectId: string) =>
    get<BannedUser[]>(`/admin/projects/${projectId}/bans`),

  banUser: (projectId: string, userId: string) =>
    post<BannedUser>(`/admin/projects/${projectId}/bans`, { userId }),

  unbanUser: (projectId: string, userId: string) =>
    del<BannedUser>(`/admin/projects/${projectId}/bans/${userId}`),

  // Review queue
  pendingTranslations: (opts?: { projectId?: string; localeCode?: string; offset?: number }) => {
    const params = new URLSearchParams();
    if (opts?.projectId) params.set("projectId", opts.projectId);
    if (opts?.localeCode) params.set("localeCode", opts.localeCode);
    if (opts?.offset) params.set("offset", String(opts.offset));
    const qs = params.toString();
    return get<PendingItem[]>(`/admin/review/pending${qs ? `?${qs}` : ""}`);
  },

  pendingCount: () => get<{ total: number }>("/admin/review/pending/count"),
};
