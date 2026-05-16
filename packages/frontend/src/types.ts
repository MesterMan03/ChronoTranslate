export type Role = "translator" | "reviewer" | "admin";

export type User = {
  id: string;
  discordId: string;
  username: string;
  avatarUrl: string | null;
  role: Role;
  createdAt: string;
};

export type Project = {
  id: string;
  name: string;
  sourceLocale: string;
  themeColors: Record<string, string>;
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
};

export type Translation = {
  id: string;
  keyId: string;
  localeId: string;
  value: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: string;
};

export type Comment = {
  id: string;
  content: string;
  createdAt: string;
  username: string;
  avatarUrl: string | null;
};
