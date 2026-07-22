// Visitor identity repo. No column here may ever store a name, email,
// phone number, or raw IP address (ID-05) -- see schema.ts's own header
// note. getOrCreate is the sole INSERT path for the visitors table;
// updatePrefs only ever updates an already-existing row.
import { eq } from "drizzle-orm";
import { db } from "../db/pool.ts";
import { visitors } from "../db/schema.ts";

export type Visitor = typeof visitors.$inferSelect;

/**
 * Returns the visitor identified by `visitorId` (touching `last_seen_at`),
 * or inserts a brand-new visitor row (gen_random_uuid()) when no id is
 * given or the given id doesn't exist yet.
 */
export async function getOrCreate(
  visitorId?: string | null,
  lang?: string | null,
  appearance?: string | null,
): Promise<Visitor> {
  if (visitorId) {
    const [existing] = await db
      .update(visitors)
      .set({ lastSeenAt: new Date() })
      .where(eq(visitors.id, visitorId))
      .returning();
    if (existing) return existing;
  }

  const [created] = await db
    .insert(visitors)
    .values({ lang: lang ?? null, appearance: appearance ?? null })
    .returning();
  return created;
}

/**
 * CR-02: persists a MANUAL language/appearance choice onto the visitors
 * row so it outlives the signed cookie. Without this, `lang` stays frozen
 * at whatever Accept-Language guess was recorded at insert time, and every
 * server-side reader of it -- `getVisitorLangFor()` (translate-preview),
 * `getVisitorAndLangFor()` (reply/push) and `handleRecover()` (ID-03
 * cookie recovery) -- serves the wrong language back.
 *
 * Only the arguments actually supplied are written; an
 * `undefined`/`null` argument leaves that column untouched. Returns null
 * (a silent no-op, never an insert) when no visitor matches -- identity is
 * minted exclusively by `getOrCreate`.
 */
export async function updatePrefs(
  visitorId: string,
  lang?: string | null,
  appearance?: string | null,
): Promise<Visitor | null> {
  const set: Partial<typeof visitors.$inferInsert> = { lastSeenAt: new Date() };
  if (lang) set.lang = lang;
  if (appearance) set.appearance = appearance;

  const [row] = await db.update(visitors).set(set).where(eq(visitors.id, visitorId)).returning();
  return row ?? null;
}
