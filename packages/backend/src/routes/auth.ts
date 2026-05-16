import type { FastifyInstance } from "fastify";
import { db } from "../db/index.ts";
import { users } from "../db/schema.ts";
import { eq, and, ne } from "drizzle-orm";

const DISCORD_API = "https://discord.com/api/v10";

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`${key} is not set`);
  return val;
}

export async function authRoutes(app: FastifyInstance) {
  // Redirect to Discord OAuth
  app.get("/discord", async (_req, reply) => {
    const params = new URLSearchParams({
      client_id: getEnv("DISCORD_CLIENT_ID"),
      redirect_uri: getEnv("DISCORD_REDIRECT_URI"),
      response_type: "code",
      scope: "identify",
    });
    reply.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });

  // Discord OAuth callback
  app.get<{ Querystring: { code?: string; error?: string } }>(
    "/discord/callback",
    async (req, reply) => {
      const { code, error } = req.query;
      if (error || !code) {
        return reply.redirect(
          `${process.env.FRONTEND_URL ?? "http://localhost:5173"}?auth_error=1`
        );
      }

      // Exchange code for access token
      const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: getEnv("DISCORD_CLIENT_ID"),
          client_secret: getEnv("DISCORD_CLIENT_SECRET"),
          grant_type: "authorization_code",
          code,
          redirect_uri: getEnv("DISCORD_REDIRECT_URI"),
        }),
      });

      if (!tokenRes.ok) {
        app.log.error({ body: await tokenRes.text() }, "Discord token exchange failed");
        return reply.redirect(
          `${process.env.FRONTEND_URL ?? "http://localhost:5173"}?auth_error=1`
        );
      }

      const tokenData = (await tokenRes.json()) as { access_token: string };

      // Fetch Discord user info
      const userRes = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        return reply.redirect(
          `${process.env.FRONTEND_URL ?? "http://localhost:5173"}?auth_error=1`
        );
      }

      const discordUser = (await userRes.json()) as {
        id: string;
        username: string;
        avatar: string | null;
      };

      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null;

      // Upsert user (role is not touched here — managed below)
      const [user] = await db
        .insert(users)
        .values({
          discordId: discordUser.id,
          username: discordUser.username,
          avatarUrl,
        })
        .onConflictDoUpdate({
          target: users.discordId,
          set: { username: discordUser.username, avatarUrl },
        })
        .returning();

      // Superadmin assignment: controlled entirely by SUPERADMIN_DISCORD_ID env var
      const superadminDiscordId = process.env.SUPERADMIN_DISCORD_ID;
      const isSuperAdmin = !!superadminDiscordId && discordUser.id === superadminDiscordId;

      if (isSuperAdmin && user.role !== "superadmin") {
        // Promote this user and demote any other superadmin (Discord ID changed)
        await db
          .update(users)
          .set({ role: "admin" })
          .where(and(eq(users.role, "superadmin"), ne(users.id, user.id)));
        await db.update(users).set({ role: "superadmin" }).where(eq(users.id, user.id));
        user.role = "superadmin";
      } else if (!isSuperAdmin && user.role === "superadmin") {
        // This Discord ID is no longer the designated superadmin — demote to admin
        await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
        user.role = "admin";
      }

      const token = app.jwt.sign({ id: user.id });

      reply
        .setCookie("token", token, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        })
        .redirect(process.env.FRONTEND_URL ?? "http://localhost:5173");
    }
  );

  // Current user
  app.get("/me", async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const payload = req.user as { id: string };
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.id))
      .limit(1);

    if (!user) return reply.code(404).send({ error: "User not found" });
    return user;
  });

  const logout = async (_req: unknown, reply: import("fastify").FastifyReply) => {
    reply.clearCookie("token", { path: "/" }).redirect(process.env.FRONTEND_URL ?? "http://localhost:5173");
  };
  app.get("/logout", logout);
  app.post("/logout", logout);
}
