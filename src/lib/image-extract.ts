/**
 * F-7: extract the images embedded in a PDF.
 *
 * Read-only — the source document is never modified. Two cases matter in
 * practice:
 *
 *   - `DCTDecode` streams are already complete JPEG files, so their bytes are
 *     written straight out.
 *   - `FlateDecode` streams hold raw samples, which are wrapped back into a PNG
 *     here. PNG and PDF both use zlib, but PNG additionally requires a filter
 *     byte per scanline, so the samples have to be re-framed and re-deflated
 *     rather than copied.
 *
 * Anything else (JPX, JBIG2, CCITT, indexed or CMYK colour) is reported as
 * skipped rather than written out wrong.
 */
import { PDFDocument, PDFName, PDFRawStream } from "@cantoo/pdf-lib";
import { crc32 } from "./zip";

export type ExtractedImage = {
  name: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  format: "jpg" | "png";
};

export type ExtractImagesResult = {
  images: ExtractedImage[];
  /** Human-readable reasons for images that could not be exported. */
  skipped: string[];
};

const textOf = (value: unknown): string => String(value ?? "");

/**
 * Run bytes through a compression transform.
 *
 * The source stream is built by hand rather than via `Blob.stream()` or
 * `Response.body`: jsdom supplies neither in a form that pipes into the
 * platform's CompressionStream, so those spellings work in the browser and
 * fail under test. This spelling works in both.
 */
async function transform(bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>) {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

  const reader = source.pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }

  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

// PDF's FlateDecode and PNG's IDAT are both zlib-wrapped, so "deflate" (not
// "deflate-raw") is correct on both sides.
const deflate = (bytes: Uint8Array) => transform(bytes, new CompressionStream("deflate"));
const inflate = (bytes: Uint8Array) => transform(bytes, new DecompressionStream("deflate"));

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  view.setUint32(8 + data.length, crc32(crcInput), false);
  return out;
}

/** Wrap raw samples into a PNG. `channels` is 1 (grey) or 3 (RGB). */
async function encodePng(
  samples: Uint8Array,
  width: number,
  height: number,
  channels: 1 | 3,
): Promise<Uint8Array> {
  const rowLength = width * channels;
  // PNG scanlines are each prefixed with a filter byte; 0 means "no filter".
  const framed = new Uint8Array((rowLength + 1) * height);
  for (let y = 0; y < height; y++) {
    framed[y * (rowLength + 1)] = 0;
    framed.set(samples.subarray(y * rowLength, (y + 1) * rowLength), y * (rowLength + 1) + 1);
  }

  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width, false);
  iv.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = channels === 1 ? 0 : 2; // colour type: greyscale or truecolour
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", await deflate(framed)),
    pngChunk("IEND", new Uint8Array(0)),
  ];

  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}

export async function extractImagesFromDocument(
  pdfDoc: PDFDocument,
): Promise<ExtractImagesResult> {
  const images: ExtractedImage[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  let counter = 0;

  const pages = pdfDoc.getPages();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const resources = pages[pageIndex].node.Resources();
    const xObjects = resources?.lookup(PDFName.of("XObject"));
    if (!xObjects || typeof (xObjects as { entries?: unknown }).entries !== "function") continue;

    for (const [name, ref] of (xObjects as { entries: () => [PDFName, unknown][] }).entries()) {
      const stream = pdfDoc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      if (textOf(stream.dict.get(PDFName.of("Subtype"))) !== "/Image") continue;

      // The same image reused across pages appears once per page.
      const key = name.asString() + ":" + stream.contents.length;
      if (seen.has(key)) continue;
      seen.add(key);

      const filter = textOf(stream.dict.get(PDFName.of("Filter")));
      const width = Number(textOf(stream.dict.get(PDFName.of("Width"))));
      const height = Number(textOf(stream.dict.get(PDFName.of("Height"))));
      const bpc = Number(textOf(stream.dict.get(PDFName.of("BitsPerComponent"))));
      const colorSpace = textOf(stream.dict.get(PDFName.of("ColorSpace")));
      counter += 1;
      const base = `image-${String(counter).padStart(3, "0")}-p${pageIndex + 1}`;

      if (filter === "/DCTDecode") {
        images.push({
          name: `${base}.jpg`,
          bytes: new Uint8Array(stream.contents),
          width,
          height,
          format: "jpg",
        });
        continue;
      }

      if (filter === "/FlateDecode" && bpc === 8 && (colorSpace === "/DeviceRGB" || colorSpace === "/DeviceGray")) {
        try {
          const samples = await inflate(new Uint8Array(stream.contents));
          const channels = colorSpace === "/DeviceRGB" ? 3 : 1;
          if (samples.length < width * height * channels) {
            skipped.push(`${base}: image data is shorter than its declared ${width}×${height} size.`);
            continue;
          }
          images.push({
            name: `${base}.png`,
            bytes: await encodePng(samples, width, height, channels),
            width,
            height,
            format: "png",
          });
        } catch {
          skipped.push(`${base}: could not decompress the image data.`);
        }
        continue;
      }

      skipped.push(
        `${base}: unsupported image encoding (${filter || "none"}${colorSpace ? `, ${colorSpace}` : ""}).`,
      );
    }
  }

  return { images, skipped };
}
