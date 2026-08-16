/**
 * T-6: editPdfMetadata round-trip.
 *
 * Pins current behaviour: empty/omitted fields do NOT clobber existing
 * metadata (the `if (metadata.title)` guards). Clearing a field via this API
 * is therefore impossible — intentional until a real "clear" UI exists.
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { editPdfMetadata } from "./pdf-utils";
import { makePdfFile } from "@/test/fixtures";

async function reload(blob: Blob) {
  return PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));
}

describe("editPdfMetadata (T-6)", () => {
  it("round-trips title, author, subject, keywords, producer, creator", async () => {
    const blob = await editPdfMetadata(await makePdfFile(1), {
      title: "Quarterly Report",
      author: "Ada Lovelace",
      subject: "Finance",
      keywords: "q3, revenue, draft",
      producer: "Offline PDF Utility",
      creator: "Edit Tool",
    });

    const doc = await reload(blob);
    expect(doc.getTitle()).toBe("Quarterly Report");
    expect(doc.getAuthor()).toBe("Ada Lovelace");
    expect(doc.getSubject()).toBe("Finance");
    expect(doc.getKeywords()).toBe("q3 revenue draft");
    // pdf-lib overwrites Producer on every save; Creator round-trips.
    expect(doc.getProducer()).toMatch(/pdf-lib/i);
    expect(doc.getCreator()).toBe("Edit Tool");
  });

  it("splits and trims keywords on commas before saving", async () => {
    const blob = await editPdfMetadata(await makePdfFile(1), {
      keywords: " alpha , beta,gamma ",
    });
    const doc = await reload(blob);
    // pdf-lib's getKeywords() returns the Keywords info string (space-joined).
    expect(doc.getKeywords()).toBe("alpha beta gamma");
  });

  it("does not clobber existing metadata when fields are empty", async () => {
    const seeded = await editPdfMetadata(await makePdfFile(1), {
      title: "Keep Me",
      author: "Original Author",
      subject: "Original Subject",
      keywords: "one, two",
    });

    const cleared = await editPdfMetadata(
      new File([await seeded.arrayBuffer()], "seeded.pdf", { type: "application/pdf" }),
      { title: "", author: "", subject: "", keywords: "" },
    );

    const doc = await reload(cleared);
    expect(doc.getTitle()).toBe("Keep Me");
    expect(doc.getAuthor()).toBe("Original Author");
    expect(doc.getSubject()).toBe("Original Subject");
    expect(doc.getKeywords()).toBe("one two");
  });

  it("updates only the fields that were supplied", async () => {
    const seeded = await editPdfMetadata(await makePdfFile(1), {
      title: "Old Title",
      author: "Old Author",
    });

    const updated = await editPdfMetadata(
      new File([await seeded.arrayBuffer()], "seeded.pdf", { type: "application/pdf" }),
      { title: "New Title" },
    );

    const doc = await reload(updated);
    expect(doc.getTitle()).toBe("New Title");
    expect(doc.getAuthor()).toBe("Old Author");
  });
});
