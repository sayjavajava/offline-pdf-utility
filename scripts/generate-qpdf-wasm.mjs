#!/usr/bin/env node
/**
 * Bundles @jspawn/qpdf-wasm's qpdf.wasm binary into the source tree.
 *
 * qpdf-wasm's loader (qpdf.js) only knows how to `fetch()` its wasm binary as
 * a sibling file, which this app cannot do: it ships as one file opened from
 * disk, where fetching a sibling is blocked by the null origin. Its loader
 * does honor a `locateFile` hook though, and `fetch()` itself resolves a
 * `data:` URI locally rather than over the network — so pointing `locateFile`
 * at a base64 data URI built from this file loads and runs the module with
 * zero network requests. Verified against the real file:// build with every
 * non-local request blocked before this was relied on.
 *
 * The output is generated rather than committed so it always matches the
 * installed @jspawn/qpdf-wasm. A committed copy would silently go stale on
 * the next upgrade.
 *
 * Deflated before base64-encoding, like the CMap bundle — wasm binaries
 * compress to roughly a third of their raw size — and inflated on demand via
 * the same DecompressionStream helper (src/lib/inflate.ts).
 *
 * Runs automatically via the `prepare` script after `npm install` / `npm ci`.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = join(root, "node_modules", "@jspawn", "qpdf-wasm", "qpdf.wasm");
const outFile = join(root, "src", "lib", "qpdf-wasm.generated.ts");

let raw;
try {
  raw = readFileSync(wasmPath);
} catch {
  console.error(`✗ ${wasmPath} not found — is @jspawn/qpdf-wasm installed?`);
  process.exit(1);
}

const packed = deflateSync(raw, { level: 9 });

const banner = `// GENERATED FILE — do not edit, and do not commit.
// Produced by scripts/generate-qpdf-wasm.mjs from the installed @jspawn/qpdf-wasm.
// Regenerate with: node scripts/generate-qpdf-wasm.mjs
//
// qpdf.wasm, deflated then base64-encoded.
// ${(raw.length / 1024 / 1024).toFixed(2)} MB raw -> ${(packed.length / 1024 / 1024).toFixed(2)} MB packed.

/** qpdf.wasm, deflate-compressed, base64-encoded. Inflate before use. */
export const QPDF_WASM_DEFLATED_BASE64 = "${packed.toString("base64")}";
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, banner);

console.log(
  `✓ Bundled qpdf.wasm -> src/lib/qpdf-wasm.generated.ts ` +
    `(${(raw.length / 1024 / 1024).toFixed(2)} MB raw, ${(packed.length / 1024 / 1024).toFixed(2)} MB packed)`,
);
