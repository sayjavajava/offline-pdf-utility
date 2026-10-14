/**
 * F-9: worker dispatch and its fallback behaviour.
 *
 * jsdom provides no Worker, so the suite exercises the inline fallback by
 * default. These cases drive the dispatch logic directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { splitPdf } from "./pdf-utils";
import { makePdfFile, pageIndicesOf } from "@/test/fixtures";

describe("worker fallback", () => {
  beforeEach(async () => {
    const { resetWorkerForTests } = await import("./run-in-worker");
    resetWorkerForTests();
  });

  it("produces correct output with no Worker available", async () => {
    // The environment the tests actually run in: everything must still work.
    expect(typeof Worker).toBe("undefined");
    const blob = await splitPdf(await makePdfFile(4), "3,1");
    expect(await pageIndicesOf(blob)).toEqual([2, 0]);
  });

  it("still surfaces genuine operation errors rather than swallowing them", async () => {
    await expect(splitPdf(await makePdfFile(2), "99")).rejects.toThrow(
      /outside this 2-page document/,
    );
  });

  it("reports workers unavailable when the global is missing", async () => {
    const { workerAvailable } = await import("./run-in-worker");
    expect(workerAvailable()).toBe(false);
  });

  it("marks transport failures distinctly from operation failures", async () => {
    const { runInWorker } = await import("./run-in-worker");
    const error = await runInWorker("splitPdf", []).catch((e) => e);
    // The flag is what tells the caller it is safe to retry on the main
    // thread; without it a real failure would be silently re-run.
    expect((error as { workerTransportFailure?: boolean }).workerTransportFailure).toBe(true);
  });

  it("falls back when the worker global exists but construction fails", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          throw new Error("blocked");
        }
      },
    );
    const { resetWorkerForTests } = await import("./run-in-worker");
    resetWorkerForTests();

    // Must still produce a correct document rather than propagating "blocked".
    const blob = await splitPdf(await makePdfFile(3), "2");
    expect(await pageIndicesOf(blob)).toEqual([1]);

    vi.unstubAllGlobals();
  });
});

/**
 * The protocol itself, with a stand-in Worker the test can answer for:
 * replies are matched to requests by id, an operation's own failure is kept
 * distinct from a transport failure (only the latter may be retried inline),
 * and a worker that dies takes every waiting call down with it instead of
 * leaving them pending forever.
 */
describe("worker protocol", () => {
  type Sent = { id: number; op: string; args: unknown[] };

  class FakeWorker {
    static last: FakeWorker | null = null;
    static constructed = 0;
    sent: Sent[] = [];
    terminated = false;
    throwOnPost: Error | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;
    constructor() {
      FakeWorker.last = this;
      FakeWorker.constructed++;
    }
    postMessage(message: Sent) {
      if (this.throwOnPost) throw this.throwOnPost;
      this.sent.push(message);
    }
    terminate() {
      this.terminated = true;
    }
    reply(data: unknown) {
      this.onmessage?.({ data });
    }
  }

  const transportFlag = (error: unknown) => (error as { workerTransportFailure?: boolean }).workerTransportFailure;

  beforeEach(async () => {
    FakeWorker.last = null;
    FakeWorker.constructed = 0;
    vi.stubGlobal("Worker", FakeWorker);
    const { resetWorkerForTests } = await import("./run-in-worker");
    resetWorkerForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves each call with the reply carrying its own id, whatever order replies arrive in", async () => {
    const { runInWorker } = await import("./run-in-worker");
    const first = runInWorker("splitPdf", ["a"]);
    const second = runInWorker("mergePdfs", ["b"]);
    const worker = FakeWorker.last!;
    const [one, two] = worker.sent;
    expect([one.op, two.op]).toEqual(["splitPdf", "mergePdfs"]);

    worker.reply({ id: two.id, ok: true, result: "second" });
    worker.reply({ id: one.id, ok: true, result: "first" });
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
  });

  it("reuses one worker across calls", async () => {
    const { runInWorker } = await import("./run-in-worker");
    void runInWorker("a", []);
    void runInWorker("b", []);
    expect(FakeWorker.constructed).toBe(1);
  });

  it("rejects with the operation's own message, not marked as a transport failure", async () => {
    // An operation that genuinely failed must not be re-run on the main thread.
    const { runInWorker } = await import("./run-in-worker");
    const call = runInWorker("splitPdf", []);
    const worker = FakeWorker.last!;
    worker.reply({ id: worker.sent[0].id, ok: false, message: "Page 9 is outside this 2-page document." });
    const error = await call.catch((e) => e);
    expect(error.message).toBe("Page 9 is outside this 2-page document.");
    expect(transportFlag(error)).toBeUndefined();
  });

  it("ignores a reply for an id nobody is waiting on", async () => {
    const { runInWorker } = await import("./run-in-worker");
    const call = runInWorker("splitPdf", []);
    const worker = FakeWorker.last!;
    expect(() => worker.reply({ id: 999, ok: true, result: "stray" })).not.toThrow();
    expect(() => worker.reply(undefined)).not.toThrow();
    worker.reply({ id: worker.sent[0].id, ok: true, result: "real" });
    await expect(call).resolves.toBe("real");
  });

  for (const [label, fire] of [
    ["crashes", (w: FakeWorker) => w.onerror?.()],
    ["sends an unreadable message", (w: FakeWorker) => w.onmessageerror?.()],
  ] as const) {
    it(`fails every waiting call as a transport failure when the worker ${label}, then stops using it`, async () => {
      const { runInWorker, workerAvailable } = await import("./run-in-worker");
      const calls = [runInWorker("a", []), runInWorker("b", [])].map((p) => p.catch((e) => e));
      const worker = FakeWorker.last!;
      fire(worker);

      for (const error of await Promise.all(calls)) expect(transportFlag(error)).toBe(true);
      expect(worker.terminated).toBe(true);
      expect(workerAvailable()).toBe(false);
      // Later calls go straight to the inline fallback rather than a new worker.
      expect(transportFlag(await runInWorker("c", []).catch((e) => e))).toBe(true);
      expect(FakeWorker.constructed).toBe(1);
    });
  }

  it("treats an argument the worker can't receive as a transport failure", async () => {
    const { runInWorker } = await import("./run-in-worker");
    void runInWorker("warmup", []);
    const worker = FakeWorker.last!;
    worker.throwOnPost = new DOMException("could not be cloned", "DataCloneError");

    const error = await runInWorker("splitPdf", [() => {}]).catch((e) => e);
    expect(transportFlag(error)).toBe(true);
    // The worker itself is still fine for the next call.
    worker.throwOnPost = null;
    const next = runInWorker("splitPdf", []);
    worker.reply({ id: worker.sent.at(-1)!.id, ok: true, result: "ok" });
    await expect(next).resolves.toBe("ok");
  });
});
