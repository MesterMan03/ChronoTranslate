export type Role = "translator" | "reviewer" | "admin" | "superadmin";

export type User = {
  id: string;
  discordId: string;
  username: string;
  avatarUrl: string | null;
  role: Role;
  createdAt: string;
};

export type CustomTag = {
  name: string;
  display: string;
  color: string;
};

export type Project = {
  id: string;
  name: string;
  sourceLocale: string;
  themeColors: Record<string, string>;
  customTags: CustomTag[];
  githubOwner: string | null;
  githubRepo: string | null;
  locales?: Locale[];
};

export type Locale = {
  id: string;
  projectId: string;
  localeCode: string;
  displayName: string;
  progressPct: string;
};

export type TranslationFile = {
  id: string;
  projectId: string;
  filePath: string;
};

export type DetectedArg = {
  name: string;
  style: "tag" | "brace";
};

export type TranslationKey = {
  id: string;
  fileId: string;
  key: string;
  sourceValue: string;
  isArray: boolean;
  detectedArgs: DetectedArg[];
  translation?: Translation | null;
  pendingCount?: number;
};

export type Translation = {
  id: string;
  keyId: string;
  localeId: string;
  value: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  submittedAt: string;
};

export type Suggestion = {
  id: string;
  value: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  submittedAt: string;
  reviewedAt: string | null;
  submitterName: string | null;
  submitterAvatar: string | null;
};

export type Comment = {
  id: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
};
