import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export const db = drizzle(url, { schema });
export type DB = typeof db;
