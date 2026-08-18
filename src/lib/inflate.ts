/**
 * Inflate a raw-deflate buffer using the browser's native `DecompressionStream`.
 *
 * Built on `ReadableStream` rather than `Blob.stream()`/`Response.body`,
 * neither of which jsdom provides — used by both the bundled CMap tables
 * (pdf-render.ts) and the bundled qpdf WASM binary (qpdf-engine.ts).
 */
export async function inflateDeflated(bytes: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const reader = source.pipeThrough(new DecompressionStream('deflate')).getReader();
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
