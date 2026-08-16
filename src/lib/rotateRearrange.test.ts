/**
 * F-2 / F-3: rotatePdf and rearrangePdf.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "@cantoo/pdf-lib";
import { rearrangePdf, rotatePdf } from "./pdf-utils";
import { makePdfFile, pageIndicesOf } from "@/test/fixtures";

describe("rotatePdf (F-2)", () => {
  it("rotates all pages by 90°", async () => {
    const blob = await rotatePdf(await makePdfFile(2), 90);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    expect(doc.getPage(1).getRotation().angle).toBe(90);
    expect(await pageIndicesOf(blob)).toEqual([0, 1]);
  });

  it("rotates only the selected pages", async () => {
    const blob = await rotatePdf(await makePdfFile(3), 180, "2");
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPage(0).getRotation().angle).toBe(0);
    expect(doc.getPage(1).getRotation().angle).toBe(180);
    expect(doc.getPage(2).getRotation().angle).toBe(0);
  });

  it("stacks on an existing rotation", async () => {
    const seeded = await PDFDocument.create();
    const page = seeded.addPage([200, 200]);
    page.setRotation(degrees(90));
    const file = new File([await seeded.save()], "rot.pdf", { type: "application/pdf" });

    const blob = await rotatePdf(file, 90);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPage(0).getRotation().angle).toBe(180);
  });

  it("rejects non-right angles", async () => {
    await expect(rotatePdf(await makePdfFile(1), 45)).rejects.toThrow(/90, 180, or 270/);
  });
});

describe("rearrangePdf (F-3)", () => {
  it("reorders pages and drops omitted ones", async () => {
    const blob = await rearrangePdf(await makePdfFile(4), "4,1");
    expect(await pageIndicesOf(blob)).toEqual([3, 0]);
  });

  it("allows duplicates", async () => {
    const blob = await rearrangePdf(await makePdfFile(3), "2,2,1");
    expect(await pageIndicesOf(blob)).toEqual([1, 1, 0]);
  });

  it("rejects an empty page list", async () => {
    await expect(rearrangePdf(await makePdfFile(2), "  ")).rejects.toThrow(/pages to keep/i);
  });

  it("surfaces page-range errors", async () => {
    await expect(rearrangePdf(await makePdfFile(2), "9")).rejects.toThrow(/outside this 2-page/);
  });
});
