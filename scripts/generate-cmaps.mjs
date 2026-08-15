#!/usr/bin/env node
/**
 * Bundles pdf.js's predefined CMap tables into the source tree.
 *
 * PDFs that use a predefined CMap encoding (UniJIS-UCS2-H and friends — common
 * in CJK documents) with a non-embedded font need these tables to render at
 * all. pdf.js normally fetches them from `cMapUrl`, which this app cannot do:
 * it ships as one file opened from disk, where fetching a sibling is blocked.
 * Without them the page renders completely blank while still reporting success.
 *
 * The output is generated rather than committed so it always matches the
 * installed pdfjs-dist. A committed copy would silently go stale on the next
 * upgrade, and stale CMap data fails in ways that look like a rendering bug.
 *
 * Each table is deflated before base64-encoding (about 16% smaller than raw
 * base64) and inflated on demand, so only the CMaps a document actually uses
 * are ever decompressed.
 *
 * Runs automatically via the `prepare` script after `npm install` / `npm ci`.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cmapDir = join(root, "node_modules", "pdfjs-dist", "cmaps");
const outFile = join(root, "src", "lib", "pdf-cmaps.generated.ts");

let names;
try {
  names = readdirSync(cmapDir).filter((n) => n.endsWith(".bcmap")).sort();
} catch {
  console.error(`✗ ${cmapDir} not found — is pdfjs-dist installed?`);
  process.exit(1);
}

if (names.length === 0) {
  console.error("✗ No .bcmap files found; refusing to write an empty CMap bundle.");
  process.exit(1);
}

let rawTotal = 0;
let packedTotal = 0;
const entries = names.map((name) => {
  const raw = readFileSync(join(cmapDir, name));
  const packed = deflateSync(raw, { level: 9 });
  rawTotal += raw.length;
  packedTotal += packed.length;
  // Key without the extension: pdf.js asks for the CMap by bare name.
  return `  ${JSON.stringify(name.replace(/\.bcmap$/, ""))}: "${packed.toString("base64")}",`;
});

const banner = `// GENERATED FILE — do not edit, and do not commit.
// Produced by scripts/generate-cmaps.mjs from the installed pdfjs-dist.
// Regenerate with: node scripts/generate-cmaps.mjs
//
// ${names.length} predefined CMap tables, deflated then base64-encoded.
// ${(rawTotal / 1024 / 1024).toFixed(2)} MB raw -> ${(packedTotal / 1024 / 1024).toFixed(2)} MB packed.

/** CMap name (no extension) -> deflate-compressed table, base64-encoded. */
export const PACKED_CMAPS: Record<string, string> = {
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, banner + entries.join("\n") + "\n};\n");

console.log(
  `✓ Bundled ${names.length} CMaps -> src/lib/pdf-cmaps.generated.ts ` +
    `(${(rawTotal / 1024 / 1024).toFixed(2)} MB raw, ${(packedTotal / 1024 / 1024).toFixed(2)} MB packed)`,
);
