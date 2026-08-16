/**
 * F-7: image extraction (read-only) and the minimal zip writer.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { extractImages } from "./pdf-utils";
import { createZip, crc32 } from "./zip";
import { jpegFile, makePdfFile, pngFile } from "@/test/fixtures";

async function pdfWithImages(): Promise<File> {
  const doc = await PDFDocument.create();
  const jpg = await doc.embedJpg(await jpegFile().arrayBuffer());
  const png = await doc.embedPng(await pngFile().arrayBuffer());
  const page = doc.addPage([200, 200]);
  page.drawImage(jpg, { x: 0, y: 0, width: 50, height: 50 });
  page.drawImage(png, { x: 60, y: 0, width: 50, height: 50 });
  return new File([await doc.save()], "with-images.pdf", { type: "application/pdf" });
}

describe("extractImages", () => {
  it("pulls out both a JPEG and a PNG", async () => {
    const { images, skipped } = await extractImages(await pdfWithImages());
    expect(skipped).toEqual([]);
    expect(images).toHaveLength(2);
    expect(images.map((i) => i.format).sort()).toEqual(["jpg", "png"]);
  });

  it("writes a JPEG that is byte-for-byte a real JPEG", async () => {
    const { images } = await extractImages(await pdfWithImages());
    const jpg = images.find((i) => i.format === "jpg")!;
    expect(Array.from(jpg.bytes.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]);
  });

  it("rebuilds a PNG that pdf-lib can read back", async () => {
    // The strongest available check: the reconstructed PNG must survive a
    // round-trip through a real PNG parser at its original dimensions.
    const { images } = await extractImages(await pdfWithImages());
    const png = images.find((i) => i.format === "png")!;
    expect(Array.from(png.bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    const doc = await PDFDocument.create();
    const embedded = await doc.embedPng(png.bytes);
    expect(embedded.width).toBe(png.width);
    expect(embedded.height).toBe(png.height);
  });

  it("names images by their source page", async () => {
    const { images } = await extractImages(await pdfWithImages());
    for (const image of images) expect(image.name).toMatch(/-p1\.(jpg|png)$/);
  });

  it("returns nothing for a PDF with no images, without failing", async () => {
    const { images, skipped } = await extractImages(await makePdfFile(2));
    expect(images).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it("does not modify the source document", async () => {
    const file = await pdfWithImages();
    const before = new Uint8Array(await file.arrayBuffer());
    await extractImages(file);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(before);
  });
});

describe("createZip", () => {
  it("produces an archive with the local-header and EOCD signatures", async () => {
    const zip = createZip([
      { name: "a.txt", bytes: new TextEncoder().encode("hello") },
      { name: "b.txt", bytes: new TextEncoder().encode("world") },
    ]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // End-of-central-directory record sits in the last 22 bytes.
    const eocd = new DataView(bytes.buffer, bytes.length - 22);
    expect(eocd.getUint32(0, true)).toBe(0x06054b50);
    expect(eocd.getUint16(8, true)).toBe(2);
  });

  it("stores contents verbatim and records a correct CRC", async () => {
    const payload = new TextEncoder().encode("hello");
    const bytes = new Uint8Array(await createZip([{ name: "a.txt", bytes: payload }]).arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(14, true)).toBe(crc32(payload));
    const nameLength = view.getUint16(26, true);
    const stored = bytes.subarray(30 + nameLength, 30 + nameLength + payload.length);
    expect(new TextDecoder().decode(stored)).toBe("hello");
  });

  it("matches a known CRC32 value", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
  });
});
