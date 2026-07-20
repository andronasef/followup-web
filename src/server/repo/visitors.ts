// Visitor identity repo. No column here may ever store a name, email,
// phone number, or raw IP address (ID-05) -- see schema.ts's own header
// note. getOrCreate is the sole write path for the visitors table.
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
