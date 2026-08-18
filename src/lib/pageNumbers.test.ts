/**
 * F-6: page numbers / Bates stamping.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { addPageNumbers, formatPageNumber } from "./pdf-utils";
import { encryptedPdfFile, FIXTURE_PASSWORD, makePdfFile, pageIndicesOf } from "@/test/fixtures";
import { drawnText, stampPositions } from "@/test/pdf-inspect";

describe("formatPageNumber", () => {
  it("renders each format", () => {
    expect(formatPageNumber(3, 10, { format: "n" })).toBe("3");
    expect(formatPageNumber(3, 10, { format: "n-of-total" })).toBe("3 of 10");
    expect(formatPageNumber(3, 10, { format: "bates" })).toBe("000003");
  });

  it("applies prefix and custom padding", () => {
    expect(formatPageNumber(7, 9, { format: "bates", prefix: "ABC-", digits: 4 })).toBe("ABC-0007");
    expect(formatPageNumber(7, 9, { format: "n", prefix: "Page " })).toBe("Page 7");
  });

  it("does not truncate a number wider than the padding", () => {
    expect(formatPageNumber(1234567, 1, { format: "bates", digits: 3 })).toBe("1234567");
  });
});

describe("addPageNumbers", () => {
  it("stamps every page and preserves the document", async () => {
    const blob = await addPageNumbers(await makePdfFile(3));
    expect(await pageIndicesOf(blob)).toEqual([0, 1, 2]);
    expect(await drawnText(blob)).toEqual(["1", "2", "3"]);
  });

  it("numbers from a custom start", async () => {
    const drawn = await drawnText(await addPageNumbers(await makePdfFile(2), { start: 100 }));
    expect(drawn).toEqual(["100", "101"]);
  });

  it("writes Bates numbers with padding and prefix", async () => {
    const drawn = await drawnText(
      await addPageNumbers(await makePdfFile(2), { format: "bates", prefix: "ACME-", digits: 5 }),
    );
    expect(drawn).toEqual(["ACME-00001", "ACME-00002"]);
  });

  it("only stamps the requested pages, numbering them consecutively", async () => {
    const blob = await addPageNumbers(await makePdfFile(5), { pages: "2,4", start: 1 });
    expect(await pageIndicesOf(blob)).toEqual([0, 1, 2, 3, 4]);
    // Only two stamps, numbered consecutively despite the gap between pages.
    expect(await drawnText(blob)).toEqual(["1", "2"]);
  });

  it("reports a bad page range instead of numbering nothing", async () => {
    await expect(addPageNumbers(await makePdfFile(3), { pages: "99" })).rejects.toThrow(
      /outside this 3-page document/,
    );
  });

  it.each([
    [{ fontSize: 0 }, /font size must be between/i],
    [{ fontSize: 500 }, /font size must be between/i],
    [{ margin: -1 }, /margin must be between/i],
    [{ start: -1 }, /whole number/i],
    [{ start: 1.5 }, /whole number/i],
    [{ digits: 0 }, /padding must be between/i],
    [{ color: [2, 0, 0] as [number, number, number] }, /colour channels/i],
  ])("rejects invalid option %j", async (options, expected) => {
    await expect(addPageNumbers(await makePdfFile(1), options)).rejects.toThrow(expected);
  });

  it("rejects a prefix the standard font cannot render (P0-4)", async () => {
    await expect(
      addPageNumbers(await makePdfFile(1), { prefix: "机密-" }),
    ).rejects.toThrow(/cannot render/i);
  });

  it("works on an encrypted PDF when given the password", async () => {
    const blob = await addPageNumbers(
      encryptedPdfFile("encrypted-aes-256.pdf"),
      { format: "bates" },
      FIXTURE_PASSWORD,
    );
    const reloaded = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
    expect(reloaded.isEncrypted).toBe(false);
    expect(reloaded.getPageCount()).toBe(3);
  });

  it("places a top stamp inside the page, not off it", async () => {
    // A naive `height - margin` puts the baseline above the trim edge.
    const blob = await addPageNumbers(await makePdfFile(1), {
      position: "top-center",
      margin: 0,
      fontSize: 12,
    });
    const [[, y]] = await stampPositions(blob);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(200 - 12); // page height for index 0, less the glyph
  });
});
