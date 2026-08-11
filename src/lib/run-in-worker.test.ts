/**
 * F-9: worker dispatch and its fallback behaviour.
 *
 * jsdom provides no Worker, so the suite exercises the inline fallback by
 * default. These cases drive the dispatch logic directly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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
