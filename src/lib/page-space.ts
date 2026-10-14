/**
 * The two coordinate spaces a page has, and how to get between them.
 *
 * - **Displayed space** is the page as a reader shows it: turned by its
 *   `/Rotate`, cropped to its visible box, origin at the bottom-left of what
 *   you see. A drag on a pdf.js preview is in this space, and so is "the
 *   bottom-centre of the page" as a user means it.
 * - **User space** is where content-stream operators like `drawText` and
 *   `drawImage` write: the page's own, unrotated coordinates, with the
 *   origin wherever its MediaBox puts it.
 *
 * The two only coincide for an unrotated page whose box starts at (0,0).
 * Every tool that draws onto a page from a displayed-space position has to
 * convert, or its stamp lands in the wrong place, the wrong way up, or off
 * the page entirely on rotated or offset pages (landscape scans, cropped
 * documents).
 */
import type { PDFPage } from '@cantoo/pdf-lib';

export type Box = { x: number; y: number; width: number; height: number };

/** `/Rotate` as 0, 90, 180 or 270. A value that isn't a multiple of 90 is
 *  treated as 0, as pdf.js does. */
export function normalizeRotation(rotation: number): number {
  return rotation % 90 === 0 ? ((rotation % 360) + 360) % 360 : 0;
}

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

/** The page's width and height as displayed — swapped for a quarter turn. */
export function displayedSize(box: Box, rotation: number): { width: number; height: number } {
  const r = normalizeRotation(rotation);
  return r === 90 || r === 270 ? { width: box.height, height: box.width } : { width: box.width, height: box.height };
}

/** Pure. A displayed-space point, in user space. `rotation` is the page's
 *  `/Rotate`, which turns the page clockwise for display. */
export function toUserSpace(x: number, y: number, box: Box, rotation: number): { x: number; y: number } {
  switch (normalizeRotation(rotation)) {
    case 90:
      return { x: box.x + box.width - y, y: box.y + x };
    case 180:
      return { x: box.x + box.width - x, y: box.y + box.height - y };
    case 270:
      return { x: box.x + y, y: box.y + box.height - x };
    default:
      return { x: box.x + x, y: box.y + y };
  }
}

/** Where `drawImage` must put an image, in user space. */
export type UserSpacePlacement = { x: number; y: number; width: number; height: number; rotate: number };

/**
 * Pure. Converts a displayed-space rect into the anchor and rotation
 * `drawImage` needs so the image lands on that rect and reads upright: the
 * rect's bottom-left corner mapped into user space, and a counter-clockwise
 * `rotate` (pdf-lib's convention) that undoes the page's own clockwise
 * display rotation.
 */
export function displayedToUserSpace(
  rect: { x: number; y: number; width: number; height: number },
  box: Box,
  rotation: number,
): UserSpacePlacement {
  const anchor = toUserSpace(rect.x, rect.y, box, rotation);
  return { ...anchor, width: rect.width, height: rect.height, rotate: normalizeRotation(rotation) };
}
