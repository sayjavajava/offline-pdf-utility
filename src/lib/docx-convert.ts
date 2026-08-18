/**
 * DOCX -> PDF conversion (F-12).
 *
 * Kept out of `pdf-ops.ts` — and so out of the PDF worker — on purpose.
 * docx-layout.ts's HTML parsing uses `DOMParser`, which turns out *not* to be
 * available in a dedicated Worker's global scope in Chromium (confirmed by
 * running it there: `DOMParser is not defined`, thrown inside the worker).
 * jsdom does provide `DOMParser`, which is exactly why this looked
 * worker-safe under the unit tests and only failed for real in a browser —
 * the same class of mistake this app's audit has hit before (see P0-1, F-1):
 * a Node/jsdom-only assumption stated as a fact. Runs on the main thread,
 * like the rasterizing pipeline this replaces did (for a different reason —
 * that one needed html2canvas and a live DOM to render into).
 */
import mammoth from 'mammoth';
import { layoutHtmlToPdf } from './docx-layout';

/**
 * Converts a DOCX file to a PDF with genuinely selectable, searchable text —
 * see docx-layout.ts for the layout engine and its documented scope.
 *
 * @returns A Blob of the PDF plus any non-blocking warnings — mammoth's own
 * (unsupported source formatting) followed by the layout engine's
 * (unencodable characters, skipped images).
 */
export async function convertDocxToPdf(file: File): Promise<{ blob: Blob; warnings: string[] }> {
    const arrayBuffer = await file.arrayBuffer();
    // mammoth ships two builds selected by bundler ("browser" field): the
    // browser build's openZip only recognises `arrayBuffer`, the Node build
    // (what Vitest resolves to under jsdom, which does not honor that field)
    // only recognises `buffer`/`path`/`file`. Passing both keys satisfies
    // whichever one actually loads, in the real app and under test alike.
    const { value: html, messages } = await mammoth.convertToHtml({ arrayBuffer, buffer: arrayBuffer });
    const { bytes, warnings: layoutWarnings } = await layoutHtmlToPdf(html);

    const mammothWarnings = (messages ?? [])
        .map((m: { message?: string }) => m.message)
        .filter((m: string | undefined): m is string => Boolean(m));

    return { blob: new Blob([bytes], { type: 'application/pdf' }), warnings: [...mammothWarnings, ...layoutWarnings] };
}
