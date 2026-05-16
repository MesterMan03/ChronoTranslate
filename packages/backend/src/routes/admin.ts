import type { FastifyInstance } from "fastify";
import { db } from "../db/index.ts";
import {
  users,
  projects,
  locales,
  translationFiles,
  translationKeys,
  translations,
  type CustomTag,
} from "../db/schema.ts";
import { eq, and, count } from "drizzle-orm";
import { requireRole, roleLevel, httpError, type Role } from "../lib/auth.ts";

export async function adminRoutes(app: FastifyInstance) {
  // List all users
  app.get("/users", async (req, reply) => {
    await requireRole(req, reply, "admin");
    return db.select().from(users).orderBy(users.createdAt);
  });

  // Change a user's role
  app.patch<{
    Params: { id: string };
    Body: { role: Role };
  }>("/users/:id/role", async (req, reply) => {
    const actor = await requireRole(req, reply, "admin");
    const { role: newRole } = req.body;

    const validRoles: Role[] = ["translator", "reviewer", "admin", "superadmin"];
    if (!validRoles.includes(newRole))
      return reply.code(400).send({ error: "Invalid role" });

    // Nobody can assign or retain the superadmin role via API
    if (newRole === "superadmin")
      throw httpError(403, "Cannot assign superadmin role via API");

    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.params.id))
      .limit(1);
    if (!target) return reply.code(404).send({ error: "User not found" });

    // Nobody can modify a superadmin
    if (target.role === "superadmin")
      throw httpError(403, "Cannot modify superadmin");

    // Admin can only assign up to reviewer; superadmin can assign up to admin
    if (
      roleLevel(actor.role as Role) < roleLevel("superadmin") &&
      roleLevel(newRole) >= roleLevel("admin")
    ) {
      throw httpError(403, "Only superadmin can assign the admin role");
    }

    const [updated] = await db
      .update(users)
      .set({ role: newRole })
      .where(eq(users.id, req.params.id))
      .returning();
    return updated;
  });

  // List projects with locale progress stats
  app.get("/projects", async (req, reply) => {
    await requireRole(req, reply, "admin");

    const allProjects = await db.select().from(projects).orderBy(projects.createdAt);

    const result = await Promise.all(
      allProjects.map(async (p) => {
        const projectLocales = await db
          .select()
          .from(locales)
          .where(eq(locales.projectId, p.id));

        const [{ total }] = await db
          .select({ total: count() })
          .from(translationKeys)
          .innerJoin(translationFiles, eq(translationKeys.fileId, translationFiles.id))
          .where(eq(translationFiles.projectId, p.id));

        return { ...p, locales: projectLocales, keyCount: total };
      })
    );

    return result;
  });

  // Update project custom tags (admin+)
  app.patch<{
    Params: { id: string };
    Body: { customTags: CustomTag[] };
  }>("/projects/:id/tags", async (req, reply) => {
    await requireRole(req, reply, "admin");
    const { customTags } = req.body;
    if (!Array.isArray(customTags)) return reply.code(400).send({ error: "customTags must be an array" });

    const [updated] = await db
      .update(projects)
      .set({ customTags })
      .where(eq(projects.id, req.params.id))
      .returning();
    if (!updated) return reply.code(404).send({ error: "Project not found" });
    return updated;
  });

  // Pending translation review queue
  app.get<{
    Querystring: { projectId?: string; localeCode?: string; limit?: string; offset?: string };
  }>("/review/pending", async (req, reply) => {
    await requireRole(req, reply, "reviewer");
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const offset = Number(req.query.offset ?? 0);

    const rows = await db
      .select({
        translationId: translations.id,
        value: translations.value,
        submittedAt: translations.submittedAt,
        submitterName: users.username,
        submitterAvatar: users.avatarUrl,
        keyId: translationKeys.id,
        key: translationKeys.key,
        sourceValue: translationKeys.sourceValue,
        isArray: translationKeys.isArray,
        detectedArgs: translationKeys.detectedArgs,
        filePath: translationFiles.filePath,
        projectId: projects.id,
        projectName: projects.name,
        themeColors: projects.themeColors,
        customTags: projects.customTags,
        localeId: locales.id,
        localeCode: locales.localeCode,
        localeName: locales.displayName,
      })
      .from(translations)
      .innerJoin(translationKeys, eq(translations.keyId, translationKeys.id))
      .innerJoin(translationFiles, eq(translationKeys.fileId, translationFiles.id))
      .innerJoin(projects, eq(translationFiles.projectId, projects.id))
      .innerJoin(locales, eq(translations.localeId, locales.id))
      .leftJoin(users, eq(translations.submittedBy, users.id))
      .where(
        and(
          eq(translations.status, "pending"),
          req.query.projectId ? eq(projects.id, req.query.projectId) : undefined,
          req.query.localeCode ? eq(locales.localeCode, req.query.localeCode) : undefined
        )
      )
      .orderBy(translations.submittedAt)
      .limit(limit)
      .offset(offset);

    return rows;
  });

  // Count of pending translations (for badge)
  app.get("/review/pending/count", async (req, reply) => {
    await requireRole(req, reply, "reviewer");
    const [{ total }] = await db
      .select({ total: count() })
      .from(translations)
      .where(eq(translations.status, "pending"));
    return { total };
  });
}
