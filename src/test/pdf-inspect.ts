/**
 * Content-stream inspection helpers for tests.
 *
 * These let a unit test prove a PDF's text is genuinely drawn as text (not a
 * raster image of text) without needing pdfjs-dist or a real browser: they
 * decompress the content streams and read the show-text operators directly.
 */

/** Decompressed content of every stream in a produced PDF, concatenated. */
async function decompressedStreams(blob: Blob): Promise<string> {
  const zlib = await import("node:zlib");
  const raw = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  let streams = "";
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      streams += zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
    } catch {
      streams += m[1];
    }
  }
  return streams;
}

/**
 * Pull the *drawn strings* out of a produced PDF.
 *
 * pdf-lib writes show-text operands as hex (`<41424> Tj`), so a substring
 * match against the raw stream would both miss the text and match stray digits
 * from coordinates — passing for the wrong reason.
 */
export async function drawnText(blob: Blob): Promise<string[]> {
  const streams = await decompressedStreams(blob);
  return [...streams.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].map((m) =>
    Buffer.from(m[1], "hex").toString("latin1"),
  );
}

/** Where each `Tm`-positioned show-text call landed, as [x, y]. */
export async function stampPositions(blob: Blob): Promise<[number, number][]> {
  const streams = await decompressedStreams(blob);
  return [...streams.matchAll(/1 0 0 1 ([-\d.]+) ([-\d.]+) Tm/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
}

/**
 * Every show-text call's full text matrix `[a, b, c, d, e, f]`, rotated or
 * not. `[a, b]` is the direction the text runs in user space (`[1, 0]` is
 * along +x, `[0, 1]` up +y) and `[e, f]` is where its baseline starts.
 */
export async function textMatrices(blob: Blob): Promise<number[][]> {
  const streams = await decompressedStreams(blob);
  const num = "(-?[\\d.]+(?:e-?\\d+)?)";
  return [...streams.matchAll(new RegExp(`${Array(6).fill(num).join(" ")} Tm`, "g"))].map((m) =>
    m.slice(1, 7).map(Number),
  );
}
