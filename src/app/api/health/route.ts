import postgres from "postgres";

// force-dynamic is load-bearing: without it Next may treat this route as
// ISR and buffer/cache the response, turning a liveness probe into a stale
// cached 200. This is the Coolify healthcheck target — keep it out of any
// auth proxy matcher (see .claude/CLAUDE.md).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });

export async function GET() {
  try {
    // Real liveness check — a hardcoded 200 would lie to Coolify's
    // healthcheck about whether the app can actually reach Postgres.
    await sql`select 1`;
    return Response.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    // Never leak connection strings or stack traces in the response body
    // (T-01-01) — log server-side only, return a bare status.
    console.error("[health] database check failed", error);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
