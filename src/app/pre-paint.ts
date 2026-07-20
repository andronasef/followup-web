// D-11 backstop + localStorage mirror. Wired into layout.tsx's <head> as a
// raw inline, synchronous <script> tag (via PRE_PAINT_SCRIPT below) so it
// runs before first paint -- never as a deferred/module script.
//
// Two independent jobs, both gated on the `data-cookie-present` attribute
// layout.tsx sets on <html>:
//   1. Cookie WAS present (the normal, correct case): mirror the
//      server-confirmed lang/appearance/visitorId into localStorage.
//      Never invents a value independently (no navigator.language call
//      here) -- always sourced from the server response (D-11: cookie
//      wins on conflict).
//   2. Cookie was ABSENT: this is the only branch allowed to touch
//      document.documentElement's lang/dir -- corrects the guess from a
//      prior localStorage mirror, then fires the one-time bootstrap
//      request that lets a Route Handler (the only place cookies().set()
//      is legal -- see src/server/auth/visitor.ts) actually issue and
//      persist the cookie for the next request.
//
// Theme ('dark' class) resolution is a third, unconditional step: Tailwind
// here is class-only dark mode (`@custom-variant dark (&:is(.dark *))` in
// globals.css, no `prefers-color-scheme` media fallback), so an
// appearance of 'system' can only ever be resolved client-side. Doing it
// here, synchronously, before paint, is not a flash -- it's the only
// place a flash could be prevented at all.
function prePaintAndMirror() {
  try {
    var html = document.documentElement;
    var cookiePresent = html.getAttribute("data-cookie-present") === "1";
    var lang = html.getAttribute("data-visitor-lang") || "en";
    var appearance = html.getAttribute("data-visitor-appearance") || "system";
    var visitorId = html.getAttribute("data-visitor-id") || "";

    if (!cookiePresent) {
      // Backstop: the server had no cookie to render from -- see if a
      // prior localStorage mirror can correct the guess before paint.
      try {
        var storedLang = window.localStorage.getItem("oneChatLang");
        var storedAppearance = window.localStorage.getItem("oneChatAppearance");
        if (storedLang) {
          lang = storedLang;
          html.lang = storedLang;
          html.dir = storedLang === "ar" ? "rtl" : "ltr";
        }
        if (storedAppearance) {
          appearance = storedAppearance;
        }
      } catch (e) {
        // localStorage unavailable (private mode/disabled) -- the
        // server's plain defaults stand; nothing to correct.
      }

      // Make the correction durable: ask the one legal cookie-issuing
      // Route Handler to create + sign + set it for the next request.
      // Fire-and-forget -- a failed bootstrap just means the next page
      // load retries from the same no-cookie state.
      try {
        fetch("/api/visitor/bootstrap", { method: "POST", keepalive: true });
      } catch (e) {
        // Best-effort only.
      }
    } else {
      // Cookie was present and authoritative -- mirror server-confirmed
      // values into localStorage, never anything independently detected.
      try {
        window.localStorage.setItem("oneChatLang", lang);
        window.localStorage.setItem("oneChatAppearance", appearance);
        if (visitorId) {
          window.localStorage.setItem("oneChatVisitorId", visitorId);
        }
      } catch (e) {
        // Private mode/disabled storage -- nothing to mirror into.
      }
    }

    var resolvedDark =
      appearance === "dark" ||
      (appearance === "system" &&
        !!window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    html.classList.toggle("dark", !!resolvedDark);
  } catch (e) {
    // Never let a pre-paint correction crash the actual page render.
  }
}

export const PRE_PAINT_SCRIPT = `(${prePaintAndMirror.toString()})();`;
