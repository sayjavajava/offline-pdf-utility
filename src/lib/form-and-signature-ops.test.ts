/**
 * The public entry points FillFormTool and SignatureTool actually call —
 * `getFormFields`, `fillFormFields`, `addSignature` — end to end: a real File
 * in, a real PDF out. The component tests mock these, and the
 * `pdf-forms`/`pdf-signature` tests exercise the pieces underneath, so
 * without this nothing checks the two are wired together (loading with a
 * password, `flatten`, saving).
 */
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { addSignature, fillFormFields, getFormFields } from "./pdf-utils";
import { encryptedPdfFile, FIXTURE_PASSWORD, pngFile } from "@/test/fixtures";

async function formFile(): Promise<File> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const form = doc.getForm();
  form.createTextField("name").addToPage(page, { x: 20, y: 250, width: 150, height: 20 });
  form.createCheckBox("agree").addToPage(page, { x: 20, y: 200, width: 20, height: 20 });
  return new File([await doc.save()], "form.pdf", { type: "application/pdf" });
}

const load = async (blob: Blob) => PDFDocument.load(new Uint8Array(await blob.arrayBuffer()));

describe("getFormFields / fillFormFields (F-25)", () => {
  it("reads the fields of a real file", async () => {
    const { fields, unsupportedFields } = await getFormFields(await formFile());
    expect(fields.map((f) => [f.name, f.type])).toEqual([["name", "text"], ["agree", "checkbox"]]);
    expect(unsupportedFields).toEqual([]);
  });

  it("fills and keeps the form editable when not flattening", async () => {
    const out = await load(await fillFormFields(await formFile(), { name: "Jane", agree: true }, { flatten: false }));
    expect(out.getForm().getTextField("name").getText()).toBe("Jane");
    expect(out.getForm().getCheckBox("agree").isChecked()).toBe(true);
  });

  it("removes every field when flattening, leaving the filled appearance on the page", async () => {
    const out = await load(await fillFormFields(await formFile(), { name: "Jane" }, { flatten: true }));
    expect(out.getForm().getFields()).toEqual([]);
    expect(out.getPageCount()).toBe(1);
  });

  it("opens a password-protected file with its password", async () => {
    const file = encryptedPdfFile("encrypted-aes-256.pdf");
    await expect(getFormFields(file)).rejects.toThrow();
    await expect(getFormFields(file, FIXTURE_PASSWORD)).resolves.toEqual({ fields: [], unsupportedFields: [] });
  });
});

describe("addSignature (F-26)", () => {
  it("stamps a real file and returns a loadable PDF with the image embedded", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    const file = new File([await doc.save()], "plain.pdf", { type: "application/pdf" });
    const png = new Uint8Array(await pngFile().arrayBuffer());

    const out = await load(await addSignature(file, png, "png", { page: 1, x: 10, y: 10, width: 80, height: 30 }));
    const xObjects = out.getPage(0).node.Resources()?.lookup(out.context.obj("XObject"));
    expect(xObjects).toBeDefined();
  });
});
