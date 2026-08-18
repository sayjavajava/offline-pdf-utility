/**
 * F-1: password-protect a PDF, via qpdf compiled to WASM.
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

function describeFailure(log: string[]): string {
  const text = log.join(' ');
  if (/invalid password/i.test(text)) {
    return 'This PDF already has a password. Remove its existing protection first (Unlock PDF), then protect it again.';
  }
  if (/can.t find pdf header|can.t find startxref/i.test(text)) {
    return 'This does not look like a valid PDF file.';
  }
  return `Could not protect this PDF${text ? `: ${text}` : '.'}`;
}

/**
 * Runs one qpdf CLI invocation against `inputBytes` and returns the output
 * file's bytes. Shared by encryptPdfBytes and encryptPdfBytesWithPermissions
 * so both go through the same virtual-filesystem/console-interception
 * mechanics instead of duplicating them.
 */
async function runQpdfEncrypt(inputBytes: Uint8Array, args: string[]): Promise<Uint8Array> {
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
      throw new Error(describeFailure(log));
    }

    try {
      return mod.FS.readFile('out.pdf');
    } catch {
      throw new Error(describeFailure(log));
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
 * controls. See encryptPdfBytesWithPermissions (F-17) for that.
 */
export async function encryptPdfBytes(inputBytes: Uint8Array, password: string): Promise<Uint8Array> {
  return runQpdfEncrypt(inputBytes, ['--encrypt', password, password, '256', '--', 'in.pdf', 'out.pdf']);
}

export type PdfPermissions = {
  /** How much printing is allowed for a reader who only has the open password. */
  print: 'none' | 'low' | 'full';
  /** Allow copying text/images out of the document. */
  extract: boolean;
  /**
   * Allow document modification. qpdf's own scale has five levels
   * (none/assembly/form/annotate/all); this UI collapses that to a binary for
   * v1 — see F-17 in docs/CODE_AUDIT.md.
   */
  modify: 'none' | 'all';
};

/**
 * Encrypts `inputBytes` with AES-256, distinct open (user) and permissions
 * (owner) passwords, and restriction flags (F-17).
 *
 * `qpdf --help=encryption` (verified, not assumed — see docs/CODE_AUDIT.md)
 * documents that restrictions are enforced only for whoever opens the
 * document with the *open* password: anyone who supplies the *permissions*
 * password gets full, unrestricted access regardless of these flags. Passing
 * the same string for both would silently produce a file that looks
 * protected but enforces nothing — the exact "looks like success, does
 * nothing" shape this audit has flagged elsewhere (P0-5, P1-17) — so that
 * case is rejected here rather than left to produce a working-looking no-op.
 */
export async function encryptPdfBytesWithPermissions(
  inputBytes: Uint8Array,
  openPassword: string,
  permissionsPassword: string,
  permissions: PdfPermissions,
): Promise<Uint8Array> {
  if (!permissionsPassword) {
    throw new Error('Enter a permissions password.');
  }
  if (permissionsPassword.length < 4) {
    throw new Error('Use a permissions password of at least 4 characters.');
  }
  if (permissionsPassword === openPassword) {
    throw new Error(
      'The permissions password must differ from the open password — otherwise anyone who can open the file can also bypass every restriction.',
    );
  }

  return runQpdfEncrypt(inputBytes, [
    '--encrypt',
    openPassword,
    permissionsPassword,
    '256',
    `--print=${permissions.print}`,
    `--modify=${permissions.modify}`,
    `--extract=${permissions.extract ? 'y' : 'n'}`,
    '--',
    'in.pdf',
    'out.pdf',
  ]);
}
