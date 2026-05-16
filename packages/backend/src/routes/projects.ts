import type { FastifyInstance } from "fastify";
import { db } from "../db/index.ts";
import {
  projects,
  locales,
  translationFiles,
  translationKeys,
  translations,
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

    const result = await importLangFiles(req.params.id, langDir);
    return result;
  });
}
