/**
 * DOCX -> PDF conversion.
 *
 * Kept out of `pdf-ops.ts` on purpose. It renders HTML through html2canvas, so
 * it needs a DOM and cannot run in the worker; and html2pdf.js code-splits,
 * which a classic (iife) worker bundle cannot contain. Isolating it here keeps
 * the worker's import graph free of both problems.
 */
import mammoth from 'mammoth';
import html2pdf from 'html2pdf.js';

/**
 * Converts a DOCX file to a PDF.
 *
 * Output is a rasterized image of each page (html2canvas → jsPDF), so text is
 * not selectable. Callers should surface that limitation in the UI (P1-16).
 *
 * @returns The PDF blob plus any non-blocking mammoth warnings.
 */
export async function convertDocxToPdf(
    file: File,
): Promise<{ blob: Blob; warnings: string[] }> {
    const arrayBuffer = await file.arrayBuffer();
    const { value: html, messages } = await mammoth.convertToHtml({ arrayBuffer });

    const element = document.createElement('div');
    element.innerHTML = html;
    // Print-oriented stylesheet so tables/images fit A4 with margins (P1-16).
    element.setAttribute(
        'style',
        [
            'font-family: Helvetica, Arial, sans-serif',
            'font-size: 12pt',
            'line-height: 1.4',
            'color: #111',
            'max-width: 100%',
            'word-wrap: break-word',
        ].join(';'),
    );
    element.querySelectorAll('table').forEach((table) => {
        (table as HTMLElement).style.width = '100%';
        (table as HTMLElement).style.tableLayout = 'fixed';
        (table as HTMLElement).style.borderCollapse = 'collapse';
    });
    element.querySelectorAll('img').forEach((img) => {
        (img as HTMLElement).style.maxWidth = '100%';
        (img as HTMLElement).style.height = 'auto';
    });

    const pdfBlob: Blob = await html2pdf()
        .set({
            margin: [15, 15, 15, 15],
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] },
            html2canvas: { scale: 2 },
        })
        .from(element)
        .output('blob');

    const warnings = (messages ?? [])
        .map((m: { message?: string }) => m.message)
        .filter((m: string | undefined): m is string => Boolean(m));

    return { blob: pdfBlob, warnings };
}
