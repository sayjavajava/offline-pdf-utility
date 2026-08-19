/**
 * F-1 / F-14: password-protect and compress a PDF, via qpdf compiled to WASM.
 *
 * Neither pdf-lib nor its @cantoo fork can *write* encryption — only read it
 * (see loadPdf in pdf-ops.ts). qpdf can, but @jspawn/qpdf-wasm's loader only
 * knows how to `fetch()` its ~1.2 MB wasm binary as a sibling file, which a
 * page opened from disk can never do.
 *
 * The loader does honor a `locateFile` hook, though, and `fetch()` resolves a
 * `data:` URI locally rather than over the network. Pointing `locateFile` at
 * a base64 data URI built from the bundled binary (src/lib/qpdf-wasm.generated.ts,
 * produced by scripts/generate-qpdf-wasm.mjs) loads and runs the module with
 * zero network requests — verified against the real file:// build with every
 * non-local request blocked. This only runs in a real browser: Node's fetch
 * does not resolve `data:` URIs the way browsers do, so this module cannot be
 * exercised under jsdom (see the coverage exclude in vite.config.ts) and is
 * instead covered by the Playwright checks against the built file.
 *
 * This only exposes the qpdf CLI (no library API — see the type shim in
 * src/types/qpdf-wasm.d.ts), so a run means: write the input into its virtual
 * filesystem, invoke `callMain` with CLI args, read the output back out.
 *
 * qpdf itself only logs failures to the console (its Emscripten build ignores
 * the `print`/`printErr` module config entirely), so the console is
 * intercepted for the duration of the call to build a useful error message,
 * then restored — both to surface *something* readable and so a failed
 * attempt does not spam a real user's devtools console.
 *
 * qpdf's default output uses a compressed cross-reference stream, which used
 * to break the round trip through this app's own Unlock tool afterwards —
 * @cantoo/pdf-lib's decrypt-then-resave silently failed to strip the
 * encryption, reporting success while handing back a file that was still
 * password protected. That was a bug in `loadPdf`'s handling of that xref
 * shape generally (not specific to this tool's output), fixed at the source
 * in `stripStaleXRefStreamObjects` (pdf-ops.ts) — see **P1-17** in
 * docs/CODE_AUDIT.md for the full root cause. No qpdf-side workaround is
 * needed here as a result; qpdf runs with its own defaults.
 */
import createQpdfModule from '@jspawn/qpdf-wasm/qpdf.js';
import { QPDF_WASM_DEFLATED_BASE64 } from './qpdf-wasm.generated';
import { inflateDeflated } from './inflate';

let wasmDataUrlPromise: Promise<string> | null = null;

/** Inflate the bundled binary once and cache the data: URI it produces. */
function wasmDataUrl(): Promise<string> {
  if (!wasmDataUrlPromise) {
    wasmDataUrlPromise = (async () => {
      const deflated = Uint8Array.from(atob(QPDF_WASM_DEFLATED_BASE64), (c) => c.charCodeAt(0));
      const wasm = await inflateDeflated(deflated);
      let binary = '';
      for (let i = 0; i < wasm.length; i++) binary += String.fromCharCode(wasm[i]);
      return 'data:application/octet-stream;base64,' + btoa(binary);
    })();
  }
  return wasmDataUrlPromise;
}

function describeFailure(log: string[], verb: string): string {
  const text = log.join(' ');
  if (/invalid password/i.test(text)) {
    return `This PDF already has a password. Remove its existing protection first (Unlock PDF), then ${verb} it.`;
  }
  if (/can.t find pdf header|can.t find startxref/i.test(text)) {
    return 'This does not look like a valid PDF file.';
  }
  return `Could not ${verb} this PDF${text ? `: ${text}` : '.'}`;
}

/**
 * Runs qpdf with the given CLI args against `inputBytes`, reading the result
 * back from `out.pdf`. Shared by every qpdf-backed operation so the module
 * setup, console interception, and error mapping live in one place.
 *
 * `verb` only shapes error text (e.g. "protect", "compress") — it has no
 * effect on what qpdf actually does; that is entirely up to `args`.
 */
async function runQpdf(inputBytes: Uint8Array, args: string[], verb: string): Promise<Uint8Array> {
  const dataUrl = await wasmDataUrl();
  const log: string[] = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (...a: unknown[]) => log.push(a.map(String).join(' '));
  console.error = (...a: unknown[]) => log.push(a.map(String).join(' '));

  try {
    const mod = await createQpdfModule({
      noInitialRun: true,
      locateFile: () => dataUrl,
    });

    mod.FS.writeFile('in.pdf', inputBytes);
    const exitCode = mod.callMain(args);
    if (exitCode !== 0) {
      throw new Error(describeFailure(log, verb));
    }

    try {
      return mod.FS.readFile('out.pdf');
    } catch {
      throw new Error(describeFailure(log, verb));
    }
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
}

/**
 * Encrypts `inputBytes` with AES-256 (qpdf's strongest, and its default
 * "256" key length — "128" maps to legacy RC4, which qpdf itself now refuses
 * to write without an extra weak-crypto override, so it is not offered here).
 *
 * The same password is used for both the user and owner password, matching
 * what "add a password to open this PDF" means to someone using this tool —
 * there is no UI for the separate permissions an owner password normally
 * controls.
 */
export async function encryptPdfBytes(inputBytes: Uint8Array, password: string): Promise<Uint8Array> {
  return runQpdf(inputBytes, ['--encrypt', password, password, '256', '--', 'in.pdf', 'out.pdf'], 'protect');
}

/**
 * Recompresses `inputBytes` (F-14) — mainly embedded images, plus already-
 * compressed content streams at a higher ratio.
 *
 * `--optimize-images` re-encodes images as JPEG when that comes out smaller,
 * using qpdf's own built-in size thresholds to skip images too small for the
 * format-conversion overhead to be worth it — deliberately not overridden
 * here, rather than inventing untested threshold numbers. This step is lossy
 * for any image it actually re-encodes; callers must disclose that, not
 * treat compression as free.
 *
 * `--recompress-flate --compression-level=9` uncompresses and recompresses
 * already-flate-compressed content streams at the highest ratio --
 * `--compress-streams=y` (qpdf's default) only compresses streams that are
 * currently uncompressed, so most PDFs need this second pass to actually
 * shrink further.
 *
 * `--object-streams=generate` compacts the xref/object tables. This produces
 * the compressed-xref shape `stripStaleXRefStreamObjects` (pdf-ops.ts) fixed
 * `loadPdf` to handle safely under **P1-17** — safe to use here as a result.
 *
 * Does not attempt to compress an already-encrypted input; qpdf reports a
 * password error, mapped to a message pointing at Unlock PDF, same as
 * `encryptPdfBytes` does for a source that's already protected.
 */
export async function compressPdfBytes(inputBytes: Uint8Array): Promise<Uint8Array> {
  return runQpdf(
    inputBytes,
    ['--optimize-images', '--recompress-flate', '--compression-level=9', '--object-streams=generate', 'in.pdf', 'out.pdf'],
    'compress',
  );
}
