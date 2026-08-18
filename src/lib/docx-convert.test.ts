/**
 * F-12: DOCX -> PDF, real text output.
 *
 * Exercises the actual `convertDocxToPdf` export from pdf-utils.ts (the
 * main-thread-only path — see docx-convert.ts for why it cannot go through
 * the worker), tying mammoth and the layout engine (docx-layout.test.ts)
 * together against a real, minimal .docx file.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { convertDocxToPdf } from "./pdf-utils";
import { docxFile } from "@/test/fixtures";
import { drawnText } from "@/test/pdf-inspect";

describe("convertDocxToPdf", () => {
  it("converts a real .docx into a PDF with genuinely selectable text", async () => {
    const { blob, warnings } = await convertDocxToPdf(docxFile());

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);

    // docxFile() is documented as "one Heading 1 and one body paragraph".
    const drawn = await drawnText(blob);
    expect(drawn.some((s) => s.includes("Fixture Heading"))).toBe(true);
    expect(drawn.some((s) => s.includes("Fixture body paragraph"))).toBe(true);

    // mammoth itself warns about this fixture's missing style definition
    // (see the module-level probe in docx-layout's design notes) -- surfacing
    // it, rather than silently discarding it, is the whole point of P1-16.
    expect(warnings.length).toBeGreaterThan(0);
  });
});
