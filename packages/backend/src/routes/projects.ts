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
import { eq, and, count, ne, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.ts";
import { importLangFiles } from "../lib/importer.ts";

async function updateLocaleProgress(localeId: string, projectId: string) {
  const [{ total }] = await db
    .select({ total: count() })
    .from(translationKeys)
    .innerJoin(translationFiles, eq(translationKeys.fileId, translationFiles.id))
    .where(eq(translationFiles.projectId, projectId));

  const [{ approved }] = await db
    .select({ approved: sql<number>`count(distinct ${translations.keyId})` })
    .from(translations)
    .where(and(eq(translations.localeId, localeId), eq(translations.status, "approved")));

  const pct = Number(total) > 0 ? ((Number(approved) / Number(total)) * 100).toFixed(2) : "0.00";
  await db.update(locales).set({ progressPct: pct }).where(eq(locales.id, localeId));
}

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

    const keyIds = keys.map((k) => k.id);
    if (keyIds.length === 0) return keys;

    // Approved translation per key (at most one)
    const approvedRows = await db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.localeId, localeRecord.id),
          eq(translations.status, "approved"),
          inArray(translations.keyId, keyIds)
        )
      );

    // Count of pending suggestions per key
    const pendingCounts = await db
      .select({ keyId: translations.keyId, n: count() })
      .from(translations)
      .where(
        and(
          eq(translations.localeId, localeRecord.id),
          eq(translations.status, "pending"),
          inArray(translations.keyId, keyIds)
        )
      )
      .groupBy(translations.keyId);

    const approvedMap = new Map(approvedRows.map((t) => [t.keyId, t]));
    const pendingMap = new Map(pendingCounts.map((p) => [p.keyId, Number(p.n)]));

    return keys.map((k) => ({
      ...k,
      translation: approvedMap.get(k.id) ?? null,
      pendingCount: pendingMap.get(k.id) ?? 0,
    }));
  });

  // List suggestions (all statuses) for a key+locale
  app.get<{
    Params: { id: string; keyId: string };
    Querystring: { locale: string };
  }>("/projects/:id/keys/:keyId/suggestions", async (req, reply) => {
    const { keyId, id: projectId } = req.params;
    const { locale } = req.query;
    if (!locale) return reply.code(400).send({ error: "locale query param required" });

    const [localeRecord] = await db
      .select()
      .from(locales)
      .where(and(eq(locales.projectId, projectId), eq(locales.localeCode, locale)))
      .limit(1);
    if (!localeRecord) return reply.code(404).send({ error: "Locale not found" });

    return db
      .select({
        id: translations.id,
        value: translations.value,
        status: translations.status,
        submittedAt: translations.submittedAt,
        reviewedAt: translations.reviewedAt,
        submitterName: users.username,
        submitterAvatar: users.avatarUrl,
      })
      .from(translations)
      .leftJoin(users, eq(translations.submittedBy, users.id))
      .where(
        and(
          eq(translations.keyId, keyId),
          eq(translations.localeId, localeRecord.id)
        )
      )
      .orderBy(translations.submittedAt);
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

  // Submit a translation suggestion (one pending per user per key+locale)
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

    const [localeRecord] = await db
      .select()
      .from(locales)
      .where(and(eq(locales.projectId, projectId), eq(locales.localeCode, locale)))
      .limit(1);
    if (!localeRecord) return reply.code(404).send({ error: "Locale not found" });

    // If user already has a pending suggestion for this key, update it
    const [existingPending] = await db
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.keyId, keyId),
          eq(translations.localeId, localeRecord.id),
          eq(translations.submittedBy, payload.id),
          eq(translations.status, "pending")
        )
      )
      .limit(1);

    let result;
    if (existingPending) {
      [result] = await db
        .update(translations)
        .set({ value, submittedAt: new Date() })
        .where(eq(translations.id, existingPending.id))
        .returning();
    } else {
      [result] = await db
        .insert(translations)
        .values({ keyId, localeId: localeRecord.id, value, status: "pending", submittedBy: payload.id })
        .returning();
    }

    await updateLocaleProgress(localeRecord.id, projectId);
    return result;
  });

  // Approve a suggestion by ID (reviewer+)
  app.post<{ Params: { suggestionId: string } }>(
    "/suggestions/:suggestionId/approve",
    async (req, reply) => {
      const actor = await requireRole(req, reply, "reviewer");
      const { suggestionId } = req.params;

      const [suggestion] = await db
        .select()
        .from(translations)
        .where(eq(translations.id, suggestionId))
        .limit(1);
      if (!suggestion) return reply.code(404).send({ error: "Suggestion not found" });
      if (suggestion.status !== "pending")
        return reply.code(400).send({ error: "Only pending suggestions can be approved" });

      // Supersede all other pending/approved rows for the same key+locale
      await db
        .update(translations)
        .set({ status: "superseded" })
        .where(
          and(
            eq(translations.keyId, suggestion.keyId),
            eq(translations.localeId, suggestion.localeId),
            ne(translations.id, suggestionId),
            inArray(translations.status, ["pending", "approved"])
          )
        );

      const [result] = await db
        .update(translations)
        .set({ status: "approved", reviewedBy: actor.id, reviewedAt: new Date() })
        .where(eq(translations.id, suggestionId))
        .returning();

      // Resolve project ID for progress update
      const [keyRecord] = await db
        .select()
        .from(translationKeys)
        .where(eq(translationKeys.id, suggestion.keyId))
        .limit(1);
      const [fileRecord] = await db
        .select()
        .from(translationFiles)
        .where(eq(translationFiles.id, keyRecord.fileId))
        .limit(1);

      await updateLocaleProgress(suggestion.localeId, fileRecord.projectId);
      return result;
    }
  );

  // Reject a suggestion by ID (reviewer+)
  app.post<{ Params: { suggestionId: string } }>(
    "/suggestions/:suggestionId/reject",
    async (req, reply) => {
      const actor = await requireRole(req, reply, "reviewer");
      const { suggestionId } = req.params;

      const [suggestion] = await db
        .select()
        .from(translations)
        .where(eq(translations.id, suggestionId))
        .limit(1);
      if (!suggestion) return reply.code(404).send({ error: "Suggestion not found" });
      if (suggestion.status !== "pending")
        return reply.code(400).send({ error: "Only pending suggestions can be rejected" });

      const [result] = await db
        .update(translations)
        .set({ status: "rejected", reviewedBy: actor.id, reviewedAt: new Date() })
        .where(eq(translations.id, suggestionId))
        .returning();

      const [keyRecord] = await db
        .select()
        .from(translationKeys)
        .where(eq(translationKeys.id, suggestion.keyId))
        .limit(1);
      const [fileRecord] = await db
        .select()
        .from(translationFiles)
        .where(eq(translationFiles.id, keyRecord.fileId))
        .limit(1);

      await updateLocaleProgress(suggestion.localeId, fileRecord.projectId);
      return result;
    }
  );

  // List comments for a key (threaded — flat list with parentId)
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

    return db
      .select({
        id: comments.id,
        parentId: comments.parentId,
        content: comments.content,
        createdAt: comments.createdAt,
        userId: comments.userId,
        username: users.username,
        avatarUrl: users.avatarUrl,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(and(eq(comments.keyId, keyId), eq(comments.localeId, localeRecord.id)))
      .orderBy(comments.createdAt);
  });

  // Post a comment (with optional parentId for threading)
  app.post<{
    Params: { id: string; keyId: string };
    Querystring: { locale: string };
    Body: { content: string; parentId?: string };
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

    const { parentId } = req.body;

    // Validate parentId if provided (must exist in same thread)
    if (parentId) {
      const [parent] = await db
        .select()
        .from(comments)
        .where(
          and(
            eq(comments.id, parentId),
            eq(comments.keyId, keyId),
            eq(comments.localeId, localeRecord.id)
          )
        )
        .limit(1);
      if (!parent) return reply.code(400).send({ error: "Invalid parentId" });
    }

    const [comment] = await db
      .insert(comments)
      .values({
        keyId,
        localeId: localeRecord.id,
        userId: payload.id,
        content: req.body.content.trim(),
        parentId: parentId ?? null,
      })
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

    return importLangFiles(req.params.id, project.sourceLocale, langDir);
  });
}
