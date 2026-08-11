/**
 * Unit tests for file-validation helpers (P1-11).
 */
import { describe, expect, it } from "vitest";
import {
  assertPdfFile,
  hasPdfExtension,
  hasPdfMagic,
  largeFileWarning,
  LARGE_FILE_WARNING_BYTES,
} from "./file-validation";
import { makeCorruptPdfFile, makePdfFile } from "@/test/fixtures";

describe("file-validation (P1-11)", () => {
  it("detects .pdf extension case-insensitively", () => {
    expect(hasPdfExtension("a.PDF")).toBe(true);
    expect(hasPdfExtension("a.docx")).toBe(false);
  });

  it("detects %PDF- magic bytes", () => {
    expect(hasPdfMagic(new TextEncoder().encode("%PDF-1.4").buffer)).toBe(true);
    expect(hasPdfMagic(new Uint8Array([0, 1, 2, 3]).buffer)).toBe(false);
  });

  it("accepts a real PDF file", async () => {
    await expect(assertPdfFile(await makePdfFile(1))).resolves.toBeUndefined();
  });

  it("rejects wrong extension and corrupt bytes", async () => {
    await expect(
      assertPdfFile(new File(["x"], "x.docx", { type: "application/pdf" })),
    ).rejects.toThrow(/does not look like a PDF/);
    await expect(assertPdfFile(makeCorruptPdfFile("broken.pdf"))).rejects.toThrow(
      /not a valid PDF/,
    );
  });

  it("warns above the size threshold", () => {
    const big = new File([new Uint8Array(LARGE_FILE_WARNING_BYTES + 1)], "big.pdf");
    expect(largeFileWarning(big)).toMatch(/MB/);
    const small = new File([new Uint8Array(10)], "small.pdf");
    expect(largeFileWarning(small)).toBeNull();
  });
});
