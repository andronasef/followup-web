// VAPID config seam (D-01/D-02/D-03, .claude/CLAUDE.md "web-push +
// service worker") -- the owner generates the production keypair
// themselves, off-box, via `npx web-push generate-vapid-keys`; this module
// never generates or handles a real production private key, only reads it
// from env. Mirrors session.ts's fail-loud-on-missing-secret pattern: a
// missing/misconfigured VAPID key must never silently no-op push, and must
// never be mistaken for "just restart and it'll regenerate" -- rotation is
// a break-glass action (D-03), never routine.
import webpush from "web-push";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
  throw new Error(
    "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must all be set -- a missing VAPID " +
      "key must never silently disable push. Generate a keypair with `npx web-push generate-vapid-keys` " +
      "(see .env.example).",
  );
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Re-exported for Plan 02-04's subscribe.ts/send.ts -- importing this module
// both configures VAPID (side effect, above) and provides sendNotification.
export { webpush };
