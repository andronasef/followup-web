// Pure in-memory module -- no DB, no pool, so no after() teardown hook is
// needed here (unlike every repo test file).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createPump, type Pump } from "./sse-pump.ts";

interface Row {
  id: number;
  body: string;
}

/** A deferred whose resolution the test controls, so a fetch can be held
 * open long enough for a trigger to land mid-run. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const rows = (...ids: number[]): Row[] => ids.map((id) => ({ id, body: `m${id}` }));

test("createPump: a trigger while a run is in flight does not start a second concurrent run", async () => {
  let concurrent = 0;
  let maxConcurrent = 0;
  let calls = 0;
  const gate = deferred<void>();

  const pump = createPump<Row>({
    sinceId: 0,
    fetchSince: async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      calls++;
      if (calls === 1) await gate.promise;
      concurrent--;
      return calls === 1 ? rows(1) : [];
    },
    emit: () => {},
    onError: (e) => assert.fail(`onError must not fire: ${e}`),
  });

  const running = pump.run();
  pump.trigger();
  pump.trigger();
  gate.resolve();
  await running;

  assert.equal(maxConcurrent, 1, "two drains must never overlap");
});

test("createPump: CR-05 a trigger arriving during the very first (backfill) run is honored by that same run", async () => {
  const emitted: number[] = [];
  const gate = deferred<void>();
  let call = 0;

  const pump: Pump = createPump<Row>({
    sinceId: 0,
    fetchSince: async (sinceId) => {
      call++;
      if (call === 1) {
        // A message commits (and NOTIFY fires) while the backfill query is
        // still in flight -- the exact window the old
        // `gotEventDuringBackfill` boolean dropped events in.
        pump.trigger();
        await gate.promise;
        return rows(1);
      }
      assert.equal(sinceId, 1, "the second pass must resume from the backfill's last emitted id");
      return rows(2);
    },
    emit: (row) => emitted.push(row.id),
    onError: (e) => assert.fail(`onError must not fire: ${e}`),
  });

  const running = pump.run();
  gate.resolve();
  await running;

  assert.deepEqual(emitted, [1, 2], "the mid-backfill event must be delivered by the same run, not deferred");
});

test("createPump: a trigger storm emits strictly ascending ids with no duplicates and a monotonic high-water mark", async () => {
  const emitted: number[] = [];
  const marks: number[] = [];
  const available: Row[] = rows(1, 2, 3, 4, 5, 6);

  const pump: Pump = createPump<Row>({
    sinceId: 0,
    fetchSince: async (sinceId) => {
      const remaining = available.filter((r) => r.id > sinceId);
      // Every fetch that still has work behind it triggers again,
      // mid-flight, several times over -- a NOTIFY storm.
      if (remaining.length > 2) {
        pump.trigger();
        pump.trigger();
      }
      return remaining.slice(0, 2);
    },
    emit: (row) => {
      emitted.push(row.id);
      marks.push(pump.highWaterMark());
    },
    onError: (e) => assert.fail(`onError must not fire: ${e}`),
  });

  await pump.run();

  assert.deepEqual(emitted, [1, 2, 3, 4, 5, 6], "strictly ascending, exactly once each");
  assert.deepEqual(marks, [0, 1, 2, 3, 4, 5], "the mark advances monotonically, one row behind each emit");
  assert.equal(pump.highWaterMark(), 6);
});

test("createPump: CR-04 a rejecting fetcher resolves the run, never rejects, and routes to onError exactly once", async () => {
  const errors: unknown[] = [];
  const pump = createPump<Row>({
    sinceId: 0,
    fetchSince: async () => {
      throw new Error("transient DB error");
    },
    emit: () => assert.fail("nothing may be emitted from a failed fetch"),
    onError: (error) => errors.push(error),
  });

  // If run() rejected, this await would throw and fail the test -- which is
  // exactly the unhandled rejection that killed the Node 24 process when
  // the old routes called this as `void pump()`.
  await pump.run();

  assert.equal(errors.length, 1, "onError must fire exactly once per failed run");
  assert.equal((errors[0] as Error).message, "transient DB error");
});

test("createPump: after a failed run, a later successful trigger resumes from the last SUCCESSFULLY emitted id", async () => {
  const emitted: number[] = [];
  const errors: unknown[] = [];
  const seenSinceIds: number[] = [];
  let call = 0;

  const pump = createPump<Row>({
    sinceId: 0,
    fetchSince: async (sinceId) => {
      call++;
      seenSinceIds.push(sinceId);
      if (call === 1) return rows(1, 2);
      if (call === 2) throw new Error("transient DB error");
      return rows(3);
    },
    emit: (row) => emitted.push(row.id),
    onError: (error) => errors.push(error),
  });

  await pump.run(); // emits 1, 2
  await pump.run(); // fails
  await pump.run(); // emits 3

  assert.deepEqual(emitted, [1, 2, 3], "the failed run must skip nothing");
  assert.equal(errors.length, 1);
  assert.deepEqual(seenSinceIds, [0, 2, 2], "the high-water mark must not advance across a failure");
});

test("createPump: a failed run releases the in-flight flag so the next run is not deadlocked", async () => {
  let call = 0;
  const pump = createPump<Row>({
    sinceId: 0,
    fetchSince: async () => {
      call++;
      if (call === 1) throw new Error("boom");
      return [];
    },
    emit: () => {},
    onError: () => {},
  });

  await pump.run();
  await pump.run();

  assert.equal(call, 2, "the second run must actually execute a fetch");
});
