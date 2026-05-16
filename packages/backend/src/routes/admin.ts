import type {FastifyInstance} from "fastify";
import {db} from "../db";
import {
    type CustomTag,
    locales,
    projectBans,
    projects,
    translationFiles,
    translationKeys,
    translations,
    users,
} from "../db/schema.ts";
import {and, count, eq} from "drizzle-orm";
import {httpError, requireRole, type Role, roleLevel} from "../lib/auth.ts";

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

    return await Promise.all(
        allProjects.map(async (p) => {
            const projectLocales = await db
                .select()
                .from(locales)
                .where(eq(locales.projectId, p.id));

            const [{total}] = await db
                .select({total: count()})
                .from(translationKeys)
                .innerJoin(translationFiles, eq(translationKeys.fileId, translationFiles.id))
                .where(eq(translationFiles.projectId, p.id));

            return {...p, locales: projectLocales, keyCount: total};
        })
    );
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

  // List bans for a project
  app.get<{ Params: { id: string } }>("/projects/:id/bans", async (req, reply) => {
    await requireRole(req, reply, "admin");

    return await db
        .select({
            id: projectBans.id,
            userId: users.id,
            username: users.username,
            avatarUrl: users.avatarUrl,
            role: users.role,
            bannedAt: projectBans.bannedAt,
        })
        .from(projectBans)
        .innerJoin(users, eq(projectBans.userId, users.id))
        .where(eq(projectBans.projectId, req.params.id))
        .orderBy(projectBans.bannedAt);
  });

  // Ban a user from a project
  app.post<{
    Params: { id: string };
    Body: { userId: string };
  }>("/projects/:id/bans", async (req, reply) => {
    const actor = await requireRole(req, reply, "admin");
    const { userId } = req.body;
    if (!userId) return reply.code(400).send({ error: "userId is required" });

    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return reply.code(404).send({ error: "User not found" });

    // Admins cannot ban other admins or superadmins
    if (
      roleLevel(actor.role as Role) < roleLevel("superadmin") &&
      roleLevel(target.role as Role) >= roleLevel("admin")
    ) {
      throw httpError(403, "Cannot ban admin-level users");
    }
    if (target.role === "superadmin") throw httpError(403, "Cannot ban superadmin");

    const [ban] = await db
      .insert(projectBans)
      .values({ projectId: req.params.id, userId, bannedBy: actor.id })
      .onConflictDoNothing()
      .returning();

    return ban ?? reply.code(409).send({ error: "Already banned" });
  });

  // Unban a user from a project
  app.delete<{ Params: { id: string; userId: string } }>(
    "/projects/:id/bans/:userId",
    async (req, reply) => {
      await requireRole(req, reply, "admin");

      const [deleted] = await db
        .delete(projectBans)
        .where(
          and(
            eq(projectBans.projectId, req.params.id),
            eq(projectBans.userId, req.params.userId)
          )
        )
        .returning();

      if (!deleted) return reply.code(404).send({ error: "Ban not found" });
      return deleted;
    }
  );

  // Pending translation review queue
  app.get<{
    Querystring: { projectId?: string; localeCode?: string; limit?: string; offset?: string };
  }>("/review/pending", async (req, reply) => {
    await requireRole(req, reply, "reviewer");
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const offset = Number(req.query.offset ?? 0);

    return await db
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
