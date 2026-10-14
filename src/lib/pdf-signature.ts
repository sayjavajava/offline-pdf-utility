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
 * this tool draws into the page's own content stream, so it must.
 * `displayedToUserSpace` does the conversion.
 */
import type { PDFDocument, PDFImage, PDFPage } from '@cantoo/pdf-lib';
import { degrees } from '@cantoo/pdf-lib';

export type SignaturePlacement = {
  page: number; // 1-based
  /** In PDF points, in the page as displayed (see the module comment). */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SignatureImageFormat = 'png' | 'jpeg';

type Box = { x: number; y: number; width: number; height: number };

/** Where `drawImage` must put the image, in the page's own user space. */
export type UserSpacePlacement = { x: number; y: number; width: number; height: number; rotate: number };

/**
 * The region pdf.js actually renders: the CropBox clipped to the MediaBox
 * (pdf.js's `page.view`). pdf-lib's `getCropBox()` already falls back to the
 * MediaBox when there is no CropBox.
 */
export function visibleBox(page: PDFPage): Box {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  const x = Math.max(media.x, crop.x);
  const y = Math.max(media.y, crop.y);
  return {
    x,
    y,
    width: Math.min(media.x + media.width, crop.x + crop.width) - x,
    height: Math.min(media.y + media.height, crop.y + crop.height) - y,
  };
}

/**
 * Pure. Converts a rect in displayed-page space (bottom-left origin, points)
 * into the anchor and rotation `drawImage` needs so the image lands on that
 * rect and reads upright. `rotation` is the page's `/Rotate` (clockwise);
 * anything that isn't a multiple of 90 is treated as 0, as pdf.js does.
 *
 * The anchor is the displayed rect's bottom-left corner mapped back into
 * user space, and `rotate` (counter-clockwise, pdf-lib's convention) undoes
 * the page's own clockwise display rotation.
 */
export function displayedToUserSpace(
  rect: { x: number; y: number; width: number; height: number },
  box: Box,
  rotation: number,
): UserSpacePlacement {
  const r = rotation % 90 === 0 ? ((rotation % 360) + 360) % 360 : 0;
  const { x: dx, y: dy, width, height } = rect;
  switch (r) {
    case 90:
      return { x: box.x + box.width - dy, y: box.y + dx, width, height, rotate: 90 };
    case 180:
      return { x: box.x + box.width - dx, y: box.y + box.height - dy, width, height, rotate: 180 };
    case 270:
      return { x: box.x + dy, y: box.y + box.height - dx, width, height, rotate: 270 };
    default:
      return { x: box.x + dx, y: box.y + dy, width, height, rotate: 0 };
  }
}

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
