/**
 * F-24: find text across a PDF and turn matches into redaction boxes.
 *
 * The one real risk here is position: a match has to land on the *rendered*
 * page, including a rotated one, not the raw content-stream space
 * `getTextContent()` reports in. A throwaway two-page test PDF (one page
 * unrotated, one with `/Rotate 90`, identical text drawn at identical
 * content-stream coordinates on both) confirmed `item.transform` is
 * unaffected by page rotation — reading it directly would silently misplace
 * every box on a rotated page. Rather than hand-rolling the matrix math to
 * reconcile that against `page.getViewport()` (`Util.transform(viewport.
 * transform, item.transform)`, plus reproducing pdf.js's own font-ascent
 * handling), this reuses pdf.js's own `TextLayer` — the same class every
 * pdf.js-based viewer uses to build the real, selectable text overlay — to
 * get real, browser-measured positions, then reads a match's box via a plain
 * DOM `Range` over the matched text and `Range.getClientRects()`. Geometry
 * correctness is inherited from code already proven across every PDF pdf.js
 * renders, not reimplemented.
 *
 * Two-phase for performance, mirroring this project's own precedent (PDF to
 * Images renders only the pages it shows, not the whole document): every
 * page gets the cheap treatment (`getTextContent` + `getViewport`, no
 * rendering, no font measurement) to find *which* pages match; only those
 * pages pay for a real `TextLayer` to get exact positions.
 */
import { TextLayer } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PageViewport } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { getPageTextData, type PageTextData } from './pdf-render';
import type { RedactionRect } from './pdf-redact';
import './text-layer.css';

export type TextItemLike = { str: string; hasEOL?: boolean };

/** Where one match touches one text item — `startInItem`/`endInItem` are
 * offsets into that item's own `str`, not the whole page. */
export type MatchOffset = { itemIndex: number; startInItem: number; endInItem: number };

/**
 * Finds every occurrence of `query` across `items` (already filtered to
 * real text items, in document order) and maps each to the item(s) it
 * touches. Pure — no pdf.js, no DOM — so this is the piece that gets direct
 * unit tests with plain fixture data, the same reasoning `pdf-redact.ts`
 * splits `toPixelRect` out for.
 *
 * Items are joined the same way `extractPdfText` (pdf-render.ts) joins
 * them for display — a `\n` after any item with `hasEOL` — so a match can
 * never silently bridge two lines that aren't actually adjacent on the
 * page (e.g. "...Smith" / "Hello..." on separate lines never reads as a
 * match for "SmithHello").
 */
export function locateMatches(
  items: TextItemLike[],
  query: string,
  { caseSensitive = false }: { caseSensitive?: boolean } = {},
): MatchOffset[][] {
  if (query.length === 0) return [];

  let joined = '';
  const itemRanges: { start: number; end: number }[] = [];
  for (const item of items) {
    const start = joined.length;
    joined += item.str;
    itemRanges.push({ start, end: joined.length });
    if (item.hasEOL) joined += '\n';
  }

  const haystack = caseSensitive ? joined : joined.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();

  const matches: MatchOffset[][] = [];
  let searchFrom = 0;
  for (;;) {
    const start = haystack.indexOf(needle, searchFrom);
    if (start === -1) break;
    const end = start + needle.length;
    searchFrom = end;

    const touches: MatchOffset[] = [];
    for (const [itemIndex, range] of itemRanges.entries()) {
      const overlapStart = Math.max(start, range.start);
      const overlapEnd = Math.min(end, range.end);
      if (overlapStart < overlapEnd) {
        touches.push({
          itemIndex,
          startInItem: overlapStart - range.start,
          endInItem: overlapEnd - range.start,
        });
      }
    }
    if (touches.length > 0) matches.push(touches);
  }

  return matches;
}

export type SimpleRect = { left: number; top: number; right: number; bottom: number };

/** How close two rects' vertical centers must be to count as "the same
 * visual line" — generous, since real font metrics can vary a couple px
 * within one line (mixed fonts, super/subscripts). */
const LINE_TOLERANCE_PX = 3;

/** Fixed safety margin added to every side of a found match's box. A
 * slightly generous box is the safe direction for something about to be
 * permanently deleted — a slightly narrow one could leave a sliver of the
 * matched text exposed at the edge. */
const REDACTION_PADDING_PT = 1.5;

/**
 * Combines the client rects for one match's touched text run(s) into a
 * single `RedactionRect`, or `null` if they don't share one visual line (no
 * single rectangle is honest for a match that crosses a line break — the
 * caller counts these as skipped rather than guessing). Pure — takes plain
 * rect-shaped objects, not real `DOMRect`s or a live `Range` — so the
 * padding/union/axis-flip arithmetic (the piece most likely to have an
 * off-by-one or off-by-a-flip bug, same reasoning as `toPixelRect` in
 * `pdf-redact.ts`) gets direct unit tests with plain fixture numbers, no
 * browser required.
 *
 * `viewportHeightPts` flips the browser's top-left-origin rects into the
 * bottom-left-origin `RedactionRect` convention already used everywhere
 * else in this app (`RedactTool.tsx`'s `pixelToPdfRect`, `pdf-redact.ts`'s
 * `toPixelRect`) — the same `heightPts - bottom` formula, not a new one.
 */
export function unionMatchRects(
  clientRects: SimpleRect[],
  containerRect: { left: number; top: number },
  viewportHeightPts: number,
): RedactionRect | null {
  if (clientRects.length === 0) return null;

  const midY = (r: SimpleRect) => r.top + (r.bottom - r.top) / 2;
  const firstMidY = midY(clientRects[0]);
  const sameLine = clientRects.every((r) => Math.abs(midY(r) - firstMidY) <= LINE_TOLERANCE_PX);
  if (!sameLine) return null;

  const left = Math.min(...clientRects.map((r) => r.left)) - containerRect.left - REDACTION_PADDING_PT;
  const right = Math.max(...clientRects.map((r) => r.right)) - containerRect.left + REDACTION_PADDING_PT;
  const top = Math.min(...clientRects.map((r) => r.top)) - containerRect.top - REDACTION_PADDING_PT;
  const bottom = Math.max(...clientRects.map((r) => r.bottom)) - containerRect.top + REDACTION_PADDING_PT;

  return {
    x: left,
    y: viewportHeightPts - bottom,
    width: right - left,
    height: bottom - top,
  };
}

export type PageMatchGeometry = { rects: RedactionRect[]; skippedCount: number };

/**
 * Browser-only (constructs a real `TextLayer` and DOM `Range`s — not
 * meaningfully testable under jsdom, which lays out no real font metrics;
 * same split this codebase already applies to `renderPdfPages`/`redactPdf`).
 * For each match, builds a `Range` across the text node(s) of the
 * `TextLayer`'s divs it touches, reads `getClientRects()`, and hands them to
 * `unionMatchRects`.
 */
export async function rectsForPageMatches(
  content: PageTextData['content'],
  viewport: PageViewport,
  items: TextItemLike[],
  matches: MatchOffset[][],
): Promise<PageMatchGeometry> {
  const container = document.createElement('div');
  container.className = 'textLayer';
  // Never set by TextLayer/setLayerDimensions themselves — normally supplied
  // by the full pdf.js viewer chrome (PDFPageView), which this app doesn't
  // use. Every div's actual font-size is `--font-height * --text-scale-
  // factor` (see text-layer.css); at viewport scale 1 (`getPageTextData`'s
  // convention) 1 PDF point is meant to be exactly 1 CSS px, so this is 1.
  container.style.setProperty('--total-scale-factor', '1');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.visibility = 'hidden';
  document.body.appendChild(container);

  try {
    const textLayer = new TextLayer({ textContentSource: content, container, viewport });
    // `TextLayer`'s own constructor sizes the container via a CSS
    // `round(down, var(--total-scale-factor) * ...px, var(--scale-round-x))`
    // expression — meant for the full pdf.js viewer chrome, which sets
    // `--scale-round-x`/`--scale-round-y` itself; left unset (as here, since
    // this app doesn't use that chrome), the expression is invalid and the
    // container's real size silently collapses, which throws off every
    // percentage-based position `TextLayer` computes. Set directly instead,
    // in real px, sidestepping that dependency entirely. Must match
    // `rawDims`, not `viewport.width`/`height` — `TextLayer` itself lays out
    // in the page's *un-rotated* content-stream space (see text-layer.css's
    // `[data-main-rotation]` rule for how rotation is applied afterward).
    const { pageWidth, pageHeight } = viewport.rawDims as { pageWidth: number; pageHeight: number };
    container.style.width = `${pageWidth}px`;
    container.style.height = `${pageHeight}px`;
    await textLayer.render();
    const textDivs = textLayer.textDivs;
    const containerRect = container.getBoundingClientRect();

    const rects: RedactionRect[] = [];
    let skippedCount = 0;

    for (const touches of matches) {
      const clientRects: SimpleRect[] = [];
      for (const touch of touches) {
        const div = textDivs[touch.itemIndex];
        const textNode = div?.firstChild;
        if (!div || !textNode) continue;
        const maxLen = items[touch.itemIndex]?.str.length ?? 0;
        const range = document.createRange();
        range.setStart(textNode, Math.min(touch.startInItem, maxLen));
        range.setEnd(textNode, Math.min(touch.endInItem, maxLen));
        for (const r of Array.from(range.getClientRects())) {
          clientRects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }
      }

      const rect = unionMatchRects(
        clientRects,
        { left: containerRect.left, top: containerRect.top },
        viewport.height,
      );
      if (rect) rects.push(rect);
      else skippedCount++;
    }

    return { rects, skippedCount };
  } finally {
    container.remove();
  }
}

export type MatchResult = {
  totalMatches: number;
  /** Same shape as `RedactTool`'s own `redactions` state — "add all" is a
   * plain object merge, no translation layer. */
  matchesByPage: Record<number, RedactionRect[]>;
  /** Matches found but not turned into a box because they cross a visual
   * line — draw these by hand instead. */
  skippedByPage: Record<number, number>;
  /** Pages with no text layer at all (most likely scanned) — same signal
   * `ExtractTextTool.tsx` already surfaces for the same reason. */
  noTextLayerPages: number[];
};

const MIN_QUERY_LENGTH = 2;

/**
 * Finds `query` across every page of `file` and returns ready-to-use
 * redaction boxes. Nothing is applied — the caller decides what to do with
 * the result (`RedactTool.tsx` lets the user review before merging it into
 * its own box list).
 */
export async function findTextMatches(
  file: File,
  query: string,
  { caseSensitive = false, password, onProgress }: {
    caseSensitive?: boolean;
    password?: string;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<MatchResult> {
  if (query.length < MIN_QUERY_LENGTH) {
    throw new Error(`Search text must be at least ${MIN_QUERY_LENGTH} characters.`);
  }

  const pages = await getPageTextData(file, { password });

  const matchesByPage: Record<number, RedactionRect[]> = {};
  const skippedByPage: Record<number, number> = {};
  const noTextLayerPages: number[] = [];
  let totalMatches = 0;

  for (const [index, { pageNumber, content, viewport }] of pages.entries()) {
    const items = content.items.filter(
      (item): item is TextItemLike & { str: string } => 'str' in item,
    );

    if (items.every((item) => item.str.trim() === '')) {
      noTextLayerPages.push(pageNumber);
      onProgress?.(index + 1, pages.length);
      continue;
    }

    const matches = locateMatches(items, query, { caseSensitive });
    if (matches.length > 0) {
      const { rects, skippedCount } = await rectsForPageMatches(content, viewport, items, matches);
      if (rects.length > 0) matchesByPage[pageNumber] = rects;
      if (skippedCount > 0) skippedByPage[pageNumber] = skippedCount;
      totalMatches += rects.length;
    }

    onProgress?.(index + 1, pages.length);
  }

  return { totalMatches, matchesByPage, skippedByPage, noTextLayerPages };
}
