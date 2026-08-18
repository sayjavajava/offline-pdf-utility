// @cantoo/pdf-lib rather than upstream pdf-lib: it is an API-compatible fork
// that implements the standard security handler, so encrypted documents can
// actually be opened. Upstream has no `password` load option at all.
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { extractImagesFromDocument, type ExtractImagesResult } from './image-extract';
import { encryptPdfBytes } from './qpdf-engine';

/**
 * Loads a PDF, decrypting it when a password is supplied.
 *
 * The password is always passed through, including as an empty string: an
 * empty user password is a real thing that genuinely opens some encrypted
 * files, and is distinct from supplying no password at all. Passing an empty
 * password to an unencrypted document is harmless.
 *
 * Failures are mapped to three distinct outcomes, because collapsing them is
 * what made the old code unusable — a user with the correct password was told
 * to re-enter it forever:
 *
 *   - encrypted, and the caller supplied nothing  -> ask for a password
 *   - encrypted, and the supplied password is wrong -> say it is wrong
 *   - anything else (a corrupt file, say)          -> rethrow untouched, so a
 *     parse error is never mislabelled as a password problem
 */
async function loadPdf(file: File, password?: string): Promise<PDFDocument> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const supplied = password ?? '';

    try {
        return await PDFDocument.load(bytes, { password: supplied });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // The library reports "Password incorrect" for a wrong password, and
        // either "NEEDS PASSWORD" or an EncryptedPDFError ("...is encrypted")
        // when it has nothing usable to try. Which of the two you get depends
        // on whether an empty password was passed, so both are handled.
        const needsPassword = /needs password/i.test(message) || /encrypted/i.test(message);
        const wrongPassword = /password incorrect/i.test(message);

        if (needsPassword || (wrongPassword && supplied === '')) {
            throw new Error('This PDF is password protected. Enter its password to continue.');
        }
        if (wrongPassword) {
            throw new Error('Incorrect password for this PDF.');
        }
        throw error;
    }
}

/**
 * Guard against silently unrenderable text.
 *
 * The standard PDF fonts are WinAnsi-encoded, and @cantoo/pdf-lib does not
 * throw on a glyph it cannot encode — it substitutes '?'. Without this check a
 * CJK or emoji input produces a document full of question marks and reports
 * success (P0-4).
 */
function assertEncodable(
    font: { encodeText: (text: string) => { asString: () => string } },
    text: string,
    label: string,
): void {
    const offending = [...text].find((ch) => {
        if (ch === '?') return false;
        return font.encodeText(ch).asString() === '3F';
    });
    if (offending !== undefined) {
        throw new Error(
            `The ${label} contains characters this font cannot render (${offending}). Use Latin characters, or choose a different font.`,
        );
    }
}

export type ParsePageRangeResult = {
    /** 0-based page indices, in the order the user asked for (P1-7). */
    indices: number[];
    /** Human-readable problems for any rejected segment (P1-6). */
    errors: string[];
};

/**
 * Parses a page range string (e.g., "1, 3-5, 8") into 0-based page indices.
 *
 * Deliberate behaviour (P1-7): input order is preserved and duplicates are kept.
 * `"5,1"` → `[4, 0]`; `"1,1"` → `[0, 0]`. A single expanded range still yields
 * each page once (`"1-3"` → `[0, 1, 2]`).
 *
 * Invalid segments are collected into `errors` rather than silently dropped
 * (P1-6), so partial invalidity like `"1-3, 99"` is reported instead of quietly
 * returning only pages 1–3.
 */
export function parsePageRange(rangeStr: string, maxPages: number): ParsePageRangeResult {
    const indices: number[] = [];
    const errors: string[] = [];
    const outOfRange: number[] = [];

    for (let range of rangeStr.split(',')) {
        range = range.trim();
        if (range === '') continue;

        if (range.includes('-')) {
            const parts = range.split('-');
            if (parts.length !== 2) {
                errors.push(`Could not understand "${range}" in the page range.`);
                continue;
            }
            const start = parseInt(parts[0].trim(), 10);
            const end = parseInt(parts[1].trim(), 10);
            if (Number.isNaN(start) || Number.isNaN(end) || !/^\d+$/.test(parts[0].trim()) || !/^\d+$/.test(parts[1].trim())) {
                errors.push(`Could not understand "${range}" in the page range.`);
                continue;
            }
            if (start > end) {
                errors.push(`"${range}" is backwards — did you mean ${end}-${start}?`);
                continue;
            }
            if (start < 1 || end > maxPages) {
                for (let i = start; i <= end; i++) {
                    if (i < 1 || i > maxPages) outOfRange.push(i);
                }
                continue;
            }
            for (let i = start; i <= end; i++) {
                indices.push(i - 1);
            }
        } else {
            if (!/^\d+$/.test(range)) {
                errors.push(`Could not understand "${range}" in the page range.`);
                continue;
            }
            const page = parseInt(range, 10);
            if (page < 1 || page > maxPages) {
                outOfRange.push(page);
                continue;
            }
            indices.push(page - 1);
        }
    }

    if (outOfRange.length > 0) {
        const listed = [...new Set(outOfRange)];
        // A wide range like "1-1000" would otherwise enumerate every page past
        // the end, producing a multi-thousand-character message in a toast.
        const MAX_LISTED = 8;
        const shown = listed.slice(0, MAX_LISTED).join(', ');
        const remaining = listed.length - MAX_LISTED;

        errors.push(
            listed.length === 1
                ? `Page ${shown} is outside this ${maxPages}-page document.`
                : `Pages ${shown}${remaining > 0 ? ` and ${remaining} more` : ''} are outside this ${maxPages}-page document.`,
        );
    }

    return { indices, errors };
}

/**
 * Splits a PDF file based on a given page range.
 * @param file The PDF file to split.
 * @param pages The page range string (e.g., "1, 3-5, 8").
 * @param password An optional password for encrypted PDFs.
 * @returns A Blob of the new PDF file.
 */
export async function splitPdf(file: File, pages: string, password?: string): Promise<Blob> {
    const pdfDoc = await loadPdf(file, password);

    const pageCount = pdfDoc.getPageCount();
    let pageIndices: number[];

    if (pages.toLowerCase() === 'all') {
        pageIndices = Array.from({ length: pageCount }, (_, i) => i);
    } else {
        const parsed = parsePageRange(pages, pageCount);
        if (parsed.errors.length > 0) {
            throw new Error(parsed.errors.join(' '));
        }
        pageIndices = parsed.indices;
    }

    if (pageIndices.length === 0) {
        throw new Error('Invalid page range specified.');
    }

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach(page => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

export type SplitPage = {
    /** 1-based original page number, for filenames and messages. */
    pageNumber: number;
    bytes: Uint8Array;
};

/**
 * Splits a PDF the same way `splitPdf` does, but returns each selected page
 * as its own single-page PDF (F-13) instead of one combined file.
 *
 * From issue #2: a user expected Split to hand back individual files and
 * read the single combined output as a bug. It wasn't — `splitPdf` extracts
 * a page *range* into one document, which is genuinely different from what
 * this function does. Sharing the exact resolution block above means both
 * modes agree on what a given range string means and on their error text;
 * only the packaging differs.
 *
 * Packaging (bare file vs. zip) is a UI concern and is left to the caller —
 * see ExtractImagesTool and PdfToImagesTool for the established pattern.
 */
export async function splitPdfToZip(file: File, pages: string, password?: string): Promise<SplitPage[]> {
    const pdfDoc = await loadPdf(file, password);

    const pageCount = pdfDoc.getPageCount();
    let pageIndices: number[];

    if (pages.toLowerCase() === 'all') {
        pageIndices = Array.from({ length: pageCount }, (_, i) => i);
    } else {
        const parsed = parsePageRange(pages, pageCount);
        if (parsed.errors.length > 0) {
            throw new Error(parsed.errors.join(' '));
        }
        pageIndices = parsed.indices;
    }

    if (pageIndices.length === 0) {
        throw new Error('Invalid page range specified.');
    }

    const result: SplitPage[] = [];
    for (const pageIndex of pageIndices) {
        const single = await PDFDocument.create();
        const [copied] = await single.copyPages(pdfDoc, [pageIndex]);
        single.addPage(copied);
        result.push({ pageNumber: pageIndex + 1, bytes: await single.save() });
    }
    return result;
}

/**
 * Merges multiple PDF files into a single document.
 * @param files An array of PDF files to merge.
 * @returns A Blob of the merged PDF file.
 */
export async function mergePdf(files: File[]): Promise<Blob> {
    if (files.length < 2) {
        throw new Error('Please select at least 2 PDF files to merge.');
    }

    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
        // loadPdf already maps encryption failures to readable messages (P0-3).
        // Wrap so the user knows *which* of N files failed (P1-12).
        let pdfDoc: PDFDocument;
        try {
            pdfDoc = await loadPdf(file);
        } catch (cause) {
            const detail = cause instanceof Error ? cause.message : String(cause);
            throw new Error(`Could not read "${file.name}": ${detail}`, { cause });
        }
        const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
        copiedPages.forEach(page => mergedPdf.addPage(page));
    }

    const pdfBytes = await mergedPdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Removes password protection from an encrypted PDF.
 *
 * Named for what it does: it strips protection, it cannot add it. Adding a
 * password needs an engine that can *write* encryption, which neither pdf-lib
 * nor this fork can do.
 *
 * @param file The encrypted PDF file.
 * @param password The password that opens the PDF.
 * @returns A Blob of the decrypted PDF file.
 */
export async function removePdfPassword(file: File, password?: string): Promise<Blob> {
    const pdfDoc = await loadPdf(file, password);

    // Re-saving the document without any encryption options effectively removes the password.
    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Adds password protection to a PDF (F-1) — the counterpart to
 * removePdfPassword, and the one direction @cantoo/pdf-lib cannot do at all:
 * it can read encryption but has no SaveOptions for writing it. This goes
 * through qpdf compiled to WASM instead (see qpdf-engine.ts for how its
 * binary is loaded without any network access).
 *
 * Encrypts with AES-256. The input must not already be encrypted — qpdf
 * needs its own password to open an encrypted input first, and this tool
 * does not collect one; the error tells the user to unlock it first instead.
 *
 * @param file The PDF file to protect.
 * @param password The password required to open the protected PDF.
 * @returns A Blob of the newly encrypted PDF file.
 */
export async function protectPdf(file: File, password: string): Promise<Blob> {
    if (!password) {
        throw new Error('Enter a password.');
    }
    if (password.length < 4) {
        throw new Error('Use a password of at least 4 characters.');
    }

    const inputBytes = new Uint8Array(await file.arrayBuffer());
    const outputBytes = await encryptPdfBytes(inputBytes, password);
    return new Blob([outputBytes], { type: 'application/pdf' });
}

/**
 * Edits the metadata of a PDF file.
 * @param file The PDF file to edit.
 * @param metadata The new metadata to apply.
 * @param password An optional password for encrypted PDFs.
 * @returns A Blob of the new PDF file with updated metadata.
 */
export async function editPdfMetadata(
    file: File, 
    metadata: { [key: string]: string },
    password?: string
): Promise<Blob> {
    const pdfDoc = await loadPdf(file, password);

    if (metadata.title) pdfDoc.setTitle(metadata.title);
    if (metadata.author) pdfDoc.setAuthor(metadata.author);
    if (metadata.subject) pdfDoc.setSubject(metadata.subject);
    if (metadata.keywords) pdfDoc.setKeywords(metadata.keywords.split(',').map(k => k.trim()));
    if (metadata.producer) pdfDoc.setProducer(metadata.producer);
    if (metadata.creator) pdfDoc.setCreator(metadata.creator);

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Resolve an image's format by magic bytes → extension → MIME (P1-15).
 * Browsers often report an empty `type` when the OS has no MIME mapping.
 */
export type ImageFormat = 'jpeg' | 'png';

export function detectImageFormat(file: File, bytes: ArrayBuffer): ImageFormat | null {
    const header = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
    const isJpeg =
        header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const isPng =
        header.length >= 8 &&
        header[0] === 0x89 &&
        header[1] === 0x50 &&
        header[2] === 0x4e &&
        header[3] === 0x47 &&
        header[4] === 0x0d &&
        header[5] === 0x0a &&
        header[6] === 0x1a &&
        header[7] === 0x0a;

    if (isJpeg) return 'jpeg';
    if (isPng) return 'png';

    const name = file.name.toLowerCase();
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpeg';
    if (name.endsWith('.png')) return 'png';

    if (file.type === 'image/jpeg') return 'jpeg';
    if (file.type === 'image/png') return 'png';

    return null;
}

/**
 * Converts an image file (JPEG or PNG) to a PDF.
 * @param file The image file to convert.
 * @returns A Blob of the new PDF file.
 */
export async function convertImageToPdf(file: File): Promise<Blob> {
    const pdfDoc = await PDFDocument.create();
    const imageBytes = await file.arrayBuffer();
    const format = detectImageFormat(file, imageBytes);

    let image;
    if (format === 'jpeg') {
        image = await pdfDoc.embedJpg(imageBytes);
    } else if (format === 'png') {
        image = await pdfDoc.embedPng(imageBytes);
    } else {
        throw new Error('Unsupported image type. Please use JPEG or PNG.');
    }

    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}


/**
 * Adds a text watermark to each page of a PDF.
 * @param file The PDF file.
 * @param text The watermark text.
 * @param options Options for the watermark (fontSize, color, opacity).
 * @param password An optional password for encrypted PDFs.
 * @returns A Blob of the new PDF file with the watermark.
 */
export type WatermarkOptions = {
    fontSize: number;
    /** RGB, each channel 0–1. */
    color: [number, number, number];
    opacity: number;
    /** Degrees counter-clockwise. 45 gives the conventional diagonal stamp. */
    rotation?: number;
    /** Repeat the text across the whole page instead of stamping it once. */
    tile?: boolean;
};

export async function addWatermark(
    file: File,
    text: string,
    options: WatermarkOptions,
    password?: string
): Promise<Blob> {
    if (!text || !text.trim()) {
        throw new Error('Enter watermark text.');
    }
    if (!Number.isFinite(options.opacity) || options.opacity < 0 || options.opacity > 1) {
        throw new Error('Opacity must be between 0 and 1.');
    }
    if (!Number.isFinite(options.fontSize) || options.fontSize <= 0 || options.fontSize > 300) {
        throw new Error('Font size must be between 1 and 300.');
    }
    const rotation = options.rotation ?? 0;
    if (!Number.isFinite(rotation) || rotation < -360 || rotation > 360) {
        throw new Error('Rotation must be between -360 and 360 degrees.');
    }
    if (options.color.length !== 3 || options.color.some((c) => !Number.isFinite(c) || c < 0 || c > 1)) {
        throw new Error('Watermark colour channels must each be between 0 and 1.');
    }

    const pdfDoc = await loadPdf(file, password);

    const helveticaFont = await pdfDoc.embedFont('Helvetica-Bold');

    assertEncodable(helveticaFont, text, 'watermark text');

    const pages = pdfDoc.getPages();
    const textWidth = helveticaFont.widthOfTextAtSize(text, options.fontSize);
    const radians = (rotation * Math.PI) / 180;
    const common = {
        font: helveticaFont,
        size: options.fontSize,
        color: { type: 'RGB', red: options.color[0], green: options.color[1], blue: options.color[2] },
        opacity: options.opacity,
        rotate: degrees(rotation),
    };

    for (const page of pages) {
        const { width, height } = page.getSize();

        if (options.tile) {
            // Step by the text's own footprint so stamps do not overlap, with a
            // gutter proportional to the font size.
            const stepX = Math.max(textWidth, options.fontSize) + options.fontSize * 2;
            const stepY = options.fontSize * 4;
            for (let y = 0; y < height + stepY; y += stepY) {
                for (let x = 0; x < width + stepX; x += stepX) {
                    page.drawText(text, { ...common, x, y });
                }
            }
            continue;
        }

        // drawText rotates about its own origin, so centring a rotated stamp
        // means walking back half the text's length along the rotated axis
        // rather than simply halving the page width.
        page.drawText(text, {
            ...common,
            x: width / 2 - (textWidth / 2) * Math.cos(radians),
            y: height / 2 - (textWidth / 2) * Math.sin(radians),
        });
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

const ALLOWED_ROTATIONS = new Set([90, 180, 270, -90, -180, -270]);

/**
 * Rotate selected pages (or all pages) by a multiple of 90° (F-2).
 * Rotation is applied relative to each page's current angle.
 */
export async function rotatePdf(
    file: File,
    angle: number,
    pages = 'all',
    password?: string,
): Promise<Blob> {
    if (!ALLOWED_ROTATIONS.has(angle)) {
        throw new Error('Rotation angle must be 90, 180, or 270 degrees.');
    }

    const pdfDoc = await loadPdf(file, password);
    const pageCount = pdfDoc.getPageCount();
    let indices: number[];

    if (pages.toLowerCase() === 'all' || pages.trim() === '') {
        indices = Array.from({ length: pageCount }, (_, i) => i);
    } else {
        const parsed = parsePageRange(pages, pageCount);
        if (parsed.errors.length > 0) throw new Error(parsed.errors.join(' '));
        if (parsed.indices.length === 0) throw new Error('Invalid page range specified.');
        indices = [...new Set(parsed.indices)];
    }

    for (const i of indices) {
        const page = pdfDoc.getPage(i);
        const current = page.getRotation().angle;
        page.setRotation(degrees(current + angle));
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Rebuild a PDF keeping only the pages listed, in that order (F-3).
 * Omitting a page deletes it; reordering / duplicating follows P1-7.
 */
export async function rearrangePdf(
    file: File,
    pages: string,
    password?: string,
): Promise<Blob> {
    if (!pages || !pages.trim()) {
        throw new Error('Enter the pages to keep, in the desired order.');
    }

    const pdfDoc = await loadPdf(file, password);
    const pageCount = pdfDoc.getPageCount();
    const parsed = parsePageRange(pages, pageCount);
    if (parsed.errors.length > 0) throw new Error(parsed.errors.join(' '));
    if (parsed.indices.length === 0) throw new Error('Invalid page range specified.');

    const newPdf = await PDFDocument.create();
    const copied = await newPdf.copyPages(pdfDoc, parsed.indices);
    copied.forEach((page) => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}


export type PageNumberFormat = 'n' | 'n-of-total' | 'bates';

export type PageNumberPosition =
    | 'bottom-center'
    | 'bottom-left'
    | 'bottom-right'
    | 'top-center'
    | 'top-left'
    | 'top-right';

export type PageNumberOptions = {
    format?: PageNumberFormat;
    /** Number given to the first stamped page. Default 1. */
    start?: number;
    /** Text before the number — a matter case for Bates, e.g. "ABC-". */
    prefix?: string;
    /** Zero-padding width for the `bates` format. Default 6. */
    digits?: number;
    position?: PageNumberPosition;
    fontSize?: number;
    /** Distance from the page edge, in points. Default 36 (half an inch). */
    margin?: number;
    color?: [number, number, number];
    /** Which pages to stamp, as a page range. Defaults to every page. */
    pages?: string;
};

/** Render the label for one stamp. Exported so the UI can preview it (F-6). */
export function formatPageNumber(
    value: number,
    total: number,
    options: PageNumberOptions = {},
): string {
    const prefix = options.prefix ?? '';
    switch (options.format ?? 'n') {
        case 'bates':
            return `${prefix}${String(value).padStart(options.digits ?? 6, '0')}`;
        case 'n-of-total':
            return `${prefix}${value} of ${total}`;
        default:
            return `${prefix}${value}`;
    }
}

/**
 * Stamps sequential page numbers, or Bates numbers, onto a PDF (F-6).
 *
 * Shares the drawing path, font handling and encoding guard with addWatermark
 * rather than duplicating them.
 */
export async function addPageNumbers(
    file: File,
    options: PageNumberOptions = {},
    password?: string,
): Promise<Blob> {
    const fontSize = options.fontSize ?? 12;
    const margin = options.margin ?? 36;
    const start = options.start ?? 1;
    const color = options.color ?? [0, 0, 0];

    if (!Number.isFinite(fontSize) || fontSize <= 0 || fontSize > 300) {
        throw new Error('Font size must be between 1 and 300.');
    }
    if (!Number.isFinite(margin) || margin < 0 || margin > 300) {
        throw new Error('Margin must be between 0 and 300 points.');
    }
    if (!Number.isInteger(start) || start < 0) {
        throw new Error('Starting number must be a whole number of 0 or more.');
    }
    if (options.digits !== undefined && (!Number.isInteger(options.digits) || options.digits < 1 || options.digits > 20)) {
        throw new Error('Bates padding must be between 1 and 20 digits.');
    }
    if (color.length !== 3 || color.some((c) => !Number.isFinite(c) || c < 0 || c > 1)) {
        throw new Error('Colour channels must each be between 0 and 1.');
    }

    const pdfDoc = await loadPdf(file, password);
    const pages = pdfDoc.getPages();

    // Which pages get a stamp. Numbering still counts from `start` across the
    // stamped pages only, which is what "number these pages" is taken to mean.
    let targets: number[];
    if (options.pages && options.pages.trim() && options.pages.trim().toLowerCase() !== 'all') {
        const parsed = parsePageRange(options.pages, pages.length);
        if (parsed.errors.length > 0) throw new Error(parsed.errors.join(' '));
        targets = parsed.indices;
    } else {
        targets = pages.map((_, i) => i);
    }
    if (targets.length === 0) {
        throw new Error('No pages selected to number.');
    }

    const font = await pdfDoc.embedFont('Helvetica');
    if (options.prefix) assertEncodable(font, options.prefix, 'page-number prefix');

    const position = options.position ?? 'bottom-center';

    targets.forEach((pageIndex, ordinal) => {
        const page = pages[pageIndex];
        const { width, height } = page.getSize();
        const label = formatPageNumber(start + ordinal, targets.length, options);
        const labelWidth = font.widthOfTextAtSize(label, fontSize);

        const x = position.endsWith('left')
            ? margin
            : position.endsWith('right')
              ? width - margin - labelWidth
              : (width - labelWidth) / 2;
        // For a top stamp the margin is measured from the top edge down to the
        // baseline, so the glyph height has to come off it.
        const y = position.startsWith('top') ? height - margin - fontSize : margin;

        page.drawText(label, {
            x,
            y,
            font,
            size: fontSize,
            color: { type: 'RGB', red: color[0], green: color[1], blue: color[2] },
        });
    });

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Extracts the images embedded in a PDF (F-7).
 *
 * Read-only: the source document is not modified.
 */
export async function extractImages(
    file: File,
    password?: string,
): Promise<ExtractImagesResult> {
    const pdfDoc = await loadPdf(file, password);
    return extractImagesFromDocument(pdfDoc);
}
