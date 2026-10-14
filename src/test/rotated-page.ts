import { PDFDocument, degrees } from "@cantoo/pdf-lib";

/** A single 612×792pt page, optionally turned by /Rotate and with its
 *  MediaBox moved off (0,0) — the shapes real scans and cropped files take. */
export async function rotatedPageFile(rotation: number, origin: [number, number] = [0, 0]): Promise<File> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  page.setMediaBox(origin[0], origin[1], 612, 792);
  page.setRotation(degrees(rotation));
  return new File([await doc.save()], "rotated.pdf", { type: "application/pdf" });
}
