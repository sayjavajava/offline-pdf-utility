/**
 * T-3: parsePageRange — pins P1-6 (specific invalid-segment errors) and
 * P1-7 (order preservation + duplicates).
 *
 * Deliberate behaviour change (P1-7): `"5,1"` yields `[4, 0]`, not sorted
 * `[0, 4]`. Do not "fix" this back to sorted order.
 */
import { describe, expect, it } from "vitest";
import { parsePageRange, splitPdf } from "./pdf-utils";
import { makePdfFile, pageIndicesOf } from "@/test/fixtures";

describe("parsePageRange (T-3 / P1-6 / P1-7)", () => {
  it("parses a single page", () => {
    expect(parsePageRange("3", 5)).toEqual({ indices: [2], errors: [] });
  });

  it("parses a comma list", () => {
    expect(parsePageRange("1, 3, 5", 5)).toEqual({ indices: [0, 2, 4], errors: [] });
  });

  it("parses a range", () => {
    expect(parsePageRange("2-4", 5)).toEqual({ indices: [1, 2, 3], errors: [] });
  });

  it("parses mixed ranges and singles", () => {
    expect(parsePageRange("1, 3-5, 8", 10)).toEqual({
      indices: [0, 2, 3, 4, 7],
      errors: [],
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parsePageRange("  2 , 4-5  ", 5)).toEqual({ indices: [1, 3, 4], errors: [] });
  });

  it("returns empty indices for an empty string", () => {
    expect(parsePageRange("", 5)).toEqual({ indices: [], errors: [] });
  });

  it('rejects page "0" as out of range', () => {
    const result = parsePageRange("0", 5);
    expect(result.indices).toEqual([]);
    expect(result.errors).toEqual(["Pages 0 are outside this 5-page document."]);
  });

  it("reports a reversed range with a suggested fix (P1-6)", () => {
    const result = parsePageRange("5-3", 5);
    expect(result.indices).toEqual([]);
    expect(result.errors).toEqual(['"5-3" is backwards — did you mean 3-5?']);
  });

  it("reports pages beyond maxPages (P1-6)", () => {
    const result = parsePageRange("99", 5);
    expect(result.indices).toEqual([]);
    expect(result.errors).toEqual(["Pages 99 are outside this 5-page document."]);
  });

  it("reports multiple out-of-range pages together", () => {
    const result = parsePageRange("99, 104", 5);
    expect(result.indices).toEqual([]);
    expect(result.errors).toEqual(["Pages 99, 104 are outside this 5-page document."]);
  });

  it("reports unparseable segments (P1-6)", () => {
    const result = parsePageRange("abc", 5);
    expect(result.indices).toEqual([]);
    expect(result.errors).toEqual(['Could not understand "abc" in the page range.']);
  });

  it("reports partial invalidity instead of silently dropping bad segments (P1-6)", () => {
    const result = parsePageRange("1-3, 99", 5);
    expect(result.indices).toEqual([0, 1, 2]);
    expect(result.errors).toEqual(["Pages 99 are outside this 5-page document."]);
  });

  it("preserves input order — deliberate P1-7 behaviour", () => {
    expect(parsePageRange("5,1", 5).indices).toEqual([4, 0]);
  });

  it("keeps duplicates across segments — deliberate P1-7 behaviour", () => {
    expect(parsePageRange("1,1", 5).indices).toEqual([0, 0]);
    expect(parsePageRange("3,1,1", 5).indices).toEqual([2, 0, 0]);
  });

  it("does not duplicate pages inside a single expanded range", () => {
    expect(parsePageRange("2-4", 5).indices).toEqual([1, 2, 3]);
  });
});

describe("splitPdf page-range surfacing (T-3)", () => {
  it('accepts "all" in any case and round-trips every page', async () => {
    const file = await makePdfFile(4);
    for (const pages of ["all", "ALL", "All"] as const) {
      const blob = await splitPdf(file, pages);
      expect(await pageIndicesOf(blob)).toEqual([0, 1, 2, 3]);
    }
  });

  it("preserves asked-for order in the output PDF (P1-7)", async () => {
    const blob = await splitPdf(await makePdfFile(5), "5,1");
    expect(await pageIndicesOf(blob)).toEqual([4, 0]);
  });

  it("surfaces specific range errors instead of a generic message (P1-6)", async () => {
    await expect(splitPdf(await makePdfFile(5), "1-3, 99")).rejects.toThrow(
      /Pages 99 are outside this 5-page document/,
    );
  });

  it("surfaces a reversed-range suggestion", async () => {
    await expect(splitPdf(await makePdfFile(5), "5-3")).rejects.toThrow(
      /"5-3" is backwards/,
    );
  });
});
