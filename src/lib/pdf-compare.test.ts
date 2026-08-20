/**
 * T-19: comparePdfs orchestration (F-19) — page alignment, text-diff, and
 * visual-diff threshold logic, against a mocked pdf-render.ts. The real
 * pdf.js rendering and PNG decoding this builds on needs a canvas and a
 * live worker, neither available under jsdom (same constraint as
 * pdf-render.ts/pdf-redact.ts) — covered instead against the real built app.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getPageCount = vi.fn();
const extractPdfText = vi.fn();
const renderPdfPages = vi.fn();
vi.mock("./pdf-render", () => ({
  getPageCount: (...args: unknown[]) => getPageCount(...args),
  extractPdfText: (...args: unknown[]) => extractPdfText(...args),
  renderPdfPages: (...args: unknown[]) => renderPdfPages(...args),
}));

import { comparePdfs } from "./pdf-compare";

/** RGBA pixel buffers, one solid color each — real enough to drive the
 * per-channel-tolerance comparison without needing a real image. */
function solidImageData(width: number, height: number, [r, g, b, a]: [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  }
  return { data, width, height, colorSpace: "srgb" } as ImageData;
}

const fakeFile = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });

let imageDataByCall: ImageData[] = [];

beforeEach(() => {
  getPageCount.mockReset();
  extractPdfText.mockReset();
  renderPdfPages.mockReset();
  imageDataByCall = [];

  // comparePdfs batches: one renderPdfPages/extractPdfText call per file
  // covering every shared page, not one call per page (see pdf-compare.ts —
  // calling per page would reopen the document that many times over, which
  // is what the real benchmark caught). So the mock resolves one entry per
  // requested page number, and fires the onProgress callback the same way
  // the real pdf-render.ts implementations do — once per completed page.
  type ProgressArgs = { pageNumbers: number[]; onProgress?: (done: number, total: number) => void };
  renderPdfPages.mockImplementation(async (_file: File, { pageNumbers, onProgress }: ProgressArgs) =>
    pageNumbers.map((pageNumber, i) => {
      onProgress?.(i + 1, pageNumbers.length);
      return { pageNumber, bytes: new Uint8Array([0]), width: 100, height: 100 };
    }),
  );
  extractPdfText.mockImplementation(async (_file: File, { pageNumbers, onProgress }: ProgressArgs) =>
    pageNumbers.map((pageNumber, i) => {
      onProgress?.(i + 1, pageNumbers.length);
      return { pageNumber, text: "same text" };
    }),
  );

  // @ts-expect-error -- not implemented by jsdom; stubbed for this test only
  global.createImageBitmap = vi.fn(async () => ({ width: 100, height: 100, close: () => {} }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: () => {},
    getImageData: () => imageDataByCall.shift() ?? solidImageData(100, 100, [255, 255, 255, 255]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

describe("comparePdfs (F-19)", () => {
  it("reports identical pages as no differences", async () => {
    getPageCount.mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    imageDataByCall = [
      solidImageData(100, 100, [255, 255, 255, 255]), solidImageData(100, 100, [255, 255, 255, 255]),
      solidImageData(100, 100, [255, 255, 255, 255]), solidImageData(100, 100, [255, 255, 255, 255]),
    ];

    const result = await comparePdfs(fakeFile("a.pdf"), fakeFile("b.pdf"));
    expect(result.pageCountA).toBe(2);
    expect(result.pageCountB).toBe(2);
    expect(result.pages).toHaveLength(2);
    for (const p of result.pages) {
      expect(p.presence).toBe("both");
      if (p.presence === "both") {
        expect(p.textDiffers).toBe(false);
        expect(p.visuallyDiffers).toBe(false);
        expect(p.pixelDiffRatio).toBe(0);
      }
    }
  });

  it("detects a text difference independently of a visual difference", async () => {
    getPageCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    extractPdfText
      .mockImplementationOnce(async () => [{ pageNumber: 1, text: "version one" }])
      .mockImplementationOnce(async () => [{ pageNumber: 1, text: "version two" }]);
    imageDataByCall = [
      solidImageData(100, 100, [255, 255, 255, 255]), solidImageData(100, 100, [255, 255, 255, 255]),
    ];

    const result = await comparePdfs(fakeFile("a.pdf"), fakeFile("b.pdf"));
    const [page] = result.pages;
    expect(page.presence).toBe("both");
    if (page.presence === "both") {
      expect(page.textDiffers).toBe(true);
      expect(page.visuallyDiffers).toBe(false);
    }
  });

  it("normalizes whitespace before comparing text, so re-flowed spacing isn't a false positive", async () => {
    getPageCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    extractPdfText
      .mockImplementationOnce(async () => [{ pageNumber: 1, text: "  Line one  \n  Line two\n" }])
      .mockImplementationOnce(async () => [{ pageNumber: 1, text: "Line one\nLine two" }]);
    imageDataByCall = [
      solidImageData(100, 100, [255, 255, 255, 255]), solidImageData(100, 100, [255, 255, 255, 255]),
    ];

    const result = await comparePdfs(fakeFile("a.pdf"), fakeFile("b.pdf"));
    const [page] = result.pages;
    if (page.presence === "both") expect(page.textDiffers).toBe(false);
  });

  it("detects a visual difference beyond the noise tolerance", async () => {
    getPageCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    imageDataByCall = [
      solidImageData(100, 100, [255, 255, 255, 255]), // A: white
      solidImageData(100, 100, [0, 0, 0, 255]), // B: black — a real difference
    ];

    const result = await comparePdfs(fakeFile("a.pdf"), fakeFile("b.pdf"));
    const [page] = result.pages;
    if (page.presence === "both") {
      expect(page.visuallyDiffers).toBe(true);
      expect(page.pixelDiffRatio).toBe(1);
    }
  });

  it("does not flag a tiny amount of per-channel noise as a real visual difference", async () => {
    getPageCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    imageDataByCall = [
      solidImageData(100, 100, [200, 200, 200, 255]),
      solidImageData(100, 100, [205, 205, 205, 255]), // within PER_CHANNEL_TOLERANCE
    ];

    const result = await comparePdfs(fakeFile("a.pdf"), fakeFile("b.pdf"));
    const [page] = result.pages;
    if (page.presence === "both") expect(page.visuallyDiffers).toBe(false);
  });

  it("flags differently-sized pages as visually different without a pixel ratio, and leaves text unevaluated", async () => {
    getPageCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    renderPdfPages
      .mockImplementationOnce(async () => [{ pageNumber: 1, bytes: new Uint8Array([0]), width: 100, height: 100 }])
      .mockImplementationOnce(async () => [{ pageNumber: 1, bytes: new Uint8Array([0]), width: 200, height: 150 }]);

    const result = await comparePdfs(fakeFile("a.pdf"), fakeFile("b.pdf"));
    const [page] = result.pages;
    if (page.presence === "both") {
      expect(page.visuallyDiffers).toBe(true);
      expect(page.pixelDiffRatio).toBeUndefined();
      expect(page.textDiffers).toBeUndefined();
    }
  });

  it("does not report a text difference for a resized page even when its extracted text is genuinely shorter (P0: pdf.js clips text extraction to a page's MediaBox — a resized page can extract truncated with the underlying wording unchanged; reporting that as a text change would be a false positive)", async () => {
    getPageCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    extractPdfText
      .mockImplementationOnce(async () => [{ pageNumber: 1, text: "The quick brown fox jumps over the lazy dog." }])
      .mockImplementationOnce(async () => [{ pageNumber: 1, text: "The quick bro" }]); // clipped by a smaller page, same content
    renderPdfPages
      .mockImplementationOnce(async () => [{ pageNumber: 1, bytes: new Uint8Array([0]), width: 400, height: 500 }])
      .mockImplementationOnce(async () => [{ pageNumber: 1, bytes: new Uint8Array([0]), width: 200, height: 250 }]);

    const result = await comparePdfs(fakeFile("a.pdf"), fakeFile("b.pdf"));
    const [page] = result.pages;
    if (page.presence === "both") {
      expect(page.textDiffers).toBeUndefined();
      expect(page.visuallyDiffers).toBe(true); // the real, reportable difference is the size change
    }
  });

  it("aligns by page number when A has more pages than B, flagging the trailing pages onlyInA", async () => {
    getPageCount.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    imageDataByCall = [
      solidImageData(100, 100, [255, 255, 255, 255]), solidImageData(100, 100, [255, 255, 255, 255]),
    ];

    const result = await comparePdfs(fakeFile("a.pdf"), fakeFile("b.pdf"));
    expect(result.pages.map((p) => [p.page, p.presence])).toEqual([
      [1, "both"],
      [2, "onlyInA"],
      [3, "onlyInA"],
    ]);
  });

  it("aligns by page number when B has more pages than A, flagging the trailing pages onlyInB", async () => {
    getPageCount.mockResolvedValueOnce(1).mockResolvedValueOnce(3);
    imageDataByCall = [
      solidImageData(100, 100, [255, 255, 255, 255]), solidImageData(100, 100, [255, 255, 255, 255]),
    ];

    const result = await comparePdfs(fakeFile("a.pdf"), fakeFile("b.pdf"));
    expect(result.pages.map((p) => [p.page, p.presence])).toEqual([
      [1, "both"],
      [2, "onlyInB"],
      [3, "onlyInB"],
    ]);
  });

  it("passes each file's own password through to every underlying call", async () => {
    getPageCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    imageDataByCall = [
      solidImageData(100, 100, [255, 255, 255, 255]), solidImageData(100, 100, [255, 255, 255, 255]),
    ];

    await comparePdfs(fakeFile("a.pdf"), fakeFile("b.pdf"), { passwordA: "pa", passwordB: "pb" });
    expect(getPageCount).toHaveBeenCalledWith(expect.anything(), "pa");
    expect(getPageCount).toHaveBeenCalledWith(expect.anything(), "pb");
    expect(extractPdfText).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ password: "pa" }));
    expect(extractPdfText).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ password: "pb" }));
  });

  it("reports progress across every page and stream as batched work completes", async () => {
    // 2 shared pages × 4 streams (text A/B, render A/B) = 8 steps total —
    // comparePdfs folds every stream into one shared counter so the UI moves
    // smoothly instead of jumping from 0 straight to 100% once each of the
    // (now-batched) calls resolves.
    getPageCount.mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    imageDataByCall = [
      solidImageData(100, 100, [255, 255, 255, 255]), solidImageData(100, 100, [255, 255, 255, 255]),
      solidImageData(100, 100, [255, 255, 255, 255]), solidImageData(100, 100, [255, 255, 255, 255]),
    ];
    const onProgress = vi.fn();
    await comparePdfs(fakeFile("a.pdf"), fakeFile("b.pdf"), { onProgress });
    expect(onProgress).toHaveBeenCalledWith(1, 8);
    expect(onProgress).toHaveBeenCalledWith(8, 8);
    expect(onProgress).toHaveBeenCalledTimes(8);
  });

  it("batches into one call per file per signal rather than one call per page", async () => {
    // The actual fix for the real perf issue the benchmark surfaced: each of
    // renderPdfPages/extractPdfText opens the document fresh per call, so
    // calling them per page reopens the whole PDF that many times over.
    getPageCount.mockResolvedValueOnce(5).mockResolvedValueOnce(5);
    imageDataByCall = Array.from({ length: 10 }, () => solidImageData(100, 100, [255, 255, 255, 255]));
    await comparePdfs(fakeFile("a.pdf"), fakeFile("b.pdf"));
    expect(extractPdfText).toHaveBeenCalledTimes(2);
    expect(renderPdfPages).toHaveBeenCalledTimes(2);
    expect(extractPdfText.mock.calls[0][1]).toMatchObject({ pageNumbers: [1, 2, 3, 4, 5] });
  });
});
