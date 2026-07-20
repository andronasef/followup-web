// Runs at container start, before server.js binds a port (FOUND-04).
// See 01-RESEARCH.md Pattern 8. Non-pooled (max: 1) — this connection
// exists only long enough to apply pending migrations, then closes.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const migrationClient = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(migrationClient);

await migrate(db, { migrationsFolder: "./drizzle" });
await migrationClient.end();

console.log("[migrate] done");
