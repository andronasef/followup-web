// D-14: the page-level twin of the setup route's 404-by-construction
// check. This is a React Server Component `await`, not a client-side
// redirect, so the page itself 404s (via next/navigation's notFound())
// the instant a responder row exists -- not just the POST endpoint.
import { notFound } from "next/navigation";
import { anyResponderExists } from "../../../server/repo/responders.ts";
import { SetupForm } from "./setup-form.tsx";

export const dynamic = "force-dynamic";

export default async function AdminSetupPage() {
  if (await anyResponderExists()) {
    notFound();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-[20px] leading-[1.3] font-semibold text-foreground">
            Create owner account
          </h1>
          <p className="text-[14px] leading-[1.4] text-muted-foreground">
            One-time setup. Paste the SETUP_TOKEN value you configured before deploying.
          </p>
        </div>
        <SetupForm />
      </div>
    </main>
  );
}
