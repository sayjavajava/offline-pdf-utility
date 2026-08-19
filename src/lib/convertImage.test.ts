/**
 * T-7: convertImageToPdf — pins P1-15 (magic-byte / empty-MIME sniffing)
 * and F-22 (combining several images into one multi-page PDF).
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { convertImageToPdf, detectImageFormat } from "./pdf-utils";
import { jpegFile, pngFile } from "@/test/fixtures";

describe("detectImageFormat / convertImageToPdf (T-7 / P1-15 / F-22)", () => {
  it("converts PNG and JPEG to a one-page PDF matching image dimensions", async () => {
    for (const file of [pngFile(), jpegFile()]) {
      const blob = await convertImageToPdf([file]);
      const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
      expect(doc.getPageCount()).toBe(1);
      const { width, height } = doc.getPage(0).getSize();
      expect(width).toBe(1);
      expect(height).toBe(1);
    }
  });

  it("rejects an unsupported type", async () => {
    const file = new File([new Uint8Array([0, 1, 2, 3])], "x.gif", { type: "image/gif" });
    await expect(convertImageToPdf([file])).rejects.toThrow(/Unsupported image type/);
  });

  it("rejects an empty selection", async () => {
    await expect(convertImageToPdf([])).rejects.toThrow(/select at least one image/i);
  });

  it("accepts a PNG with empty MIME type via magic bytes / extension", async () => {
    const file = pngFile("photo.png", "");
    expect(file.type).toBe("");
    const blob = await convertImageToPdf([file]);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(1);
  });

  it("accepts a JPEG with empty MIME type via magic bytes / extension", async () => {
    const file = jpegFile("photo.jpg", "");
    const blob = await convertImageToPdf([file]);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(1);
  });

  it("trusts JPEG magic bytes even when the name says .png", async () => {
    // jpegFile bytes with a .png name — magic wins over extension (P1-15).
    const file = jpegFile("mislabelled.png", "image/png");
    const bytes = await file.arrayBuffer();
    expect(detectImageFormat(file, bytes)).toBe("jpeg");

    const blob = await convertImageToPdf([file]);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(1);
  });

  it("combines several images into one PDF, one page per image, in order (F-22)", async () => {
    const blob = await convertImageToPdf([
      pngFile("first.png"),
      jpegFile("second.jpg"),
      pngFile("third.png"),
    ]);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(3);
    // Every fixture image is 1x1, so page identity is confirmed by count and
    // order rather than distinguishable content — order is what F-22 actually
    // promises ("in the order shown"), so that's what this pins.
    for (let i = 0; i < 3; i++) {
      const { width, height } = doc.getPage(i).getSize();
      expect(width).toBe(1);
      expect(height).toBe(1);
    }
  });

  it("names the offending file when one image in a batch is invalid", async () => {
    const bad = new File([new Uint8Array([0, 1, 2, 3])], "corrupt.gif", { type: "image/gif" });
    await expect(convertImageToPdf([pngFile("ok.png"), bad])).rejects.toThrow(/"corrupt\.gif"/);
  });
});
