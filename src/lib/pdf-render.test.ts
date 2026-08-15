/**
 * F-4 / F-5: page rasterisation.
 *
 * Only the guards are unit-tested. Actual rendering needs a real canvas and a
 * running pdf.js worker, neither of which jsdom provides — that path is
 * covered by the browser checks, which assert the exported PNGs are genuine
 * 800x800 images inside a readable zip.
 */
import { describe, expect, it } from "vitest";
import { loadBundledCMap, renderPdfPages } from "./pdf-render";
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

describe("bundled CMap tables", () => {
  it("bundles the predefined CMaps that CJK documents need", async () => {
    const { PACKED_CMAPS } = await import("./pdf-cmaps.generated");
    // Without these a CJK PDF using a predefined encoding renders a blank page
    // while still reporting success — the failure this bundle exists to fix.
    for (const name of ["UniJIS-UCS2-H", "UniGB-UCS2-H", "UniKS-UCS2-H", "UniCNS-UCS2-H"]) {
      expect(PACKED_CMAPS[name], `${name} must be bundled`).toBeTruthy();
    }
    expect(Object.keys(PACKED_CMAPS).length).toBeGreaterThan(100);
  });

  it("inflates a table back to usable bytes", async () => {
    const bytes = await loadBundledCMap("UniJIS-UCS2-H");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(100);
  });

  it("accepts the name with or without the .bcmap extension", async () => {
    // pdf.js asks by bare name; being tolerant costs nothing and avoids a
    // silent miss if that ever changes.
    const bare = await loadBundledCMap("UniJIS-UCS2-H");
    const suffixed = await loadBundledCMap("UniJIS-UCS2-H.bcmap");
    expect(suffixed).toEqual(bare);
  });

  it("names the CMap it could not find, rather than failing vaguely", async () => {
    await expect(loadBundledCMap("Not-A-Real-CMap")).rejects.toThrow(
      /No bundled CMap named "Not-A-Real-CMap"/,
    );
  });
});
