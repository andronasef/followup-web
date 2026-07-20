// Owner account repo (ADMIN-01, D-14). anyResponderExists() backs the
// setup route's 404-by-construction check (01-RESEARCH.md Pattern 5) --
// it must run fresh, straight against the DB, on every call. It is never
// cached in memory, so this holds across a container restart and a fresh
// deploy against an existing DB, not just within one process lifetime.
import { eq } from "drizzle-orm";
import { db, sql } from "../db/pool.ts";
import { responders } from "../db/schema.ts";

export type Responder = typeof responders.$inferSelect;

export async function anyResponderExists(): Promise<boolean> {
  const [row] = await sql<{ exists: boolean }[]>`select exists(select 1 from responders) as exists`;
  return row?.exists ?? false;
}

export async function createResponder(input: {
  email: string;
  passwordHash: string;
  displayName?: string | null;
}): Promise<Responder> {
  const [created] = await db
    .insert(responders)
    .values({
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      displayName: input.displayName ?? null,
    })
    .returning();
  return created;
}

export async function findByEmail(email: string): Promise<Responder | null> {
  const [found] = await db
    .select()
    .from(responders)
    .where(eq(responders.email, email.toLowerCase()))
    .limit(1);
  return found ?? null;
}
