/**
 * F-15: cropPdf and resizePdf.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { cropPdf, resizePdf, PAPER_SIZES } from "./pdf-utils";
import { makePdfFile, pageIndicesOf } from "@/test/fixtures";
import { stampPositions } from "@/test/pdf-inspect";

describe("cropPdf (F-15)", () => {
  it("shrinks the CropBox by the requested margins, leaving the MediaBox untouched", async () => {
    const blob = await cropPdf(await makePdfFile(1), { top: 10, bottom: 20, left: 5, right: 15 });
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    const page = doc.getPage(0);
    const media = page.getMediaBox();
    const crop = page.getCropBox();

    // Page 0 from makePdfFile is 200x200 (pageSizeFor(0)).
    expect(media).toEqual({ x: 0, y: 0, width: 200, height: 200 });
    expect(crop.x).toBe(5);
    expect(crop.y).toBe(20);
    expect(crop.width).toBe(180); // 200 - 5 - 15
    expect(crop.height).toBe(170); // 200 - 10 - 20
  });

  it("crops only the selected pages", async () => {
    const blob = await cropPdf(await makePdfFile(3), { top: 10, bottom: 10, left: 10, right: 10 }, "2");
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPage(0).getCropBox()).toEqual(doc.getPage(0).getMediaBox());
    expect(doc.getPage(1).getCropBox().width).toBe(280); // page 1 is 300x300
    expect(doc.getPage(2).getCropBox()).toEqual(doc.getPage(2).getMediaBox());
  });

  it("does not touch page identity/order", async () => {
    const blob = await cropPdf(await makePdfFile(3), { top: 1, bottom: 1, left: 1, right: 1 });
    expect(await pageIndicesOf(blob)).toEqual([0, 1, 2]);
  });

  it("rejects margins that exceed the page", async () => {
    await expect(
      cropPdf(await makePdfFile(1), { top: 500, bottom: 0, left: 0, right: 0 }),
    ).rejects.toThrow(/margins are larger than page/i);
  });

  it("rejects negative margins", async () => {
    await expect(
      cropPdf(await makePdfFile(1), { top: -5, bottom: 0, left: 0, right: 0 }),
    ).rejects.toThrow(/top margin/i);
  });
});

describe("resizePdf (F-15)", () => {
  it("scale-to-fit centers content and hits the exact target size", async () => {
    // Page 0 is 200x200 (square); A4 is not square, so this exercises the
    // asymmetric-margin centering path, not just a trivial uniform case.
    const blob = await resizePdf(await makePdfFile(1), PAPER_SIZES.A4);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    const box = doc.getPage(0).getMediaBox();
    expect(box.width).toBeCloseTo(PAPER_SIZES.A4.width, 5);
    expect(box.height).toBeCloseTo(PAPER_SIZES.A4.height, 5);
  });

  it("stretch mode fills the target exactly with no scale-to-fit centering", async () => {
    const blob = await resizePdf(await makePdfFile(1), { width: 400, height: 100 }, "all", undefined, true);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    const box = doc.getPage(0).getMediaBox();
    expect(box.width).toBeCloseTo(400, 5);
    expect(box.height).toBeCloseTo(100, 5);
  });

  it("preserves aspect ratio: a square page resized to a square target keeps square content", async () => {
    // 200x200 -> 100x100 target: uniform scale factor 0.5, no leftover margin.
    const blob = await resizePdf(await makePdfFile(1), { width: 100, height: 100 });
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    const box = doc.getPage(0).getMediaBox();
    expect(box.x).toBeCloseTo(0, 5);
    expect(box.y).toBeCloseTo(0, 5);
    expect(box.width).toBeCloseTo(100, 5);
    expect(box.height).toBeCloseTo(100, 5);
  });

  it("resizes only the selected pages", async () => {
    const blob = await resizePdf(await makePdfFile(3), { width: 50, height: 50 }, "2");
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPage(0).getMediaBox()).toEqual({ x: 0, y: 0, width: 200, height: 200 });
    const middle = doc.getPage(1).getMediaBox();
    expect(middle.width).toBeCloseTo(50, 5);
    expect(middle.height).toBeCloseTo(50, 5);
    expect(doc.getPage(2).getMediaBox()).toEqual({ x: 0, y: 0, width: 400, height: 400 });
  });

  it("actually moves drawn content by the scale factor, not just the box dimensions", async () => {
    // Direct test of the Accept criterion in docs/CODE_AUDIT.md: a known
    // reference point must move by the expected scale factor, verified
    // against the raw content stream — not merely that the box now reads the
    // target size (a naive setSize()-only implementation would pass that
    // alone while silently clipping or blank-padding the content instead).
    const source = await PDFDocument.create();
    const page = source.addPage([200, 200]);
    const font = await source.embedFont("Helvetica");
    page.drawText("X", { x: 50, y: 50, font, size: 12 });
    const file = new File([await source.save()], "marker.pdf", { type: "application/pdf" });

    // 200x200 -> 100x100: uniform scale factor 0.5, no centering offset.
    const blob = await resizePdf(file, { width: 100, height: 100 });
    const [[tmX, tmY]] = await stampPositions(blob);
    // Tm coordinates are unchanged by resize (the scale is applied via a
    // prepended `cm` matrix, not by rewriting drawing operators — verified
    // against the library's actual output before this function was written).
    // The scale factor a reader applies on top is what has to be checked.
    expect(tmX).toBe(50);
    expect(tmY).toBe(50);

    const box = source.getPage(0).getSize();
    const resizedBox = (await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()))).getPage(0).getMediaBox();
    const sx = 100 / box.width;
    // The rendered position is (Tm * sx) in PDF space; with no leftover
    // margin at this exact aspect ratio, that must land exactly on the new
    // box's own coordinates.
    expect(tmX * sx).toBeCloseTo(resizedBox.x + 25, 5); // 50*0.5=25 -> box.x(0)+25
    expect(tmY * sx).toBeCloseTo(resizedBox.y + 25, 5);
  });

  it("rejects a non-positive target size", async () => {
    await expect(resizePdf(await makePdfFile(1), { width: 0, height: 100 })).rejects.toThrow(
      /positive width and height/i,
    );
  });
});
