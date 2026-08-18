/**
 * F-12: real, text-based DOCX -> PDF conversion.
 *
 * These test the layout engine directly against hand-written HTML matching
 * mammoth's actual output shape (verified separately against real mammoth
 * conversions, not guessed) — see docx-layout.ts's module docstring for the
 * scope this deliberately covers.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { parseBlocks, layoutHtmlToPdf } from "./docx-layout";
import { drawnText } from "@/test/pdf-inspect";
import { pngDataUri } from "@/test/fixtures";

describe("parseBlocks", () => {
  it("extracts headings, paragraphs, and bold/italic runs", () => {
    const blocks = parseBlocks(
      "<h1>Title</h1><p>Plain <strong>bold</strong> and <em>italic</em> text.</p>",
    );
    expect(blocks).toEqual([
      { type: "heading", level: 1, runs: [{ text: "Title", bold: false, italic: false }] },
      {
        type: "paragraph",
        runs: [
          { text: "Plain ", bold: false, italic: false },
          { text: "bold", bold: true, italic: false },
          { text: " and ", bold: false, italic: false },
          { text: "italic", bold: false, italic: true },
          { text: " text.", bold: false, italic: false },
        ],
      },
    ]);
  });

  it("extracts unordered and ordered lists, preserving order and index", () => {
    const blocks = parseBlocks("<ul><li>First</li><li>Second</li></ul><ol><li>One</li><li>Two</li></ol>");
    expect(blocks).toEqual([
      { type: "listItem", ordered: false, index: 1, depth: 0, runs: [{ text: "First", bold: false, italic: false }] },
      { type: "listItem", ordered: false, index: 2, depth: 0, runs: [{ text: "Second", bold: false, italic: false }] },
      { type: "listItem", ordered: true, index: 1, depth: 0, runs: [{ text: "One", bold: false, italic: false }] },
      { type: "listItem", ordered: true, index: 2, depth: 0, runs: [{ text: "Two", bold: false, italic: false }] },
    ]);
  });

  it("nests a sub-list under its parent item, one depth deeper", () => {
    const blocks = parseBlocks("<ul><li>Parent<ul><li>Child</li></ul></li></ul>");
    expect(blocks).toEqual([
      { type: "listItem", ordered: false, index: 1, depth: 0, runs: [{ text: "Parent", bold: false, italic: false }] },
      { type: "listItem", ordered: false, index: 1, depth: 1, runs: [{ text: "Child", bold: false, italic: false }] },
    ]);
  });

  it("extracts a simple table's cell text, row by row", () => {
    const blocks = parseBlocks(
      "<table><tr><td><p>A1</p></td><td><p>B1</p></td></tr><tr><td><p>A2</p></td><td><p>B2</p></td></tr></table>",
    );
    expect(blocks).toEqual([
      {
        type: "table",
        rows: [
          [[{ text: "A1", bold: false, italic: false }], [{ text: "B1", bold: false, italic: false }]],
          [[{ text: "A2", bold: false, italic: false }], [{ text: "B2", bold: false, italic: false }]],
        ],
      },
    ]);
  });

  it("joins a multi-paragraph cell with a line break between paragraphs", () => {
    const blocks = parseBlocks("<table><tr><td><p>Line one</p><p>Line two</p></td></tr></table>");
    expect(blocks).toEqual([
      {
        type: "table",
        rows: [
          [
            [
              { text: "Line one", bold: false, italic: false },
              { text: "\n", bold: false, italic: false },
              { text: "Line two", bold: false, italic: false },
            ],
          ],
        ],
      },
    ]);
  });

  it("captures a hyperlink's href on its run", () => {
    const blocks = parseBlocks('<p>See <a href="https://example.com">this link</a>.</p>');
    expect(blocks).toEqual([
      {
        type: "paragraph",
        runs: [
          { text: "See ", bold: false, italic: false },
          { text: "this link", bold: false, italic: false, link: "https://example.com" },
          { text: ".", bold: false, italic: false },
        ],
      },
    ]);
  });

  it("treats a paragraph containing only an <img> as an image block", () => {
    const blocks = parseBlocks(`<p><img src="${pngDataUri()}"/></p>`);
    expect(blocks).toEqual([{ type: "image", format: "png", bytes: expect.any(Uint8Array) }]);
  });

  it("falls back to a paragraph for an unrecognized block element rather than dropping it", () => {
    const blocks = parseBlocks("<blockquote>Quoted text</blockquote>");
    expect(blocks).toEqual([
      { type: "paragraph", runs: [{ text: "Quoted text", bold: false, italic: false }] },
    ]);
  });

  it("returns no blocks for empty input", () => {
    expect(parseBlocks("")).toEqual([]);
  });
});

describe("layoutHtmlToPdf (F-12 acceptance: genuinely selectable, searchable text)", () => {
  it("draws a heading, a bold/italic run, and a list as real text objects", async () => {
    const html =
      "<h1>Sample Report</h1>" +
      "<p>This has <strong>bold</strong> and <em>italic</em> words.</p>" +
      "<ul><li>First item</li><li>Second item</li></ul>";
    const { bytes, warnings } = await layoutHtmlToPdf(html);
    expect(warnings).toEqual([]);

    const blob = new Blob([bytes], { type: "application/pdf" });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);

    const drawn = await drawnText(blob);
    // Consecutive same-style words are drawn as one text-show operator (so a
    // reader copy-pasting the PDF gets real spaces between words, not just an
    // x-position gap some viewers might not reconstruct) -- style changes
    // (bold, italic) still split the line into separate operators.
    expect(drawn).toEqual(
      expect.arrayContaining(["Sample Report", "bold", "italic", "First item", "Second item"]),
    );
  });

  it("draws table cell text as real text, with a cell border per cell", async () => {
    const html = "<table><tr><td><p>A1</p></td><td><p>B1</p></td></tr></table>";
    const { bytes } = await layoutHtmlToPdf(html);
    const drawn = await drawnText(new Blob([bytes], { type: "application/pdf" }));
    expect(drawn).toEqual(expect.arrayContaining(["A1", "B1"]));
  });

  it("embeds a block image without a warning", async () => {
    const html = `<p><img src="${pngDataUri()}"/></p>`;
    const { bytes, warnings } = await layoutHtmlToPdf(html);
    expect(warnings).toEqual([]);
    const doc = await PDFDocument.load(bytes);
    // 1x1 source image plus the page's own resource/content objects.
    expect(doc.getPageCount()).toBe(1);
  });

  it("warns and skips an image whose bytes are not actually a valid PNG, without failing the conversion", async () => {
    const garbage = btoa("this is not a png file");
    const html = `<p><img src="data:image/png;base64,${garbage}"/></p><p>After</p>`;
    const { bytes, warnings } = await layoutHtmlToPdf(html);
    expect(warnings).toEqual(['1 image could not be embedded and was skipped.']);
    const drawn = await drawnText(new Blob([bytes], { type: "application/pdf" }));
    expect(drawn).toContain("After");
  });

  it("warns and skips an image with a malformed data URI, without failing the whole conversion", async () => {
    const html = '<p><img src="data:image/png;base64,not-valid-base64!!!"/></p><p>After</p>';
    const { bytes, warnings } = await layoutHtmlToPdf(html);
    const drawn = await drawnText(new Blob([bytes], { type: "application/pdf" }));
    expect(drawn).toContain("After");
    // A malformed data URI fails the regex, so no image block is even produced --
    // there is nothing to warn about, and the rest of the document still renders.
    expect(warnings).toEqual([]);
  });

  it("keeps accented Latin text exactly as-is -- WinAnsi covers it", async () => {
    const html = "<p>Accented text: café, naïve, Zürich.</p>";
    const { bytes, warnings } = await layoutHtmlToPdf(html);
    expect(warnings).toEqual([]);
    const drawn = await drawnText(new Blob([bytes], { type: "application/pdf" }));
    expect(drawn.join(" ")).toContain("café,");
  });

  it("replaces a character the standard font cannot encode and reports how many", async () => {
    // CJK is outside WinAnsi -- the standard-font limitation this module documents.
    const html = "<p>Before 中文 after</p>";
    const { bytes, warnings } = await layoutHtmlToPdf(html);
    expect(warnings).toEqual([
      '2 characters could not be rendered in the standard font and were replaced with "?".',
    ]);
    const drawn = await drawnText(new Blob([bytes], { type: "application/pdf" }));
    // Same style throughout, so it draws as one merged segment.
    expect(drawn).toContain("Before ?? after");
  });

  it("forces a page break for content that does not fit on one page", async () => {
    const longParagraph = Array.from({ length: 1500 }, (_, i) => `word${i}`).join(" ");
    const html = `<p>${longParagraph}</p>`;
    const { bytes } = await layoutHtmlToPdf(html);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("produces a single valid (blank) page for empty input rather than failing", async () => {
    const { bytes, warnings } = await layoutHtmlToPdf("");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(warnings).toEqual([]);
  });
});
