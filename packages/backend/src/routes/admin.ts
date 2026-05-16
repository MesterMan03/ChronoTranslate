import type { FastifyInstance } from "fastify";
import { db } from "../db/index.ts";
import { users } from "../db/schema.ts";
import { eq } from "drizzle-orm";
import { requireRole } from "../lib/auth.ts";

export async function adminRoutes(app: FastifyInstance) {
  app.get("/users", async (req, reply) => {
    await requireRole(req, reply, "admin");
    return db.select().from(users);
  });

  app.patch<{
    Params: { id: string };
    Body: { role: "translator" | "reviewer" | "admin" };
  }>("/users/:id/role", async (req, reply) => {
    await requireRole(req, reply, "admin");
    const [updated] = await db
      .update(users)
      .set({ role: req.body.role })
      .where(eq(users.id, req.params.id))
      .returning();
    if (!updated) return reply.code(404).send({ error: "User not found" });
    return updated;
  });
}
