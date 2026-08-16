/**
 * T-9: downloadBlob / stripExtension / derivedName.
 * Pins P1-8 (filename derivation) and P1-9 (deferred revoke).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { derivedName, downloadBlob, hexToRgbUnit, reportToolError, stripExtension } from "./download";

describe("stripExtension / derivedName (P1-8)", () => {
  it.each([
    ["a.pdf", "a"],
    ["report.pdf.backup.pdf", "report.pdf.backup"],
    ["Q3.REPORT.PDF", "Q3.REPORT"],
    ["report.v2.docx", "report.v2"],
    ["no-extension", "no-extension"],
    ["2026.01.15-notes.pdf", "2026.01.15-notes"],
  ])("stripExtension(%j) → %j", (input, expected) => {
    expect(stripExtension(input)).toBe(expected);
  });

  it.each([
    ["report.pdf.backup.pdf", "_split", "pdf", "report.pdf.backup_split.pdf"],
    ["Q3.REPORT.PDF", "_unprotected", "pdf", "Q3.REPORT_unprotected.pdf"],
    ["report.v2.docx", "", "pdf", "report.v2.pdf"],
    ["2026.01.15-notes.pdf", "_watermarked", "pdf", "2026.01.15-notes_watermarked.pdf"],
    ["a.pdf", "_edited", "pdf", "a_edited.pdf"],
    ["no-extension", "_split", "pdf", "no-extension_split.pdf"],
  ])("derivedName(%j, %j, %j) → %j", (original, suffix, ext, expected) => {
    expect(derivedName(original, suffix, ext)).toBe(expected);
  });
});

describe("downloadBlob (P1-9)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("appends and removes the anchor, and defers revokeObjectURL", () => {
    const createSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock/download-test");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click");
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const removeSpy = vi.spyOn(document.body, "removeChild");

    const blob = new Blob(["pdf-bytes"], { type: "application/pdf" });
    downloadBlob(blob, "out_split.pdf");

    expect(createSpy).toHaveBeenCalledWith(blob);
    expect(appendSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();

    const appended = appendSpy.mock.calls.find(
      ([node]) => node instanceof HTMLAnchorElement,
    )?.[0] as HTMLAnchorElement | undefined;
    expect(appended).toBeDefined();
    expect(appended!.download).toBe("out_split.pdf");
    expect(appended!.href).toContain("blob:mock/download-test");

    // P1-9: revoke must NOT fire in the same tick as click.
    expect(revokeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(999);
    expect(revokeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(revokeSpy).toHaveBeenCalledWith("blob:mock/download-test");
  });
});

describe("reportToolError (P0-5)", () => {
  it("toasts Error.message for Error instances", () => {
    const toast = vi.fn();
    const err = new Error("boom");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    reportToolError(toast, "Error splitting PDF", err);

    expect(toast).toHaveBeenCalledWith({
      title: "Error splitting PDF",
      description: "boom",
      variant: "destructive",
    });
    expect(consoleSpy).toHaveBeenCalledWith(err);
  });

  it("still toasts when the thrown value is not an Error", () => {
    const toast = vi.fn();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    reportToolError(toast, "Error merging PDFs", "boom");

    expect(toast).toHaveBeenCalledWith({
      title: "Error merging PDFs",
      description: "boom",
      variant: "destructive",
    });
    expect(consoleSpy).toHaveBeenCalledWith("boom");
  });

  it("falls back when String(error) is empty", () => {
    const toast = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});

    reportToolError(toast, "Error", "");

    expect(toast).toHaveBeenCalledWith({
      title: "Error",
      description: "An unexpected error occurred.",
      variant: "destructive",
    });
  });
});

describe("hexToRgbUnit (F-10)", () => {
  it("converts hex colours to 0–1 RGB triples", () => {
    expect(hexToRgbUnit("#ff0000")).toEqual([1, 0, 0]);
    expect(hexToRgbUnit("#000000")).toEqual([0, 0, 0]);
    expect(hexToRgbUnit("#ffffff")).toEqual([1, 1, 1]);
    expect(hexToRgbUnit("00ff00")).toEqual([0, 1, 0]);
  });

  it("falls back to black on malformed input rather than throwing", () => {
    expect(hexToRgbUnit("nonsense")).toEqual([0, 0, 0]);
    expect(hexToRgbUnit("#fff")).toEqual([0, 0, 0]);
  });
});
