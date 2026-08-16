/**
 * T-5: mergePdf — pins P1-12 (named failing file) and P1-13 (input order).
 */
import { describe, expect, it } from "vitest";
import { mergePdf } from "./pdf-utils";
import {
  encryptedPdfFile,
  makeCorruptPdfFile,
  makePdfFile,
  pageIndicesOf,
} from "@/test/fixtures";

describe("mergePdf (T-5)", () => {
  it("rejects fewer than 2 files", async () => {
    await expect(mergePdf([])).rejects.toThrow(/at least 2/i);
    await expect(mergePdf([await makePdfFile(1)])).rejects.toThrow(/at least 2/i);
  });

  it("page count equals the sum of inputs", async () => {
    const blob = await mergePdf([await makePdfFile(2), await makePdfFile(3)]);
    expect(await pageIndicesOf(blob)).toHaveLength(5);
  });

  it("preserves input array order in the output (P1-13)", async () => {
    // makePdfFile(n) pages are sized by index 0..n-1 within that file.
    // Merging a 1-page then a 2-page file → sizes [200], [200,300] → indices
    // [0] then [0,1]. Distinguishing order needs differently-sized singles:
    const a = await makePdfFile(1, "a.pdf"); // page index 0 → 200
    const bBytes = await (await import("@cantoo/pdf-lib")).PDFDocument.create();
    // Build a one-page PDF whose size matches fixture page index 2 (400×400)
    // so pageIndicesOf reports [2] for it alone.
    const { pageSizeFor } = await import("@/test/fixtures");
    bBytes.addPage(pageSizeFor(2));
    const b = new File([await bBytes.save()], "b.pdf", { type: "application/pdf" });

    const blob = await mergePdf([a, b]);
    expect(await pageIndicesOf(blob)).toEqual([0, 2]);

    const reversed = await mergePdf([b, a]);
    expect(await pageIndicesOf(reversed)).toEqual([2, 0]);
  });

  it("names the corrupt member in the error (P1-12)", async () => {
    await expect(
      mergePdf([await makePdfFile(1, "good.pdf"), makeCorruptPdfFile("bad-one.pdf")]),
    ).rejects.toThrow(/Could not read "bad-one\.pdf"/);
  });

  it("names an encrypted member and keeps the readable password message", async () => {
    await expect(
      mergePdf([await makePdfFile(1, "ok.pdf"), encryptedPdfFile("encrypted-aes-256.pdf")]),
    ).rejects.toThrow(/Could not read "encrypted-aes-256\.pdf".*password protected/i);
  });
});
