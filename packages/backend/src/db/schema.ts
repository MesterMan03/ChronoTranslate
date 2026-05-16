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

export const roleEnum = pgEnum("role", ["translator", "reviewer", "admin"]);
export const statusEnum = pgEnum("translation_status", [
  "pending",
  "approved",
  "rejected",
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
      primary: "#5865F2",
      secondary: "#99AAB5",
      highlight: "#FEE75C",
      text_color: "#DCDDDE",
      error_color: "#ED4245",
      dark_color: "#2C2F33",
    }),
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
    // e.g. "ui", "dialogue/mester" — no .json, no locale prefix
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
    // dot-notation key, e.g. "ui.back.title"
    key: text("key").notNull(),
    // newline-joined for array keys, plain string for scalar keys
    sourceValue: text("source_value").notNull(),
    // true when the source value is a JSON array (stored as \n-joined lines)
    isArray: boolean("is_array").notNull().default(false),
    detectedArgs: jsonb("detected_args")
      .notNull()
      .$type<DetectedArg[]>()
      .default([]),
  },
  (t) => [unique("uq_key_per_file").on(t.fileId, t.key)]
);

export const translations = pgTable(
  "translations",
  {
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
  },
  (t) => [unique("uq_translation_per_locale").on(t.keyId, t.localeId)]
);

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
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
