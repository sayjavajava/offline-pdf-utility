/**
 * F-24: pdf-search.ts.
 *
 * `locateMatches` and `unionMatchRects` are the two pieces of this feature
 * most likely to have an off-by-one or off-by-a-flip bug (the same reasoning
 * `pdf-redact.ts` splits `toPixelRect` out for) — both pulled out as pure
 * functions specifically so they can be pinned directly with plain fixture
 * data, no real PDF or DOM required. `findTextMatches`/`rectsForPageMatches`
 * reach a real `TextLayer` and DOM `Range`s, which jsdom doesn't lay out
 * with real font metrics (same split `pdf-render.test.ts`/
 * `RedactTool.test.tsx` already document) — that path is verified against
 * the real built app instead.
 *
 * The `item.transform` values below (`[24, 0, 0, 24, 20, 250]`, width
 * 78.696) are the real numbers measured from a throwaway rotation-test PDF
 * while planning this feature, not invented — see the module header comment
 * in pdf-search.ts for what they confirmed.
 */
import { describe, expect, it } from "vitest";
import { locateMatches, unionMatchRects } from "./pdf-search";

describe("locateMatches (F-24)", () => {
  it("finds a match fully inside one item", () => {
    const items = [{ str: "Hello World" }];
    const matches = locateMatches(items, "World");
    expect(matches).toEqual([[{ itemIndex: 0, startInItem: 6, endInItem: 11 }]]);
  });

  it("finds a match that crosses an item boundary on the same line", () => {
    // pdf.js commonly splits one visual word into multiple items (kerning,
    // font changes) even with no line break between them.
    const items = [{ str: "Hel" }, { str: "lo Wor" }, { str: "ld" }];
    const matches = locateMatches(items, "Hello");
    expect(matches).toEqual([
      [
        { itemIndex: 0, startInItem: 0, endInItem: 3 },
        { itemIndex: 1, startInItem: 0, endInItem: 2 },
      ],
    ]);
  });

  it("does not match across a real line break", () => {
    // "End" + "Start" would concatenate to "EndStart" without the \n this
    // function inserts after hasEOL items — searching "dSt" must not match.
    const items = [{ str: "End", hasEOL: true }, { str: "Start" }];
    expect(locateMatches(items, "dSt")).toEqual([]);
    // But the pieces on either side of the break are still found normally.
    expect(locateMatches(items, "End")).toEqual([[{ itemIndex: 0, startInItem: 0, endInItem: 3 }]]);
    expect(locateMatches(items, "Start")).toEqual([[{ itemIndex: 1, startInItem: 0, endInItem: 5 }]]);
  });

  it("is case-insensitive by default", () => {
    const items = [{ str: "Invoice Total" }];
    expect(locateMatches(items, "invoice")).toHaveLength(1);
    expect(locateMatches(items, "INVOICE")).toHaveLength(1);
  });

  it("respects caseSensitive: true", () => {
    const items = [{ str: "Invoice Total" }];
    expect(locateMatches(items, "invoice", { caseSensitive: true })).toEqual([]);
    expect(locateMatches(items, "Invoice", { caseSensitive: true })).toHaveLength(1);
  });

  it("finds every non-overlapping occurrence", () => {
    const items = [{ str: "cat cat cat" }];
    expect(locateMatches(items, "cat")).toHaveLength(3);
  });

  it("returns no matches for text that isn't present", () => {
    expect(locateMatches([{ str: "Hello World" }], "xyz")).toEqual([]);
  });

  it("returns no matches against an empty item list", () => {
    expect(locateMatches([], "anything")).toEqual([]);
  });

  it("returns no matches for an empty query, without looping forever", () => {
    expect(locateMatches([{ str: "Hello" }], "")).toEqual([]);
  });
});

describe("unionMatchRects (F-24)", () => {
  const container = { left: 100, top: 50 };

  it("pads a single rect and flips it to bottom-left-origin PDF space", () => {
    // A 200pt-tall page; the matched text sits 40..60px from the container's
    // top, 10px wide, starting 5px in from the container's left.
    const rect = unionMatchRects(
      [{ left: 105, top: 90, right: 115, bottom: 100 }],
      container,
      200,
    );
    // Relative to the container: left=5, top=40, right=15, bottom=50, then
    // padded 1.5pt on every side.
    expect(rect).toEqual({
      x: 5 - 1.5,
      y: 200 - (50 + 1.5),
      width: 10 + 3,
      height: 10 + 3,
    });
  });

  it("unions multiple rects on the same line into one box", () => {
    const rect = unionMatchRects(
      [
        { left: 105, top: 90, right: 115, bottom: 100 },
        { left: 115, top: 91, right: 140, bottom: 101 }, // 1px vertical jitter, still "the same line"
      ],
      container,
      200,
    );
    expect(rect).not.toBeNull();
    // Left/right/top/bottom are the outer extent of both rects, padded.
    expect(rect!.x).toBeCloseTo(105 - 100 - 1.5);
    expect(rect!.width).toBeCloseTo((140 - 105) + 3);
  });

  it("returns null when rects don't share a visual line", () => {
    const rect = unionMatchRects(
      [
        { left: 105, top: 90, right: 115, bottom: 100 },
        { left: 105, top: 140, right: 115, bottom: 150 }, // a different line entirely
      ],
      container,
      200,
    );
    expect(rect).toBeNull();
  });

  it("returns null for no rects at all", () => {
    expect(unionMatchRects([], container, 200)).toBeNull();
  });

  it("a box near the container's top lands near the PDF-space top, matching the rest of this app's convention", () => {
    const rect = unionMatchRects(
      [{ left: 100, top: 0, right: 110, bottom: 10 }],
      { left: 100, top: 0 },
      300,
    );
    // top of page (small `top`) -> large PDF-space y, same direction
    // pdf-redact.ts's toPixelRect test asserts for the inverse conversion.
    expect(rect!.y).toBeCloseTo(300 - 10 - 1.5);
  });
});
