// @cantoo/pdf-lib rather than upstream pdf-lib: it is an API-compatible fork
// that implements the standard security handler, so encrypted documents can
// actually be opened. Upstream has no `password` load option at all.
import { PDFDocument } from '@cantoo/pdf-lib';
import mammoth from 'mammoth';
import html2pdf from 'html2pdf.js';

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
 * Parses a page range string (e.g., "1, 3-5, 8") into an array of 0-based page indices.
 * @param rangeStr The page range string.
 * @param maxPages The total number of pages in the document.
 * @returns An array of 0-based page indices.
 */
function parsePageRange(rangeStr: string, maxPages: number): number[] {
    const indices = new Set<number>();
    const ranges = rangeStr.split(',');

    for (let range of ranges) {
        range = range.trim();
        if (range.includes('-')) {
            const [start, end] = range.split('-').map(n => parseInt(n.trim(), 10));
            if (!isNaN(start) && !isNaN(end) && start <= end && start >= 1 && end <= maxPages) {
                for (let i = start; i <= end; i++) {
                    indices.add(i - 1);
                }
            }
        } else {
            const page = parseInt(range, 10);
            if (!isNaN(page) && page >= 1 && page <= maxPages) {
                indices.add(page - 1);
            }
        }
    }

    return Array.from(indices).sort((a, b) => a - b);
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
    const pageIndices = pages.toLowerCase() === 'all' 
        ? Array.from({ length: pageCount }, (_, i) => i) 
        : parsePageRange(pages, pageCount);

    if (pageIndices.length === 0) {
        throw new Error('Invalid page range specified.');
    }

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach(page => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
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
        // Routed through the shared loader so an encrypted member reports the
        // readable message rather than a raw library throw. Naming the offending
        // file in the error is a separate fix (see the audit's P1-12).
        const pdfDoc = await loadPdf(file);
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
 * Converts an image file (JPEG or PNG) to a PDF.
 * @param file The image file to convert.
 * @returns A Blob of the new PDF file.
 */
export async function convertImageToPdf(file: File): Promise<Blob> {
    const pdfDoc = await PDFDocument.create();
    const imageBytes = await file.arrayBuffer();
    let image;
    if (file.type === 'image/jpeg') {
        image = await pdfDoc.embedJpg(imageBytes);
    } else if (file.type === 'image/png') {
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
 * Converts a DOCX file to a PDF.
 * @param file The DOCX file to convert.
 * @returns A Blob of the new PDF file.
 */
export async function convertDocxToPdf(file: File): Promise<Blob> {
    const arrayBuffer = await file.arrayBuffer();
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

    const element = document.createElement('div');
    element.innerHTML = html;

    const pdfBlob = await html2pdf().from(element).output('blob');
    return pdfBlob;
}

/**
 * Adds a text watermark to each page of a PDF.
 * @param file The PDF file.
 * @param text The watermark text.
 * @param options Options for the watermark (fontSize, color, opacity).
 * @param password An optional password for encrypted PDFs.
 * @returns A Blob of the new PDF file with the watermark.
 */
export async function addWatermark(
    file: File,
    text: string,
    options: { fontSize: number; color: [number, number, number]; opacity: number },
    password?: string
): Promise<Blob> {
    const pdfDoc = await loadPdf(file, password);

    const helveticaFont = await pdfDoc.embedFont('Helvetica-Bold');
    const pages = pdfDoc.getPages();

    for (const page of pages) {
        const { width, height } = page.getSize();
        page.drawText(text, {
            x: width / 2 - (text.length * options.fontSize) / 4,
            y: height / 2,
            font: helveticaFont,
            size: options.fontSize,
            color: { type: 'RGB', red: options.color[0], green: options.color[1], blue: options.color[2] },
            opacity: options.opacity,
        });
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

