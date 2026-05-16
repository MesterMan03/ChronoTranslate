import { migrate } from "drizzle-orm/bun-sql/migrator";
import { db } from "./index.ts";

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied");
process.exit(0);
