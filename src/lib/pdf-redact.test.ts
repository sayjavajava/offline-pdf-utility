/**
 * F-16: pdf-redact.ts.
 *
 * `toPixelRect` is the one piece of this feature most likely to have an
 * off-by-a-flip bug (PDF space is bottom-left-origin, canvas space is
 * top-left-origin) — pulled out as a pure function specifically so this can
 * be pinned directly, without needing a real canvas or pdf.js render (that
 * part is covered by the real-browser Playwright check instead, same split
 * as pdf-render.ts's other consumers).
 *
 * `redactPdf` itself reaches pdf.js rendering (`createImageBitmap`, canvas),
 * which is not available under jsdom the way a real browser provides it, so
 * its validation-only paths are what's tested here; the full rasterize
 * pipeline is verified against the real built app instead.
 */
import { describe, expect, it } from "vitest";
import { redactPdf, toPixelRect } from "./pdf-redact";
import { makePdfFile } from "@/test/fixtures";

describe("toPixelRect (F-16)", () => {
  it("flips the y-axis correctly: a box near the PDF-space bottom lands near the image-space bottom", () => {
    // 300pt-tall page; box spans PDF y=50..70 (near the bottom of the page).
    const px = toPixelRect({ x: 50, y: 50, width: 20, height: 20 }, 300, 1);
    // In image space (top-left origin), that should land near the *bottom*
    // of the 300px-tall raster, not the top.
    expect(px).toEqual({ x: 50, y: 230, width: 20, height: 20 });
  });

  it("a box at the PDF-space top lands at the image-space top", () => {
    const px = toPixelRect({ x: 0, y: 280, width: 20, height: 20 }, 300, 1);
    expect(px).toEqual({ x: 0, y: 0, width: 20, height: 20 });
  });

  it("scales proportionally with the render scale", () => {
    const px = toPixelRect({ x: 10, y: 10, width: 5, height: 5 }, 100, 3);
    expect(px).toEqual({ x: 30, y: (100 - 10 - 5) * 3, width: 15, height: 15 });
  });
});

describe("redactPdf validation (F-16)", () => {
  it("rejects an empty redaction map", async () => {
    await expect(redactPdf(await makePdfFile(2), {})).rejects.toThrow(/draw at least one/i);
  });

  it("rejects a redaction map whose pages all have empty rect arrays", async () => {
    await expect(redactPdf(await makePdfFile(2), { 1: [] })).rejects.toThrow(/draw at least one/i);
  });

  it("rejects a page number outside the document", async () => {
    await expect(
      redactPdf(await makePdfFile(2), { 5: [{ x: 0, y: 0, width: 10, height: 10 }] }),
    ).rejects.toThrow(/outside this 2-page/i);
  });

  it("rejects a degenerate (zero-size) redaction box", async () => {
    await expect(
      redactPdf(await makePdfFile(1), { 1: [{ x: 0, y: 0, width: 0, height: 10 }] }),
    ).rejects.toThrow(/invalid redaction box/i);
  });

  it("rejects a negative-size redaction box", async () => {
    await expect(
      redactPdf(await makePdfFile(1), { 1: [{ x: 0, y: 0, width: -5, height: 10 }] }),
    ).rejects.toThrow(/invalid redaction box/i);
  });
});
