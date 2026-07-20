// ADMIN-01: non-enumerating owner login. Whether the email lookup misses
// or the password verification fails, both paths converge on the exact
// same response, constructed in exactly one place -- no branch reveals
// which half was wrong. verifyPassword still runs against a real
// (precomputed, module-scope) Argon2id hash even on an email miss, so a
// timing side-channel cannot distinguish "no such email" from "wrong
// password" by response latency.
import { z } from "zod";
import { cookies } from "next/headers";
import { findByEmail } from "../../../../server/repo/responders.ts";
import { hashPassword, verifyPassword } from "../../../../server/auth/password.ts";
import { signOwnerSession } from "../../../../server/auth/session.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// A real Argon2id hash of a password nobody will ever type, computed once
// at module load. Verified against on an email miss so the verify() call
// always runs with the same algorithm/cost parameters regardless of
// whether the account exists -- constant-shape timing.
const DUMMY_HASH = hashPassword("no-account-will-ever-have-this-password");

function invalidCredentials() {
  return Response.json({ error: "That email or password isn't right." }, { status: 401 });
}

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return invalidCredentials();

  const responder = await findByEmail(parsed.data.email);
  const ok = await verifyPassword(responder?.passwordHash ?? (await DUMMY_HASH), parsed.data.password).catch(
    () => false,
  );

  if (!responder || !ok) return invalidCredentials();

  const token = await signOwnerSession(responder.id);
  const cookieStore = await cookies();
  cookieStore.set("owner_session", token, {
    httpOnly: true,
    secure: true,
    // Strict, not Lax -- there is no cross-site navigation requirement for
    // an admin-only surface. The visitor cookie stays Lax (ID-01) since a
    // shared link is itself a cross-site navigation.
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // matches signOwnerSession's 7-day expiration
  });

  return Response.json({ ok: true });
}
