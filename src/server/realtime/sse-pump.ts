// CR-04/CR-05: the DB-backed SSE pump, extracted verbatim-in-behavior out
// of the two stream route handlers that each carried their own copy.
//
// `next/headers`-free and dependency-free on purpose (pure in-memory state
// plus the injected fetcher) so node:test can drive it directly -- the
// route handlers themselves are unimportable under plain Node.
//
// What the pump is FOR: the DB, not a buffered array of hub event objects,
// is the single source of ordering truth (FOUND-02). Every run re-queries
// rows strictly after the last id it actually emitted, so a live-arrived
// message and a Last-Event-ID backfill can never duplicate or gap each
// other no matter how they interleave.
//
// Two bugs this module exists to close, both present in the duplicated
// copies it replaces:
//
//   CR-04 (availability). The old `pump()` was invoked as `void pump()`
//   from a hub callback. A transient DB error inside since()/sinceAll()
//   therefore became an unhandled promise rejection -- which on Node 24
//   terminates the process, taking down the single replica and every other
//   visitor's stream with it. `run()` here NEVER rejects: the whole drain
//   loop is wrapped, the error is handed to `onError`, and the in-flight
//   flag is released in a `finally`.
//
//   CR-05 (message loss). The old copies gated the hub callback on a
//   `live` flag and recorded anything arriving before it as a single
//   boolean `gotEventDuringBackfill`, consumed by exactly one extra pump
//   afterwards. A message committed while THAT pass was itself running set
//   an already-true flag, which was then discarded -- the message waited
//   for the 4-minute recycle. There is no live/not-live concept here at
//   all: `rerun` is the only handoff, and an in-flight run always loops
//   again to pick up whatever arrived, including during the very first
//   (backfill) run.

export interface PumpOptions<Row extends { id: number }> {
  /** Starting high-water mark -- the client's Last-Event-ID, or 0. */
  sinceId: number;
  /** Fetches every row with id > sinceId, ascending by id. */
  fetchSince: (sinceId: number) => Promise<Row[]>;
  /** Called once per row, in ascending id order, before the mark advances. */
  emit: (row: Row) => void;
  /**
   * Called at most once per failed run. The pump keeps its high-water mark
   * at the last SUCCESSFULLY emitted id, so a later successful trigger
   * resumes from exactly there -- nothing is skipped by a failed run.
   */
  onError: (error: unknown) => void;
}

export interface Pump {
  /** Drains to completion. Resolves -- never rejects -- on every path. */
  run: () => Promise<void>;
  /**
   * Requests a drain. Starts one if idle; otherwise marks the in-flight
   * run to loop again, so an event arriving mid-run (including mid-
   * backfill) is always honored by that run.
   */
  trigger: () => void;
  /** The last id actually emitted. Exposed for assertions/diagnostics. */
  highWaterMark: () => number;
}

export function createPump<Row extends { id: number }>(options: PumpOptions<Row>): Pump {
  const { fetchSince, emit, onError } = options;

  let highWaterMark = options.sinceId;
  let inFlight = false;
  let rerun = false;

  async function run(): Promise<void> {
    if (inFlight) {
      // Single-flight: never two concurrent drains against the same
      // high-water mark (that is how duplicate emits happen). The
      // in-flight run picks this up on its next loop.
      rerun = true;
      return;
    }
    inFlight = true;
    try {
      do {
        rerun = false;
        const rows = await fetchSince(highWaterMark);
        for (const row of rows) {
          emit(row);
          // Advanced per row, not per batch, so a throwing emit still
          // leaves the mark on the last row that genuinely went out.
          highWaterMark = row.id;
        }
      } while (rerun);
    } catch (error) {
      // CR-04: the whole point. Swallowed into onError so no caller can
      // ever produce an unhandled rejection by invoking this as
      // `void run()`.
      onError(error);
    } finally {
      inFlight = false;
      // A failed run must not leave `rerun` set: the next real trigger
      // starts a clean run, and the caller's onError decides what to do
      // about the failure (the stream routes recycle the connection).
      rerun = false;
    }
  }

  return {
    run,
    trigger: () => {
      void run();
    },
    highWaterMark: () => highWaterMark,
  };
}
