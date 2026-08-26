/**
 * F-26: Add Signature.
 *
 * A visual stamp — drawn, typed, or an uploaded image — placed on one page,
 * not a cryptographic PKI signature (PDF's `/Sig` field, which needs a
 * private key and a trust chain this offline-only app has no way to issue
 * or verify). This is the same distinction most "sign a PDF" tools outside
 * enterprise contract software make.
 *
 * Placement uses the exact same rect shape and bottom-left-origin coordinate
 * conversion `RedactTool.tsx`'s `pixelToPdfRect` already established for
 * Redact PDF's drag-to-draw box — reused, not reinvented, since it's already
 * proven correct (including for rotated pages, per F-24's rotation testing).
 */
import type { PDFDocument, PDFImage } from '@cantoo/pdf-lib';

export type SignaturePlacement = {
  page: number; // 1-based
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SignatureImageFormat = 'png' | 'jpeg';

/** Pure — embeds `imageBytes` and draws it at `placement` on `pdfDoc`, in place. */
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

  page.drawImage(image, {
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
  });
}
