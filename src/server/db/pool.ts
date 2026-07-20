// Shared, bounded query pool — every repo module's ordinary queries route
// through this client. This is NOT the LISTEN connection (see listener.ts,
// which is a separate, dedicated `max: 1` client). FOUND-02: a fixed
// connection count, not proportional to visitor/subscriber count — capped
// at `max: 10`, never unbounded.
//
// Imports "./schema.ts" with an explicit extension (rather than the usual
// extensionless Next.js convention) so this module — and everything that
// imports it — can also run standalone under `node --experimental-strip
// -types` (the repo layer's TDD tests, see repo/*.test.ts). Paired with
// `allowImportingTsExtensions` in tsconfig.json. Next's bundler resolves
// explicit ".ts" specifiers just as well as extensionless ones.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

type PostgresSql = ReturnType<typeof postgres>;

// Cache on globalThis so dev's hot-reload doesn't spawn a new pool (and a
// fresh set of connections) on every module re-evaluation.
const globalForPool = globalThis as unknown as { __onechatPool?: PostgresSql };

export const sql: PostgresSql =
  globalForPool.__onechatPool ?? postgres(process.env.DATABASE_URL ?? "", { max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForPool.__onechatPool = sql;
}

export const db = drizzle(sql, { schema });
