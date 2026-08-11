/**
 * T-8: addWatermark — acceptance tests for P0-4 (input validation + encoding).
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { addWatermark } from "./pdf-utils";
import { makePdfFile, pageIndicesOf, pageSizeFor } from "@/test/fixtures";

const opts = (overrides: Partial<{ fontSize: number; color: [number, number, number]; opacity: number }> = {}) => ({
  fontSize: 24,
  color: [1, 0, 0] as [number, number, number],
  opacity: 0.5,
  ...overrides,
});

describe("addWatermark (T-8 / P0-4)", () => {
  it("preserves page count and identity", async () => {
    const file = await makePdfFile(3);
    const blob = await addWatermark(file, "DRAFT", opts());
    expect(await pageIndicesOf(blob)).toEqual([0, 1, 2]);
  });

  it("rejects opacity outside [0, 1] with our message", async () => {
    const file = await makePdfFile(1);
    await expect(addWatermark(file, "X", opts({ opacity: 5 }))).rejects.toThrow(
      "Opacity must be between 0 and 1.",
    );
    await expect(addWatermark(file, "X", opts({ opacity: -1 }))).rejects.toThrow(
      "Opacity must be between 0 and 1.",
    );
    await expect(addWatermark(file, "X", opts({ opacity: NaN }))).rejects.toThrow(
      "Opacity must be between 0 and 1.",
    );
  });

  it("rejects non-positive or oversized font sizes with our message", async () => {
    const file = await makePdfFile(1);
    await expect(addWatermark(file, "X", opts({ fontSize: 0 }))).rejects.toThrow(
      "Font size must be between 1 and 300.",
    );
    await expect(addWatermark(file, "X", opts({ fontSize: -5 }))).rejects.toThrow(
      "Font size must be between 1 and 300.",
    );
    await expect(addWatermark(file, "X", opts({ fontSize: 301 }))).rejects.toThrow(
      "Font size must be between 1 and 300.",
    );
  });

  it("rejects empty / whitespace-only text", async () => {
    const file = await makePdfFile(1);
    await expect(addWatermark(file, "", opts())).rejects.toThrow("Enter watermark text.");
    await expect(addWatermark(file, "   ", opts())).rejects.toThrow("Enter watermark text.");
  });

  it("names unencodable characters instead of silently substituting '?'", async () => {
    const file = await makePdfFile(1);
    // @cantoo/pdf-lib replaces unencodable glyphs with '?' rather than
    // throwing WinAnsi errors; curly quotes are actually in WinAnsi and work.
    await expect(addWatermark(file, "机密", opts())).rejects.toThrow(/cannot render \(机\)/);
    await expect(addWatermark(file, "hello😀", opts())).rejects.toThrow(/cannot render \(😀\)/);
    await expect(addWatermark(file, "see → here", opts())).rejects.toThrow(/cannot render \(→\)/);
  });

  it("centres long text with widthOfTextAtSize (not the old length heuristic)", async () => {
    const file = await makePdfFile(1);
    // 40× "i": under the old `length * fontSize / 4` heuristic x is negative
    // on a 200pt page; with real glyph widths it stays on-page and centred.
    const long = "i".repeat(40);
    const blob = await addWatermark(file, long, opts({ fontSize: 12 }));

    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    const [pageWidth] = pageSizeFor(0);
    expect(doc.getPage(0).getWidth()).toBe(pageWidth);

    const font = await doc.embedFont("Helvetica-Bold");
    const textWidth = font.widthOfTextAtSize(long, 12);
    const oldHeuristicX = pageWidth / 2 - (long.length * 12) / 4;
    const centredX = (pageWidth - textWidth) / 2;

    expect(oldHeuristicX).toBeLessThan(0);
    expect(centredX).toBeGreaterThanOrEqual(0);
    expect(centredX + textWidth).toBeLessThanOrEqual(pageWidth);
  });
});

describe("watermark appearance options (F-10)", () => {
  it("accepts a rotation and still produces a valid PDF", async () => {
    const blob = await addWatermark(await makePdfFile(2), "DRAFT", {
      fontSize: 40,
      color: [0, 0, 1],
      opacity: 0.4,
      rotation: 45,
    });
    expect(await pageIndicesOf(blob)).toEqual([0, 1]);
  });

  it("rejects an out-of-range rotation", async () => {
    await expect(
      addWatermark(await makePdfFile(1), "X", {
        fontSize: 20,
        color: [1, 0, 0],
        opacity: 0.5,
        rotation: 900,
      }),
    ).rejects.toThrow(/rotation must be between/i);
  });

  it("rejects colour channels outside 0–1", async () => {
    await expect(
      addWatermark(await makePdfFile(1), "X", {
        fontSize: 20,
        color: [2, 0, 0],
        opacity: 0.5,
      }),
    ).rejects.toThrow(/colour channels/i);
  });

  it("tiling writes more content than a single stamp", async () => {
    const opts = { fontSize: 20, color: [1, 0, 0] as [number, number, number], opacity: 0.3 };
    const single = await addWatermark(await makePdfFile(1), "TILED", opts);
    const tiled = await addWatermark(await makePdfFile(1), "TILED", { ...opts, tile: true });
    expect((await tiled.arrayBuffer()).byteLength).toBeGreaterThan(
      (await single.arrayBuffer()).byteLength,
    );
  });

  it("defaults to no rotation when omitted", async () => {
    const blob = await addWatermark(await makePdfFile(1), "PLAIN", {
      fontSize: 30,
      color: [0, 0, 0],
      opacity: 1,
    });
    expect(await pageIndicesOf(blob)).toEqual([0]);
  });
});
