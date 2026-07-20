// LANG-02/LANG-06: persists a manual language/appearance override into the
// signed visitor cookie so it survives a full reload and a new browser
// session on the same device -- not just component state.
import { z } from "zod";
import { requireVisitor, VISITOR_COOKIE_NAME, VISITOR_COOKIE_OPTIONS } from "../../../../server/auth/visitor.ts";
import { signVisitorId } from "../../../../server/auth/session.ts";
import { SUPPORTED_LANGUAGES } from "../../../../server/i18n/detect.ts";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  lang: z.string().optional(),
  appearance: z.enum(["light", "dark", "system"]).optional(),
});

export async function PATCH(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "invalid request body" }, { status: 400 });
  }
  const { lang, appearance } = parsed.data;

  // T-01-16: identity comes exclusively from the caller's own verified
  // cookie -- the body never carries a visitor id, so a caller can only
  // ever change their own preferences.
  if (lang && !(SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
    return Response.json({ error: "unsupported language" }, { status: 400 });
  }

  // requireVisitor() defaults to allowCookieWrite:true (a Route Handler,
  // where that's legal) -- it always resolves or creates a real visitor,
  // so visitorId is never null here.
  const session = await requireVisitor();
  const nextLang = lang ?? session.lang;
  const nextAppearance = appearance ?? session.appearance;

  const signed = await signVisitorId(session.visitorId!, {
    lang: nextLang,
    appearance: nextAppearance,
  });

  const cookieStore = await cookies();
  cookieStore.set(VISITOR_COOKIE_NAME, signed, VISITOR_COOKIE_OPTIONS);

  return Response.json({ lang: nextLang, appearance: nextAppearance }, { status: 200 });
}
