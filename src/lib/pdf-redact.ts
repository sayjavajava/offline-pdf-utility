/**
 * F-16 (replacing the dropped Repair/Diagnose attempts): permanently redact
 * regions of a PDF.
 *
 * "Redact" has to mean *delete*, not *cover* — a black rectangle drawn on top
 * of existing text or image content leaves the original content stream
 * untouched underneath it, so the "redacted" text is still selectable,
 * copyable, and searchable through the box. That failure is well known and
 * common in cheap redaction tools; it is exactly what this module exists to
 * not do.
 *
 * The approach: rasterize any page carrying at least one redaction box (via
 * pdf.js, the same renderer F-4/F-5 use) with the box baked into the pixels
 * *before* re-encoding, then rebuild that page in the output as a plain
 * embedded image with no text layer, no annotations, and no copied content
 * stream at all. Nothing from the original page survives except pixels —
 * there is no "content underneath" left for a box to fail to cover. Pages
 * with no redactions are copied through unchanged (same `copyPages` pattern
 * as splitPdf/mergePdf/rearrangePdf), so the rest of the document keeps its
 * real text layer.
 *
 * Like pdf-render.ts, this stays on the main thread rather than routing
 * through pdf-utils.ts's worker dispatch: rendering needs a canvas, which the
 * app's own Worker (F-9) has no access to — same constraint documented there,
 * and the same reason convertDocxToPdf (docx-convert.ts) stays main-thread
 * too.
 */
import { PDFDocument } from '@cantoo/pdf-lib';
import { renderPdfPages } from './pdf-render';
import { loadPdf } from './pdf-ops';

/** A redaction box in PDF point-space: origin at the page's bottom-left, y increasing upward — the same convention pdf-lib itself uses (getSize/getCropBox/drawRectangle). */
export type RedactionRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/**
 * Converts a PDF-point-space rect (bottom-left origin) to pixel-space
 * (top-left origin, the convention every 2D canvas API uses) for a raster of
 * a page `pageHeightPts` tall, rendered at `scale` pixels per point.
 *
 * Pulled out as its own pure function so the coordinate math — the one part
 * of this feature most likely to have an off-by-a-flip bug — can be unit
 * tested directly, without needing a real canvas or pdf.js render.
 */
export function toPixelRect(
    rect: RedactionRect,
    pageHeightPts: number,
    scale: number,
): { x: number; y: number; width: number; height: number } {
    return {
        x: rect.x * scale,
        y: (pageHeightPts - rect.y - rect.height) * scale,
        width: rect.width * scale,
        height: rect.height * scale,
    };
}

function assertValidRect(rect: RedactionRect, pageNumber: number): void {
    const { x, y, width, height } = rect;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        throw new Error(`Invalid redaction box on page ${pageNumber}.`);
    }
}

/** Render pixels-per-point for the rasterized replacement page. Higher keeps unredacted content on that page legible; qpdf/pdf-lib both work in points so this only affects raster quality. */
const EXPORT_SCALE = 2;

/** Rasterizes one page with its redaction boxes baked in, returning the PNG bytes plus the page's true size in points (derived from the same render, not assumed from anywhere else). */
async function rasterizeRedactedPage(
    file: File,
    pageNumber: number,
    rects: RedactionRect[],
    password: string | undefined,
): Promise<{ bytes: Uint8Array; widthPts: number; heightPts: number }> {
    const [rendered] = await renderPdfPages(file, {
        scale: EXPORT_SCALE,
        pageNumbers: [pageNumber],
        password,
    });
    const widthPts = rendered.width / EXPORT_SCALE;
    const heightPts = rendered.height / EXPORT_SCALE;

    const bitmap = await createImageBitmap(new Blob([rendered.bytes], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('This browser could not provide a 2D canvas to render into.');
    }
    ctx.drawImage(bitmap, 0, 0);
    ctx.fillStyle = '#000000';
    for (const rect of rects) {
        const px = toPixelRect(rect, heightPts, EXPORT_SCALE);
        ctx.fillRect(px.x, px.y, px.width, px.height);
    }

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
        throw new Error('Could not encode the redacted page.');
    }
    return { bytes: new Uint8Array(await blob.arrayBuffer()), widthPts, heightPts };
}

/**
 * Applies redaction boxes to a PDF (F-16). `redactions` maps a 1-based page
 * number to the boxes to black out (and permanently delete) on that page.
 * Pages absent from `redactions`, or mapped to an empty array, are copied
 * through untouched — their original text layer survives.
 *
 * @param file The PDF file to redact.
 * @param redactions Which boxes to redact, by 1-based page number.
 * @param password The password, if the file is encrypted.
 * @returns A Blob of the redacted PDF file.
 */
export async function redactPdf(
    file: File,
    redactions: Record<number, RedactionRect[]>,
    password?: string,
): Promise<Blob> {
    const targetPages = Object.entries(redactions)
        .filter(([, rects]) => rects.length > 0)
        .map(([pageNumber]) => Number(pageNumber));

    if (targetPages.length === 0) {
        throw new Error('Draw at least one redaction box before applying.');
    }

    const sourceDoc = await loadPdf(file, password);
    const pageCount = sourceDoc.getPageCount();
    for (const pageNumber of targetPages) {
        if (pageNumber < 1 || pageNumber > pageCount) {
            throw new Error(`Page ${pageNumber} is outside this ${pageCount}-page document.`);
        }
        for (const rect of redactions[pageNumber]) {
            assertValidRect(rect, pageNumber);
        }
    }

    const outDoc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
        const pageNumber = i + 1;
        const rects = redactions[pageNumber];
        if (rects && rects.length > 0) {
            const { bytes, widthPts, heightPts } = await rasterizeRedactedPage(file, pageNumber, rects, password);
            const image = await outDoc.embedPng(bytes);
            const page = outDoc.addPage([widthPts, heightPts]);
            page.drawImage(image, { x: 0, y: 0, width: widthPts, height: heightPts });
        } else {
            const [copied] = await outDoc.copyPages(sourceDoc, [i]);
            outDoc.addPage(copied);
        }
    }

    const pdfBytes = await outDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}
