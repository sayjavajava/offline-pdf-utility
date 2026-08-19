/**
 * Public PDF API.
 *
 * Each operation runs in a Web Worker when one is available, so a large
 * document does not freeze the UI (P2-24), and falls back to running inline
 * when it is not — which is what happens under jsdom in the test suite, and
 * on any browser that refuses to start the worker.
 *
 * The implementations themselves live in `pdf-ops.ts` and are imported by both
 * this module and the worker. Tests target this module, so they exercise the
 * fallback path; the worker path is covered by the browser checks.
 */
import * as ops from './pdf-ops';
import { convertDocxToPdf as convertDocxToPdfImpl } from './docx-convert';
import { redactPdf as redactPdfImpl } from './pdf-redact';
import { comparePdfs as comparePdfsImpl } from './pdf-compare';
import { runInWorker, workerAvailable } from './run-in-worker';

export type {
  ParsePageRangeResult,
  WatermarkOptions,
  PageNumberFormat,
  PageNumberOptions,
  PageNumberPosition,
  SplitPage,
  PdfPermissions,
  CropMargins,
  PaperSize,
} from './pdf-ops';
export type { ExtractedImage, ExtractImagesResult } from './image-extract';
export type { RedactionRect } from './pdf-redact';
export type { PageComparison, CompareResult } from './pdf-compare';

// Pure and cheap — no reason to pay a round trip.
export const parsePageRange = ops.parsePageRange;
export const formatPageNumber = ops.formatPageNumber;
export const detectImageFormat = ops.detectImageFormat;
export const PAPER_SIZES = ops.PAPER_SIZES;

/**
 * Route one operation through the worker, falling back to a direct call.
 *
 * A worker that fails to start must never take the feature down with it, so
 * any failure to dispatch falls through to the inline implementation.
 */
async function run<K extends keyof typeof ops>(
  op: K,
  args: Parameters<Extract<(typeof ops)[K], (...a: never[]) => unknown>>,
): Promise<Awaited<ReturnType<Extract<(typeof ops)[K], (...a: never[]) => unknown>>>> {
  const direct = () =>
    (ops[op] as unknown as (...a: unknown[]) => Promise<unknown>)(...(args as unknown[]));

  if (!workerAvailable()) return direct() as never;
  try {
    return (await runInWorker(op as string, args as unknown[])) as never;
  } catch (error) {
    // A genuine operation error (bad password, invalid range) must surface as
    // itself; only a transport failure justifies retrying on the main thread.
    if (error instanceof Error && !(error as { workerTransportFailure?: boolean }).workerTransportFailure) {
      throw error;
    }
    return direct() as never;
  }
}

export const splitPdf = (...a: Parameters<typeof ops.splitPdf>) => run('splitPdf', a);
export const splitPdfToZip = (...a: Parameters<typeof ops.splitPdfToZip>) => run('splitPdfToZip', a);
export const mergePdf = (...a: Parameters<typeof ops.mergePdf>) => run('mergePdf', a);
export const removePdfPassword = (...a: Parameters<typeof ops.removePdfPassword>) =>
  run('removePdfPassword', a);
export const protectPdf = (...a: Parameters<typeof ops.protectPdf>) => run('protectPdf', a);
export const protectPdfWithPermissions = (...a: Parameters<typeof ops.protectPdfWithPermissions>) =>
  run('protectPdfWithPermissions', a);
export const compressPdf = (...a: Parameters<typeof ops.compressPdf>) => run('compressPdf', a);
export const editPdfMetadata = (...a: Parameters<typeof ops.editPdfMetadata>) =>
  run('editPdfMetadata', a);
export const convertImageToPdf = (...a: Parameters<typeof ops.convertImageToPdf>) =>
  run('convertImageToPdf', a);
export const addWatermark = (...a: Parameters<typeof ops.addWatermark>) => run('addWatermark', a);
export const rotatePdf = (...a: Parameters<typeof ops.rotatePdf>) => run('rotatePdf', a);
export const rearrangePdf = (...a: Parameters<typeof ops.rearrangePdf>) => run('rearrangePdf', a);
export const addPageNumbers = (...a: Parameters<typeof ops.addPageNumbers>) =>
  run('addPageNumbers', a);
export const extractImages = (...a: Parameters<typeof ops.extractImages>) => run('extractImages', a);
export const cropPdf = (...a: Parameters<typeof ops.cropPdf>) => run('cropPdf', a);
export const resizePdf = (...a: Parameters<typeof ops.resizePdf>) => run('resizePdf', a);

/**
 * DOCX conversion stays on the main thread: docx-layout.ts's HTML parsing
 * needs `DOMParser`, which is not available in a dedicated Worker's global
 * scope (confirmed in a real browser — see docx-convert.ts).
 */
export const convertDocxToPdf = convertDocxToPdfImpl;

/**
 * Redaction also stays on the main thread: it rasterizes via pdf.js, which
 * needs a canvas the app's own Worker (F-9) has no access to — same
 * constraint pdf-render.ts documents for F-4/F-5.
 */
export const redactPdf = redactPdfImpl;

/**
 * Comparison also stays on the main thread (F-19): it renders both files via
 * pdf.js and decodes the result back to pixels for a visual diff, both of
 * which need a canvas — same constraint as redactPdf above.
 */
export const comparePdfs = comparePdfsImpl;
