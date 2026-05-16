import type { FastifyInstance } from "fastify";
import { db } from "../db/index.ts";
import {
  projects,
  locales,
  translationFiles,
  translationKeys,
  translations,
  comments,
  users,
} from "../db/schema.ts";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.ts";
import { importLangFiles } from "../lib/importer.ts";

export async function projectRoutes(app: FastifyInstance) {
  // List projects
  app.get("/projects", async () => {
    return db.select().from(projects);
  });

  // Create project (admin only)
  app.post<{
    Body: {
      name: string;
      githubOwner?: string;
      githubRepo?: string;
      themeColors?: Record<string, string>;
    };
  }>("/projects", async (req, reply) => {
    await requireRole(req, reply, "admin");
    const payload = req.user as { id: string };
    const [project] = await db
      .insert(projects)
      .values({ ...req.body, createdBy: payload.id })
      .returning();
    return project;
  });

  // Get project details with locales
  app.get<{ Params: { id: string } }>("/projects/:id", async (req, reply) => {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, req.params.id))
      .limit(1);
    if (!project) return reply.code(404).send({ error: "Not found" });

    const projectLocales = await db
      .select()
      .from(locales)
      .where(eq(locales.projectId, req.params.id));

    return { ...project, locales: projectLocales };
  });

  // List translation files for a project
  app.get<{ Params: { id: string } }>(
    "/projects/:id/files",
    async (req, reply) => {
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, req.params.id))
        .limit(1);
      if (!project) return reply.code(404).send({ error: "Not found" });

      return db
        .select()
        .from(translationFiles)
        .where(eq(translationFiles.projectId, req.params.id));
    }
  );

  // List keys for a file, with optional locale translation
  app.get<{
    Params: { id: string; fileId: string };
    Querystring: { locale?: string };
  }>("/projects/:id/files/:fileId/keys", async (req, reply) => {
    const { fileId } = req.params;
    const { locale } = req.query;

    const keys = await db
      .select()
      .from(translationKeys)
      .where(eq(translationKeys.fileId, fileId));

    if (!locale) return keys;

    // Find the locale record
    const [localeRecord] = await db
      .select()
      .from(locales)
      .where(
        and(
          eq(locales.projectId, req.params.id),
          eq(locales.localeCode, locale)
        )
      )
      .limit(1);

    if (!localeRecord) return keys;

    // Attach translation status per key
    const keyIds = keys.map((k) => k.id);
    if (keyIds.length === 0) return keys;

    const existingTranslations = await db
      .select()
      .from(translations)
      .where(eq(translations.localeId, localeRecord.id));

    const translationMap = new Map(
      existingTranslations.map((t) => [t.keyId, t])
    );

    return keys.map((k) => ({
      ...k,
      translation: translationMap.get(k.id) ?? null,
    }));
  });

  // Add a locale to a project (admin only)
  app.post<{
    Params: { id: string };
    Body: { localeCode: string; displayName: string };
  }>("/projects/:id/locales", async (req, reply) => {
    await requireRole(req, reply, "admin");
    const { localeCode, displayName } = req.body;
    if (!localeCode || !displayName)
      return reply.code(400).send({ error: "localeCode and displayName are required" });

    const [locale] = await db
      .insert(locales)
      .values({ projectId: req.params.id, localeCode, displayName })
      .returning();
    return locale;
  });

  // Submit or update a translation
  app.post<{
    Params: { id: string; keyId: string; locale: string };
    Body: { value: string };
  }>("/projects/:id/keys/:keyId/translations/:locale", async (req, reply) => {
    await requireAuth(req, reply);
    const payload = req.user as { id: string };
    const { keyId, locale, id: projectId } = req.params;
    const { value } = req.body;

    if (typeof value !== "string" || value.trim() === "")
      return reply.code(400).send({ error: "value is required" });

    // Resolve locale record
    const [localeRecord] = await db
      .select()
      .from(locales)
      .where(and(eq(locales.projectId, projectId), eq(locales.localeCode, locale)))
      .limit(1);
    if (!localeRecord) return reply.code(404).send({ error: "Locale not found" });

    const [result] = await db
      .insert(translations)
      .values({
        keyId,
        localeId: localeRecord.id,
        value,
        status: "pending",
        submittedBy: payload.id,
      })
      .onConflictDoUpdate({
        target: [translations.keyId, translations.localeId],
        set: { value, status: "pending", submittedBy: payload.id, submittedAt: new Date() },
      })
      .returning();

    return result;
  });

  // List comments for a key
  app.get<{
    Params: { id: string; keyId: string };
    Querystring: { locale: string };
  }>("/projects/:id/keys/:keyId/comments", async (req, reply) => {
    await requireAuth(req, reply);
    const { keyId, id: projectId } = req.params;
    const { locale } = req.query;

    if (!locale) return reply.code(400).send({ error: "locale query param required" });

    const [localeRecord] = await db
      .select()
      .from(locales)
      .where(and(eq(locales.projectId, projectId), eq(locales.localeCode, locale)))
      .limit(1);
    if (!localeRecord) return reply.code(404).send({ error: "Locale not found" });

    const rows = await db
      .select({
        id: comments.id,
        content: comments.content,
        createdAt: comments.createdAt,
        username: users.username,
        avatarUrl: users.avatarUrl,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(and(eq(comments.keyId, keyId), eq(comments.localeId, localeRecord.id)))
      .orderBy(comments.createdAt);

    return rows;
  });

  // Post a comment
  app.post<{
    Params: { id: string; keyId: string };
    Querystring: { locale: string };
    Body: { content: string };
  }>("/projects/:id/keys/:keyId/comments", async (req, reply) => {
    await requireAuth(req, reply);
    const payload = req.user as { id: string };
    const { keyId, id: projectId } = req.params;
    const { locale } = req.query;

    if (!locale) return reply.code(400).send({ error: "locale query param required" });
    if (!req.body.content?.trim()) return reply.code(400).send({ error: "content is required" });

    const [localeRecord] = await db
      .select()
      .from(locales)
      .where(and(eq(locales.projectId, projectId), eq(locales.localeCode, locale)))
      .limit(1);
    if (!localeRecord) return reply.code(404).send({ error: "Locale not found" });

    const [comment] = await db
      .insert(comments)
      .values({ keyId, localeId: localeRecord.id, userId: payload.id, content: req.body.content.trim() })
      .returning();

    return comment;
  });

  // Import source lang files (admin only)
  app.post<{
    Params: { id: string };
    Body: { langDir: string };
  }>("/projects/:id/import", async (req, reply) => {
    await requireRole(req, reply, "admin");

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, req.params.id))
      .limit(1);
    if (!project) return reply.code(404).send({ error: "Not found" });

    const { langDir } = req.body;
    if (!langDir) return reply.code(400).send({ error: "langDir is required" });

    const result = await importLangFiles(req.params.id, project.sourceLocale, langDir);
    return result;
  });
}
