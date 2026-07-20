// Next.js instrumentation hook — boots the dedicated LISTEN connection
// exactly once at process start. Stable in Next 16 (no config flag needed).
//
// register() runs for both the nodejs and edge runtimes; the LISTEN
// connection needs a real TCP socket, so it's guarded to the nodejs runtime
// only. Double-registration across dev's hot-reload cycles is guarded
// inside startListener() itself (globalThis-backed flag).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startListener } = await import("./server/db/listener");
    await startListener();
  }
}
