/**
 * F-26: Add Signature.
 *
 * A visual stamp — drawn, typed, or an uploaded image — placed on one page,
 * not a cryptographic PKI signature (PDF's `/Sig` field, which needs a
 * private key and a trust chain this offline-only app has no way to issue
 * or verify). This is the same distinction most "sign a PDF" tools outside
 * enterprise contract software make.
 *
 * Placement is chosen by dragging on a pdf.js preview, so it arrives in the
 * space that preview shows: the page *as displayed* — after `/Rotate`, and
 * relative to the visible box — with a bottom-left origin. That is not the
 * space `drawImage` writes in. Redact PDF never has to convert between the
 * two because it rasterizes the page through that same preview transform;
 * this tool draws into the page's own content stream, so it must —
 * see `page-space.ts`.
 */
import type { PDFDocument, PDFImage } from '@cantoo/pdf-lib';
import { degrees } from '@cantoo/pdf-lib';
import { displayedToUserSpace, visibleBox } from './page-space';

export type SignaturePlacement = {
  page: number; // 1-based
  /** In PDF points, in the page as displayed (see the module comment). */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SignatureImageFormat = 'png' | 'jpeg';

/** Embeds `imageBytes` and draws it at `placement` on `pdfDoc`, in place. */
export async function placeSignatureImage(
  pdfDoc: PDFDocument,
  imageBytes: Uint8Array,
  format: SignatureImageFormat,
  placement: SignaturePlacement,
): Promise<void> {
  const pages = pdfDoc.getPages();
  const page = pages[placement.page - 1];
  if (!page) {
    throw new Error(`Page ${placement.page} does not exist in this PDF (it has ${pages.length} page(s)).`);
  }

  let image: PDFImage;
  try {
    image = format === 'jpeg' ? await pdfDoc.embedJpg(imageBytes) : await pdfDoc.embedPng(imageBytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read the signature image: ${message}`, { cause: error });
  }

  const target = displayedToUserSpace(placement, visibleBox(page), page.getRotation().angle);
  page.drawImage(image, {
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
    rotate: degrees(target.rotate),
  });
}
