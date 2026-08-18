/**
 * F-12: lay mammoth's HTML out as real PDF text, instead of rasterizing it.
 *
 * The previous pipeline (docx-convert.ts, now removed) rendered the HTML
 * through html2canvas and embedded the result as a picture — no selectable,
 * searchable, or copyable text, which is the actual reason most people
 * convert a document to PDF. This draws real text objects instead, using the
 * same drawText/embedFont approach every other tool in this app already uses
 * (addWatermark, addPageNumbers).
 *
 * Scope, deliberately bounded to what mammoth's HTML actually emits for a
 * typical document — headings, paragraphs, bold/italic runs, ordered and
 * unordered lists (including nesting), simple tables, and images embedded as
 * `data:` URIs. Not supported, and not silently faked:
 *
 *  - Only the four standard Helvetica variants are used (regular/bold/
 *    italic/bold-italic) — no embedded fonts, so a character outside
 *    WinAnsi (CJK, Cyrillic, emoji, ...) cannot be drawn. Such characters
 *    are replaced with "?" and counted; a non-blocking warning reports the
 *    count rather than silently losing them.
 *  - Links are rendered visually (coloured, underlined) but are not
 *    clickable — no PDF Link annotation is created.
 *  - A table row that does not fit the remaining page height moves to a new
 *    page as a whole; a single row taller than a full page is not split
 *    further and will overflow the bottom margin.
 *  - Table columns are divided equally, not sized to content.
 *
 * Runs entirely off the DOM: only `DOMParser` (available in both window and
 * worker global scopes) and @cantoo/pdf-lib, so — unlike the rasterizing
 * pipeline it replaces — this can run in the PDF worker (F-9).
 */
import { PDFDocument, PDFFont, PDFPage } from '@cantoo/pdf-lib';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT_FACTOR = 1.35;
const BODY_SIZE = 11;
const HEADING_SIZES: Record<number, number> = { 1: 22, 2: 18, 3: 15, 4: 13, 5: 12, 6: 11 };
const LIST_INDENT_STEP = 16;
const LIST_MARKER_GAP = 14;
const CELL_PADDING = 4;
const CELL_FONT_SIZE = BODY_SIZE - 1;
const LINK_COLOR = { type: 'RGB' as const, red: 0.06, green: 0.24, blue: 0.65 };
const BODY_COLOR = { type: 'RGB' as const, red: 0, green: 0, blue: 0 };
const TABLE_BORDER_COLOR = { type: 'RGB' as const, red: 0.7, green: 0.7, blue: 0.7 };

// ---------------------------------------------------------------------------
// 1. Parse mammoth's HTML into a small block model.
// ---------------------------------------------------------------------------

export type Run = { text: string; bold: boolean; italic: boolean; link?: string };

export type Block =
  | { type: 'heading'; level: number; runs: Run[] }
  | { type: 'paragraph'; runs: Run[] }
  | { type: 'listItem'; ordered: boolean; index: number; depth: number; runs: Run[] }
  | { type: 'table'; rows: Run[][][] }
  | { type: 'image'; bytes: Uint8Array; format: 'png' | 'jpeg' };

const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'table']);

function extractRuns(node: Node, style: { bold: boolean; italic: boolean; link?: string }): Run[] {
    const runs: Run[] = [];
    for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3 /* TEXT_NODE */) {
            const text = child.textContent ?? '';
            if (text) runs.push({ text, ...style });
        } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
            const el = child as Element;
            const tag = el.tagName.toLowerCase();
            if (tag === 'br') {
                runs.push({ text: '\n', ...style });
                continue;
            }
            const next = { ...style };
            if (tag === 'strong' || tag === 'b') next.bold = true;
            if (tag === 'em' || tag === 'i') next.italic = true;
            if (tag === 'a') {
                const href = el.getAttribute('href');
                if (href) next.link = href;
            }
            runs.push(...extractRuns(el, next));
        }
    }
    return runs;
}

/** A table cell's content, mammoth-wrapped-in-`<p>`s flattened to one run list with line breaks between paragraphs. */
function extractCellRuns(cell: Element): Run[] {
    const paragraphs = Array.from(cell.children).filter((c) => c.tagName.toLowerCase() === 'p');
    const sources = paragraphs.length > 0 ? paragraphs : [cell];
    const runs: Run[] = [];
    sources.forEach((source, i) => {
        if (i > 0) runs.push({ text: '\n', bold: false, italic: false });
        runs.push(...extractRuns(source, { bold: false, italic: false }));
    });
    return runs;
}

type ParsedImage = { bytes: Uint8Array; format: 'png' | 'jpeg' } | null;

function parseDataUriImage(src: string): ParsedImage {
    const match = /^data:image\/(png|jpe?g);base64,(.+)$/is.exec(src.trim());
    if (!match) return null;
    const format: 'png' | 'jpeg' = match[1].toLowerCase().startsWith('jp') ? 'jpeg' : 'png';
    try {
        const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
        return { bytes, format };
    } catch {
        return null;
    }
}

/** A `<p>` whose only meaningful child is a single `<img>` (mammoth's default shape for a block image). */
function asImageOnlyParagraph(p: Element): ParsedImage {
    const elementChildren = Array.from(p.children);
    if (elementChildren.length !== 1 || elementChildren[0].tagName.toLowerCase() !== 'img') return null;
    if ((p.textContent ?? '').trim() !== '') return null;
    const src = elementChildren[0].getAttribute('src');
    return src ? parseDataUriImage(src) : null;
}

function walkList(listEl: Element, ordered: boolean, depth: number, blocks: Block[]): void {
    let index = 1;
    for (const li of Array.from(listEl.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        const nestedLists: Element[] = [];
        const runs: Run[] = [];
        for (const child of Array.from(li.childNodes)) {
            if (child.nodeType === 1 && ['ul', 'ol'].includes((child as Element).tagName.toLowerCase())) {
                nestedLists.push(child as Element);
            } else if (child.nodeType === 3) {
                const text = child.textContent ?? '';
                if (text) runs.push({ text, bold: false, italic: false });
            } else if (child.nodeType === 1) {
                runs.push(...extractRuns(child, { bold: false, italic: false }));
            }
        }
        blocks.push({ type: 'listItem', ordered, index: index++, depth, runs });
        for (const nested of nestedLists) {
            walkList(nested, nested.tagName.toLowerCase() === 'ol', depth + 1, blocks);
        }
    }
}

/** Parse mammoth's HTML output into a flat block list. Exported for direct unit testing. */
export function parseBlocks(html: string): Block[] {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    const blocks: Block[] = [];
    if (!root) return blocks;

    for (const el of Array.from(root.children)) {
        const tag = el.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) {
            blocks.push({ type: 'heading', level: Number(tag[1]), runs: extractRuns(el, { bold: false, italic: false }) });
        } else if (tag === 'p') {
            const image = asImageOnlyParagraph(el);
            if (image) {
                blocks.push({ type: 'image', ...image });
            } else {
                blocks.push({ type: 'paragraph', runs: extractRuns(el, { bold: false, italic: false }) });
            }
        } else if (tag === 'ul' || tag === 'ol') {
            walkList(el, tag === 'ol', 0, blocks);
        } else if (tag === 'table') {
            const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
                Array.from(tr.children)
                    .filter((c) => ['td', 'th'].includes(c.tagName.toLowerCase()))
                    .map((cell) => extractCellRuns(cell)),
            );
            blocks.push({ type: 'table', rows });
        } else if (tag === 'img') {
            const src = el.getAttribute('src');
            const image = src ? parseDataUriImage(src) : null;
            if (image) blocks.push({ type: 'image', ...image });
        } else if (!BLOCK_TAGS.has(tag)) {
            // Unknown block-level element (e.g. blockquote) — treat its text as a paragraph
            // rather than dropping it.
            const runs = extractRuns(el, { bold: false, italic: false });
            if (runs.length > 0) blocks.push({ type: 'paragraph', runs });
        }
    }
    return blocks;
}

// ---------------------------------------------------------------------------
// 2. Word-wrap runs into lines that fit a given width.
// ---------------------------------------------------------------------------

type Atom = { text: string; bold: boolean; italic: boolean; link?: string; hardBreak?: boolean };

function tokenize(runs: Run[]): Atom[] {
    const atoms: Atom[] = [];
    for (const run of runs) {
        for (const part of run.text.split(/(\n)/)) {
            if (part === '') continue;
            if (part === '\n') {
                atoms.push({ text: '', bold: run.bold, italic: run.italic, hardBreak: true });
                continue;
            }
            for (const word of part.split(/(\s+)/)) {
                if (word !== '') atoms.push({ text: word, bold: run.bold, italic: run.italic, link: run.link });
            }
        }
    }
    return atoms;
}

type FontLookup = (bold: boolean, italic: boolean) => PDFFont;

function wrapAtoms(atoms: Atom[], maxWidth: number, size: number, fontFor: FontLookup): Atom[][] {
    const lines: Atom[][] = [];
    let current: Atom[] = [];
    let width = 0;

    for (const atom of atoms) {
        if (atom.hardBreak) {
            lines.push(current);
            current = [];
            width = 0;
            continue;
        }
        const isSpace = /^\s+$/.test(atom.text);
        if (isSpace && current.length === 0) continue; // no leading space on a fresh line

        const w = fontFor(atom.bold, atom.italic).widthOfTextAtSize(atom.text, size);
        if (!isSpace && current.length > 0 && width + w > maxWidth) {
            lines.push(current);
            current = [];
            width = 0;
        }
        current.push(atom);
        width += w;
    }
    lines.push(current);
    return lines;
}

/**
 * Merge consecutive same-style atoms (words *and* the spaces between them)
 * into single segments before drawing.
 *
 * Drawing one `Tj` per word, with the inter-word spaces never drawn at all
 * (they carry no glyph), would leave most PDF text extractors and viewers
 * with no space to reconstruct between adjacent words on copy-paste — some
 * infer one from the x-position gap, but that isn't guaranteed. One draw
 * call per contiguous run of matching style keeps the spaces as real
 * characters in the string that gets drawn.
 */
function mergeIntoSegments(line: Atom[]): Atom[] {
    const segments: Atom[] = [];
    for (const atom of line) {
        const last = segments[segments.length - 1];
        if (last && last.bold === atom.bold && last.italic === atom.italic && last.link === atom.link) {
            last.text += atom.text;
        } else {
            segments.push({ ...atom });
        }
    }
    return segments;
}

// ---------------------------------------------------------------------------
// 3. Lay the blocks out onto pages.
// ---------------------------------------------------------------------------

class DocWriter {
    private pdfDoc: PDFDocument;
    private page: PDFPage;
    private cursorY: number;
    private fonts: { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont };
    private unencodableCount = 0;
    private imagesSkippedCount = 0;

    private constructor(pdfDoc: PDFDocument, fonts: DocWriter['fonts']) {
        this.pdfDoc = pdfDoc;
        this.fonts = fonts;
        this.page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        this.cursorY = PAGE_HEIGHT - MARGIN;
    }

    static async create(): Promise<DocWriter> {
        const pdfDoc = await PDFDocument.create();
        const fonts = {
            regular: await pdfDoc.embedFont('Helvetica'),
            bold: await pdfDoc.embedFont('Helvetica-Bold'),
            italic: await pdfDoc.embedFont('Helvetica-Oblique'),
            boldItalic: await pdfDoc.embedFont('Helvetica-BoldOblique'),
        };
        return new DocWriter(pdfDoc, fonts);
    }

    private fontFor: FontLookup = (bold, italic) =>
        bold && italic ? this.fonts.boldItalic : bold ? this.fonts.bold : italic ? this.fonts.italic : this.fonts.regular;

    private sanitize(text: string, font: PDFFont): string {
        let out = '';
        for (const ch of text) {
            if (ch === '?' || font.encodeText(ch).asString() !== '3F') {
                out += ch;
            } else {
                out += '?';
                this.unencodableCount++;
            }
        }
        return out;
    }

    private ensureSpace(height: number): void {
        if (this.cursorY - height < MARGIN) {
            this.page = this.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
            this.cursorY = PAGE_HEIGHT - MARGIN;
        }
    }

    private drawWrappedRuns(runs: Run[], x: number, maxWidth: number, size: number, lineHeight: number): void {
        const lines = wrapAtoms(tokenize(runs), maxWidth, size, this.fontFor);
        for (const line of lines) {
            this.ensureSpace(lineHeight);
            let lx = x;
            const baseline = this.cursorY - size;
            for (const atom of mergeIntoSegments(line)) {
                const font = this.fontFor(atom.bold, atom.italic);
                const text = this.sanitize(atom.text, font);
                const width = font.widthOfTextAtSize(text, size);
                if (text.trim() !== '') {
                    this.page.drawText(text, { x: lx, y: baseline, font, size, color: atom.link ? LINK_COLOR : BODY_COLOR });
                    if (atom.link) {
                        this.page.drawLine({
                            start: { x: lx, y: baseline - 1 },
                            end: { x: lx + width, y: baseline - 1 },
                            thickness: 0.5,
                            color: LINK_COLOR,
                        });
                    }
                }
                lx += width;
            }
            this.cursorY -= lineHeight;
        }
    }

    drawHeading(level: number, runs: Run[]): void {
        const size = HEADING_SIZES[level] ?? BODY_SIZE;
        const lineHeight = size * LINE_HEIGHT_FACTOR;
        this.ensureSpace(lineHeight + size * 0.3);
        this.cursorY -= size * 0.3;
        this.drawWrappedRuns(
            runs.map((r) => ({ ...r, bold: true })),
            MARGIN,
            CONTENT_WIDTH,
            size,
            lineHeight,
        );
        this.cursorY -= size * 0.25;
    }

    drawParagraph(runs: Run[]): void {
        if (runs.length === 0) {
            this.cursorY -= BODY_SIZE * LINE_HEIGHT_FACTOR * 0.5;
            return;
        }
        this.drawWrappedRuns(runs, MARGIN, CONTENT_WIDTH, BODY_SIZE, BODY_SIZE * LINE_HEIGHT_FACTOR);
        this.cursorY -= BODY_SIZE * LINE_HEIGHT_FACTOR * 0.35;
    }

    drawListItem(ordered: boolean, index: number, depth: number, runs: Run[]): void {
        const indent = MARGIN + depth * LIST_INDENT_STEP;
        const textX = indent + LIST_MARKER_GAP;
        const lineHeight = BODY_SIZE * LINE_HEIGHT_FACTOR;
        this.ensureSpace(lineHeight);
        const marker = this.sanitize(ordered ? `${index}.` : '•', this.fonts.regular);
        this.page.drawText(marker, { x: indent, y: this.cursorY - BODY_SIZE, font: this.fonts.regular, size: BODY_SIZE, color: BODY_COLOR });
        this.drawWrappedRuns(runs, textX, CONTENT_WIDTH - (textX - MARGIN), BODY_SIZE, lineHeight);
        this.cursorY -= lineHeight * 0.15;
    }

    drawTable(rows: Run[][][]): void {
        if (rows.length === 0) return;
        const numCols = Math.max(0, ...rows.map((r) => r.length));
        if (numCols === 0) return;
        const colWidth = CONTENT_WIDTH / numCols;
        const cellLineHeight = CELL_FONT_SIZE * LINE_HEIGHT_FACTOR;

        for (const row of rows) {
            const cellLines = row.map((cellRuns) => wrapAtoms(tokenize(cellRuns), colWidth - CELL_PADDING * 2, CELL_FONT_SIZE, this.fontFor));
            const rowHeight = Math.max(1, ...cellLines.map((lines) => lines.length)) * cellLineHeight + CELL_PADDING * 2;
            this.ensureSpace(rowHeight);
            const rowTop = this.cursorY;

            cellLines.forEach((lines, c) => {
                const x = MARGIN + c * colWidth;
                this.page.drawRectangle({
                    x,
                    y: rowTop - rowHeight,
                    width: colWidth,
                    height: rowHeight,
                    borderColor: TABLE_BORDER_COLOR,
                    borderWidth: 0.75,
                });
                let ly = rowTop - CELL_PADDING;
                for (const line of lines) {
                    let lx = x + CELL_PADDING;
                    for (const atom of mergeIntoSegments(line)) {
                        const font = this.fontFor(atom.bold, atom.italic);
                        const text = this.sanitize(atom.text, font);
                        if (text.trim() !== '') {
                            this.page.drawText(text, { x: lx, y: ly - CELL_FONT_SIZE, font, size: CELL_FONT_SIZE, color: BODY_COLOR });
                        }
                        lx += font.widthOfTextAtSize(text, CELL_FONT_SIZE);
                    }
                    ly -= cellLineHeight;
                }
            });
            this.cursorY = rowTop - rowHeight;
        }
        this.cursorY -= BODY_SIZE * LINE_HEIGHT_FACTOR * 0.35;
    }

    async drawImage(bytes: Uint8Array, format: 'png' | 'jpeg'): Promise<void> {
        let embedded;
        try {
            embedded = format === 'png' ? await this.pdfDoc.embedPng(bytes) : await this.pdfDoc.embedJpg(bytes);
        } catch {
            this.imagesSkippedCount++;
            return;
        }
        const maxHeight = PAGE_HEIGHT - MARGIN * 2;
        let width = embedded.width;
        let height = embedded.height;
        if (width > CONTENT_WIDTH) {
            const scale = CONTENT_WIDTH / width;
            width *= scale;
            height *= scale;
        }
        if (height > maxHeight) {
            const scale = maxHeight / height;
            width *= scale;
            height *= scale;
        }
        this.ensureSpace(height);
        this.page.drawImage(embedded, { x: MARGIN, y: this.cursorY - height, width, height });
        this.cursorY -= height + BODY_SIZE * LINE_HEIGHT_FACTOR * 0.35;
    }

    async save(): Promise<{ bytes: Uint8Array; warnings: string[] }> {
        const bytes = await this.pdfDoc.save();
        const warnings: string[] = [];
        if (this.unencodableCount > 0) {
            warnings.push(
                `${this.unencodableCount} character${this.unencodableCount === 1 ? '' : 's'} could not be rendered in the standard font and ${this.unencodableCount === 1 ? 'was' : 'were'} replaced with "?".`,
            );
        }
        if (this.imagesSkippedCount > 0) {
            warnings.push(`${this.imagesSkippedCount} image${this.imagesSkippedCount === 1 ? '' : 's'} could not be embedded and ${this.imagesSkippedCount === 1 ? 'was' : 'were'} skipped.`);
        }
        return { bytes, warnings };
    }
}

/**
 * Lay mammoth's HTML output out as a real, text-based PDF (F-12).
 * @returns the PDF bytes plus any non-blocking warnings (unencodable characters, skipped images).
 */
export async function layoutHtmlToPdf(html: string): Promise<{ bytes: Uint8Array; warnings: string[] }> {
    const blocks = parseBlocks(html);
    const writer = await DocWriter.create();

    for (const block of blocks) {
        if (block.type === 'heading') writer.drawHeading(block.level, block.runs);
        else if (block.type === 'paragraph') writer.drawParagraph(block.runs);
        else if (block.type === 'listItem') writer.drawListItem(block.ordered, block.index, block.depth, block.runs);
        else if (block.type === 'table') writer.drawTable(block.rows);
        else if (block.type === 'image') await writer.drawImage(block.bytes, block.format);
    }

    return writer.save();
}
