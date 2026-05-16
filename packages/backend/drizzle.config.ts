import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://chronotranslate:chronotranslate@localhost:5432/chronotranslate",
  },
} satisfies Config;
