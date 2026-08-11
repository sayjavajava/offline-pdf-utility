/**
 * F-4 / F-5: rasterise PDF pages, via pdf.js.
 *
 * Rendering has to happen on the main thread: it draws to a canvas, which the
 * PDF worker (F-9) has no access to. pdf.js's own worker is inlined as a
 * classic worker for the same file:// reasons as ours — see vite.config.ts.
 */
// The *legacy* build, deliberately: the modern one calls Map.getOrInsertComputed,
// a very recent proposal that browsers in the field do not all implement yet —
// it fails at render time with "getOrInsertComputed is not a function". The
// legacy bundle carries the polyfills, which matters doubly here because this
// app is distributed as a file people open in whatever browser they have.
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import PdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&inline';

let workerReady = false;

function ensureWorker() {
  if (workerReady) return;
  // workerPort takes an already-constructed worker, which is what lets the
  // inlined classic build be used instead of a fetched URL.
  GlobalWorkerOptions.workerPort = new PdfjsWorker();
  workerReady = true;
}

export type RenderedPage = {
  pageNumber: number;
  bytes: Uint8Array;
  width: number;
  height: number;
};

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not read the rendered page from the canvas.');
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Render selected pages to PNG.
 *
 * @param scale 1 is 72dpi; 2 gives a reasonably crisp raster.
 * @param pageNumbers 1-based; omit for every page.
 */
export async function renderPdfPages(
  file: File,
  { scale = 2, pageNumbers, password, onProgress }: {
    scale?: number;
    pageNumbers?: number[];
    password?: string;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<RenderedPage[]> {
  if (!Number.isFinite(scale) || scale <= 0 || scale > 8) {
    throw new Error('Scale must be between 0 and 8.');
  }
  ensureWorker();

  const data = new Uint8Array(await file.arrayBuffer());
  let doc;
  try {
    doc = await getDocument({ data, password: password ?? '' }).promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/password/i.test(message)) {
      throw new Error('This PDF is password protected. Enter its password to continue.');
    }
    throw error;
  }

  const targets = pageNumbers?.length
    ? pageNumbers
    : Array.from({ length: doc.numPages }, (_, i) => i + 1);

  const out: RenderedPage[] = [];
  for (const [index, pageNumber] of targets.entries()) {
    if (pageNumber < 1 || pageNumber > doc.numPages) {
      throw new Error(`Page ${pageNumber} is outside this ${doc.numPages}-page document.`);
    }
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    if (!canvas.getContext('2d')) {
      throw new Error('This browser could not provide a 2D canvas to render into.');
    }

    // Pass `canvas` alone. `canvasContext` is the backwards-compatible spelling
    // and requires `canvas: null`; supplying both makes pdf.js mismanage the
    // canvas it thinks it owns and fail during teardown.
    await page.render({ canvas, viewport }).promise;
    out.push({
      pageNumber,
      bytes: await canvasToPngBytes(canvas),
      width: canvas.width,
      height: canvas.height,
    });
    page.cleanup();
    onProgress?.(index + 1, targets.length);
  }

  // Release page resources but leave the document transport alone. Calling
  // doc.destroy() here tears down the shared worker, and because that worker is
  // supplied as a raw `workerPort`, pdf.js invokes .destroy() on it — a method
  // a Worker does not have, so teardown throws *after* every page has already
  // rendered successfully. Keeping the worker alive also avoids re-spawning it
  // for every render.
  await doc.cleanup();
  return out;
}

/** Page count without rendering anything — cheap enough for a preview header. */
export async function getPageCount(file: File, password?: string): Promise<number> {
  ensureWorker();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data, password: password ?? '' }).promise;
  const count = doc.numPages;
  await doc.cleanup();
  return count;
}
