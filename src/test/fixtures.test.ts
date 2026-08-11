/**
 * Fixtures are test infrastructure that every other spec leans on, so they get
 * their own coverage. A silently broken fixture would otherwise show up as a
 * confusing failure somewhere far away.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import {
  FIXTURE_PASSWORD,
  docxFile,
  encryptedPdfFile,
  jpegFile,
  makeCorruptPdfFile,
  makePdfFile,
  pageIndicesOf,
  pngFile,
} from "./fixtures";

describe("PDF fixtures", () => {
  it("builds a PDF whose pages are individually identifiable", async () => {
    const file = await makePdfFile(4);
    const bytes = new Uint8Array(await file.arrayBuffer());
    expect(await pageIndicesOf(bytes)).toEqual([0, 1, 2, 3]);
  });

  it("produces a File the app code can actually read", async () => {
    const file = await makePdfFile(2, "named.pdf");
    expect(file.name).toBe("named.pdf");
    expect(file.type).toBe("application/pdf");
    expect(typeof file.arrayBuffer).toBe("function");
  });

  it("produces corrupt bytes that fail to parse", async () => {
    const file = makeCorruptPdfFile();
    await expect(
      PDFDocument.load(new Uint8Array(await file.arrayBuffer())),
    ).rejects.toThrow();
  });
});

describe("encrypted PDF fixtures", () => {
  // These pin the exact behaviours the audit's P0-3 fix depends on. If the
  // library or the fixtures ever change shape, this fails first and loudly.
  it.each(["encrypted-rc4-128.pdf", "encrypted-aes-256.pdf"] as const)(
    "%s decrypts with the correct password and yields all three pages",
    async (name) => {
      const file = encryptedPdfFile(name);
      const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), {
        password: FIXTURE_PASSWORD,
      });
      expect(doc.getPageCount()).toBe(3);
      expect(doc.getPages().map((p) => Math.round(p.getWidth()))).toEqual([200, 300, 400]);
    },
  );

  it("re-saves decrypted, which is what 'unlock' actually means", async () => {
    const file = encryptedPdfFile("encrypted-aes-256.pdf");
    const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), {
      password: FIXTURE_PASSWORD,
    });
    const reloaded = await PDFDocument.load(await doc.save()); // no password
    expect(reloaded.isEncrypted).toBe(false);
    expect(reloaded.getPageCount()).toBe(3);
  });

  it("reports a wrong password distinguishably from a missing one", async () => {
    const bytes = new Uint8Array(await encryptedPdfFile("encrypted-aes-256.pdf").arrayBuffer());
    await expect(PDFDocument.load(bytes, { password: "nope" })).rejects.toThrow(
      /password incorrect/i,
    );
    await expect(PDFDocument.load(bytes)).rejects.toThrow(/encrypted/i);
  });

  it("treats an empty password as distinct from no password", async () => {
    // The case behind the audit's warning against `password || undefined`:
    // '' opens this file, undefined does not.
    const bytes = new Uint8Array(
      await encryptedPdfFile("encrypted-empty-password.pdf").arrayBuffer(),
    );
    const doc = await PDFDocument.load(bytes, { password: "" });
    expect(doc.getPageCount()).toBe(3);
    await expect(PDFDocument.load(bytes, { password: undefined })).rejects.toThrow(/encrypted/i);
  });
});

describe("image and docx fixtures", () => {
  it("embeds as real images", async () => {
    const doc = await PDFDocument.create();
    const png = await doc.embedPng(await pngFile().arrayBuffer());
    const jpg = await doc.embedJpg(await jpegFile().arrayBuffer());
    expect([png.width, png.height]).toEqual([1, 1]);
    expect([jpg.width, jpg.height]).toEqual([1, 1]);
  });

  it("can carry an empty MIME type, as some browsers report", () => {
    expect(pngFile("photo.png", "").type).toBe("");
    expect(pngFile().type).toBe("image/png");
  });

  it("produces a docx mammoth can parse", async () => {
    const mammoth = await import("mammoth");
    // Under jsdom this resolves to mammoth's *node* entry point, which accepts
    // `buffer` rather than the `arrayBuffer` the browser build (and so the app)
    // uses. This asserts the fixture is a genuinely valid .docx; the app's own
    // arrayBuffer call path is a browser concern and is not exercised here.
    const { value } = await mammoth.convertToHtml({
      buffer: Buffer.from(await docxFile().arrayBuffer()),
    });
    expect(value).toContain("Fixture Heading");
    expect(value).toContain("Fixture body paragraph.");
  });
});
