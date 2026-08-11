/**
 * F-4 / F-5: page rasterisation.
 *
 * Only the guards are unit-tested. Actual rendering needs a real canvas and a
 * running pdf.js worker, neither of which jsdom provides — that path is
 * covered by the browser checks, which assert the exported PNGs are genuine
 * 800x800 images inside a readable zip.
 */
import { describe, expect, it } from "vitest";
import { renderPdfPages } from "./pdf-render";
import { makePdfFile } from "@/test/fixtures";

describe("renderPdfPages input validation", () => {
  it.each([0, -1, 9, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects scale %s before touching pdf.js",
    async (scale) => {
      // Rejecting up front matters: these run before the worker is started, so
      // a bad value cannot leave a worker orphaned.
      await expect(renderPdfPages(await makePdfFile(1), { scale })).rejects.toThrow(
        /scale must be between/i,
      );
    },
  );

  it("accepts scales at the edges of the allowed range", async () => {
    // Not a render — just proof the guard itself lets these through.
    const file = await makePdfFile(1);
    for (const scale of [0.5, 8]) {
      await expect(renderPdfPages(file, { scale })).rejects.not.toThrow(
        /scale must be between/i,
      );
    }
  });
});
