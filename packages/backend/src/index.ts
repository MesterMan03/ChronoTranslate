import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { authRoutes } from "./routes/auth.ts";
import { projectRoutes } from "./routes/projects.ts";
import { adminRoutes } from "./routes/admin.ts";

const app = Fastify({ logger: true });

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error("JWT_SECRET is not set");

await app.register(cors, {
  origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
  credentials: true,
});
await app.register(cookie);
await app.register(jwt, {
  secret: jwtSecret,
  cookie: { cookieName: "token", signed: false },
});

// routes
await app.register(authRoutes, { prefix: "/auth" });
await app.register(projectRoutes, { prefix: "/api" });
await app.register(adminRoutes, { prefix: "/api/admin" });

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
