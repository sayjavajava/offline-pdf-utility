/**
 * T-7: convertImageToPdf — pins P1-15 (magic-byte / empty-MIME sniffing).
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { convertImageToPdf, detectImageFormat } from "./pdf-utils";
import { jpegFile, pngFile } from "@/test/fixtures";

describe("detectImageFormat / convertImageToPdf (T-7 / P1-15)", () => {
  it("converts PNG and JPEG to a one-page PDF matching image dimensions", async () => {
    for (const file of [pngFile(), jpegFile()]) {
      const blob = await convertImageToPdf(file);
      const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
      expect(doc.getPageCount()).toBe(1);
      const { width, height } = doc.getPage(0).getSize();
      expect(width).toBe(1);
      expect(height).toBe(1);
    }
  });

  it("rejects an unsupported type", async () => {
    const file = new File([new Uint8Array([0, 1, 2, 3])], "x.gif", { type: "image/gif" });
    await expect(convertImageToPdf(file)).rejects.toThrow(/Unsupported image type/);
  });

  it("accepts a PNG with empty MIME type via magic bytes / extension", async () => {
    const file = pngFile("photo.png", "");
    expect(file.type).toBe("");
    const blob = await convertImageToPdf(file);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(1);
  });

  it("accepts a JPEG with empty MIME type via magic bytes / extension", async () => {
    const file = jpegFile("photo.jpg", "");
    const blob = await convertImageToPdf(file);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(1);
  });

  it("trusts JPEG magic bytes even when the name says .png", async () => {
    // jpegFile bytes with a .png name — magic wins over extension (P1-15).
    const file = jpegFile("mislabelled.png", "image/png");
    const bytes = await file.arrayBuffer();
    expect(detectImageFormat(file, bytes)).toBe("jpeg");

    const blob = await convertImageToPdf(file);
    const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(1);
  });
});
