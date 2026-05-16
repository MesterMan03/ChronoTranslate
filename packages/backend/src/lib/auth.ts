import type { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db";
import { users } from "../db/schema.ts";
import { eq } from "drizzle-orm";

export type Role = "translator" | "reviewer" | "admin" | "superadmin";

const ROLE_LEVELS: Record<Role, number> = {
  translator: 0,
  reviewer: 1,
  admin: 2,
  superadmin: 3,
};

export function roleLevel(role: Role): number {
  return ROLE_LEVELS[role] ?? 0;
}

export function httpError(statusCode: number, message: string): Error {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    throw httpError(401, "Unauthorized");
  }
}

export async function requireRole(
  req: FastifyRequest,
  reply: FastifyReply,
  role: Role
) {
  await requireAuth(req, reply);
  const payload = req.user as { id: string };
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.id))
    .limit(1);

  if (!user) throw httpError(401, "Unauthorized");
  if (roleLevel(user.role as Role) < roleLevel(role)) throw httpError(403, "Forbidden");

  return user;
}
