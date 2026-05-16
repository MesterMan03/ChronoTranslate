import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
  bigint,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["translator", "reviewer", "admin", "superadmin"]);
export const statusEnum = pgEnum("translation_status", [
  "pending",
  "approved",
  "rejected",
  "superseded",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  discordId: text("discord_id").unique().notNull(),
  username: text("username").notNull(),
  avatarUrl: text("avatar_url"),
  role: roleEnum("role").notNull().default("translator"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type CustomTag = {
  name: string;    // tag name, e.g. "party_prefix"
  display: string; // text shown in preview, e.g. "[Party] "
  color: string;   // hex color, e.g. "#5865F2"
};

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  githubOwner: text("github_owner"),
  githubRepo: text("github_repo"),
  githubAppInstallationId: bigint("github_app_installation_id", {
    mode: "number",
  }),
  sourceLocale: text("source_locale").notNull().default("en"),
  themeColors: jsonb("theme_colors")
    .notNull()
    .$type<Record<string, string>>()
    .default({
      primary: "#0898FC",
      secondary: "#C3B38B",
      highlight: "#55FFFF",
      text_color: "#AAAAAA",
      error_color: "#FF5555",
      dark_color: "#555555",
    }),
  customTags: jsonb("custom_tags")
    .notNull()
    .$type<CustomTag[]>()
    .default([]),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const locales = pgTable("locales", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  localeCode: text("locale_code").notNull(),
  displayName: text("display_name").notNull(),
  progressPct: numeric("progress_pct", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
});

export const translationFiles = pgTable(
  "translation_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
  },
  (t) => [unique("uq_file_per_project").on(t.projectId, t.filePath)]
);

export type DetectedArg = {
  name: string;
  style: "tag" | "brace";
};

export const translationKeys = pgTable(
  "translation_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => translationFiles.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    sourceValue: text("source_value").notNull(),
    isArray: boolean("is_array").notNull().default(false),
    detectedArgs: jsonb("detected_args")
      .notNull()
      .$type<DetectedArg[]>()
      .default([]),
  },
  (t) => [unique("uq_key_per_file").on(t.fileId, t.key)]
);

// No unique constraint — multiple suggestions per (keyId, localeId) are allowed.
// At most one row per (keyId, localeId) should have status='approved' at any time.
export const translations = pgTable("translations", {
  id: uuid("id").primaryKey().defaultRandom(),
  keyId: uuid("key_id")
    .notNull()
    .references(() => translationKeys.id, { onDelete: "cascade" }),
  localeId: uuid("locale_id")
    .notNull()
    .references(() => locales.id, { onDelete: "cascade" }),
  value: text("value").notNull(),
  status: statusEnum("status").notNull().default("pending"),
  submittedBy: uuid("submitted_by").references(() => users.id),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  keyId: uuid("key_id")
    .notNull()
    .references(() => translationKeys.id, { onDelete: "cascade" }),
  localeId: uuid("locale_id")
    .notNull()
    .references(() => locales.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  parentId: uuid("parent_id"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
