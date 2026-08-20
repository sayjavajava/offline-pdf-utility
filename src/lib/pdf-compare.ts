/**
 * F-19: compare two PDFs page by page. Read-only — no write path through
 * `@cantoo/pdf-lib` or qpdf at all, so this cannot regress any other tool's
 * output. Runs on the main thread, like `pdf-render.ts` and `pdf-redact.ts`:
 * it needs a canvas to decode rendered pages back into pixels, which the
 * app's worker has no access to.
 *
 * Two independent signals per shared page, not one combined verdict —
 * either can fire alone (a font-substitution can change text while
 * rendering pixel-identical; a color or layout change can differ visually
 * with the exact same text underneath):
 *   - text: extracted text differs (exact match after trimming each line)
 *   - visual: rendered pixels differ beyond a small per-channel tolerance
 *     that absorbs anti-aliasing/PNG-encode noise, not real content
 *
 * The text signal is only trustworthy when both pages render at the same
 * pixel dimensions. pdf.js's text extraction is bound by each page's own
 * MediaBox — confirmed directly against pdf.js, not assumed — so a page
 * that was resized (its content stream byte-for-byte identical, just a
 * smaller page around it) can come back with genuinely truncated text,
 * with nothing about the actual wording having changed. Reporting that as
 * "text differs" would tell the user their content changed when it didn't,
 * which is worse than reporting nothing: differently-sized pages are
 * therefore left out of the text comparison entirely (`textDiffers` is
 * `undefined`), not force-compared against an extraction that can't be
 * trusted there. The dimension mismatch is already reported via
 * `visuallyDiffers`, so nothing about the pages differing goes unreported.
 */
import { renderPdfPages, extractPdfText, getPageCount } from './pdf-render';

export type PageComparison =
  | { page: number; presence: 'onlyInA' }
  | { page: number; presence: 'onlyInB' }
  | {
      page: number;
      presence: 'both';
      /** Undefined when the two pages render at different pixel dimensions —
       * pdf.js's text extraction is clipped to each page's own MediaBox, so
       * a resized page can extract as "different text" with the underlying
       * wording unchanged. Not evaluated there rather than reported unreliably. */
      textDiffers?: boolean;
      visuallyDiffers: boolean;
      /** Fraction of compared pixels that differ, 0–1. Omitted when the two
       * pages render at different pixel dimensions — a pixel-by-pixel ratio
       * would be meaningless there, so that case is reported as differing
       * without a number attached. */
      pixelDiffRatio?: number;
    };

export type CompareResult = {
  pageCountA: number;
  pageCountB: number;
  pages: PageComparison[];
};

const COMPARE_SCALE = 0.5; // cheap and plenty to catch a real visual change
const PER_CHANNEL_TOLERANCE = 24; // absorbs PNG/anti-aliasing noise, not content

function normalizedText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

async function pngBytesToImageData(bytes: Uint8Array): Promise<ImageData> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not provide a 2D canvas to compare pages with.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function pixelDiffRatio(a: ImageData, b: ImageData): number {
  const pixels = a.data;
  const other = b.data;
  let differing = 0;
  const total = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    if (
      Math.abs(pixels[i] - other[i]) > PER_CHANNEL_TOLERANCE ||
      Math.abs(pixels[i + 1] - other[i + 1]) > PER_CHANNEL_TOLERANCE ||
      Math.abs(pixels[i + 2] - other[i + 2]) > PER_CHANNEL_TOLERANCE ||
      Math.abs(pixels[i + 3] - other[i + 3]) > PER_CHANNEL_TOLERANCE
    ) {
      differing++;
    }
  }
  return differing / total;
}

export async function comparePdfs(
  fileA: File,
  fileB: File,
  {
    passwordA,
    passwordB,
    onProgress,
  }: {
    passwordA?: string;
    passwordB?: string;
    /** Steps completed out of 4×commonPages (text + render, both files) —
     * not literally "pages compared" once batching is in play, just a
     * smoothly-increasing counter for a progress indicator. */
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<CompareResult> {
  const [pageCountA, pageCountB] = await Promise.all([
    getPageCount(fileA, passwordA),
    getPageCount(fileB, passwordB),
  ]);

  const commonPages = Math.min(pageCountA, pageCountB);
  const pageNumbers = Array.from({ length: commonPages }, (_, i) => i + 1);

  // One call per file per signal, covering every shared page, not one call
  // per page: pdf-render.ts opens the document fresh on every call, so
  // calling it per page reopens (and re-parses) the whole PDF that many
  // times over — the actual cost driver at scale, confirmed by benchmark
  // (see docs/PERFORMANCE.md). Batching cuts document opens from 4×N to 4.
  //
  // Each stream still reports its own onProgress; folded into one shared
  // counter out of the 4 streams × N pages so the UI keeps moving smoothly
  // instead of jumping from 0 straight to 100% once the batched work lands.
  const totalSteps = commonPages * 4;
  let stepsDone = 0;
  const step = () => onProgress?.(++stepsDone, totalSteps);

  const [textAList, textBList, renderAList, renderBList] = commonPages === 0
    ? [[], [], [], []]
    : await Promise.all([
        extractPdfText(fileA, { pageNumbers, password: passwordA, onProgress: step }),
        extractPdfText(fileB, { pageNumbers, password: passwordB, onProgress: step }),
        renderPdfPages(fileA, { scale: COMPARE_SCALE, pageNumbers, password: passwordA, onProgress: step }),
        renderPdfPages(fileB, { scale: COMPARE_SCALE, pageNumbers, password: passwordB, onProgress: step }),
      ]);

  const pages: PageComparison[] = [];
  for (let i = 0; i < commonPages; i++) {
    const page = pageNumbers[i];
    const textA = textAList[i];
    const textB = textBList[i];
    const renderA = renderAList[i];
    const renderB = renderBList[i];

    const sameDimensions = renderA.width === renderB.width && renderA.height === renderB.height;

    // Not evaluated at all when the pages are differently sized — see the
    // module docstring. Extracted text is bound by each page's own
    // MediaBox, so a resized page can extract as "different text" with the
    // underlying wording unchanged; comparing it here would report a false
    // content change instead of the real, already-captured size change.
    const textDiffers = sameDimensions
      ? normalizedText(textA.text) !== normalizedText(textB.text)
      : undefined;

    let visuallyDiffers: boolean;
    let ratio: number | undefined;
    if (sameDimensions) {
      const [imageDataA, imageDataB] = await Promise.all([
        pngBytesToImageData(renderA.bytes),
        pngBytesToImageData(renderB.bytes),
      ]);
      ratio = pixelDiffRatio(imageDataA, imageDataB);
      visuallyDiffers = ratio > 0.001; // a tiny fraction of noisy pixels is not "different"
    } else {
      visuallyDiffers = true; // different page dimensions is itself a real difference
    }

    pages.push({ page, presence: 'both', textDiffers, visuallyDiffers, pixelDiffRatio: ratio });
  }

  for (let page = commonPages + 1; page <= pageCountA; page++) {
    pages.push({ page, presence: 'onlyInA' });
  }
  for (let page = commonPages + 1; page <= pageCountB; page++) {
    pages.push({ page, presence: 'onlyInB' });
  }

  return { pageCountA, pageCountB, pages };
}
