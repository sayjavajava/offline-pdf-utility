#!/usr/bin/env node
/**
 * Performance check for combining many images into one PDF (F-22) — the
 * project's standing convention is that any new or changed feature gets a
 * real large-scale run documented in docs/PERFORMANCE.md, not just a
 * small-scale correctness check. This is that run for F-22.
 *
 * Usage: node scripts/bench-image-batch.mjs
 * Requires Playwright's Chromium and a fresh `npm run build`.
 *
 * Tunable via env vars:
 *   BENCH_IMAGES=150 BENCH_IMG_SIZE=500 node scripts/bench-image-batch.mjs
 */
import { chromium } from "playwright";
import { existsSync, mkdtempSync, writeFileSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { PDFDocument } from "@cantoo/pdf-lib";

const DIST_PATH = new URL("../dist/index.html", import.meta.url).pathname;
const DIST = "file://" + DIST_PATH;
if (!existsSync(DIST_PATH)) {
  console.error("✗ dist/index.html not found — run `npm run build` first.");
  process.exit(1);
}

// --- Minimal PNG encoder — random pixel data, so each image is a real,
// independent, incompressible file (a solid-color test image would
// understate a real scanned-photo batch's size). ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function makeNoisePng(width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    randomBytes(width * 3).copy(raw, rowStart + 1);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const IMAGE_COUNT = Number(process.env.BENCH_IMAGES ?? 50);
const IMG_SIZE = Number(process.env.BENCH_IMG_SIZE ?? 300);

console.log(`Generating ${IMAGE_COUNT} distinct ${IMG_SIZE}x${IMG_SIZE} "scanned page" images...`);
const dir = mkdtempSync(join(tmpdir(), "bench-image-batch-"));
const imagePaths = [];
let totalBytes = 0;
for (let i = 0; i < IMAGE_COUNT; i++) {
  const png = makeNoisePng(IMG_SIZE, IMG_SIZE);
  const p = join(dir, `page-${String(i + 1).padStart(4, "0")}.png`);
  writeFileSync(p, png);
  imagePaths.push(p);
  totalBytes += png.length;
}
const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
console.log(`  ${IMAGE_COUNT} images, ${totalMb} MB total input`);

const launchOptions = {};
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
page.on("pageerror", (e) => console.error("  [page error]", String(e).split("\n")[0]));

await page.goto(DIST, { waitUntil: "load" });
await page.waitForTimeout(500);
await page.locator("[data-testid=category-tabs] button", { hasText: "Convert & Export" }).click();
await page.waitForTimeout(200);
await page.locator("h3", { hasText: "Convert to PDF" }).first().click();
await page.waitForTimeout(300);

const start = Date.now();
await page.locator("input[type=file]").setInputFiles(imagePaths);
await page.waitForTimeout(300);

const [download] = await Promise.all([
  page.waitForEvent("download", { timeout: 180000 }),
  page.getByRole("button", { name: /convert to pdf/i }).click(),
]);
const ms = Date.now() - start;
const outPath = join(dir, "out.pdf");
await download.saveAs(outPath);
await browser.close();

const bytes = readFileSync(outPath);
const doc = await PDFDocument.load(bytes);
const pageCount = doc.getPageCount();
const outMb = (bytes.length / (1024 * 1024)).toFixed(1);

console.log(`\n--- Result ---`);
console.log(`Input:  ${IMAGE_COUNT} images, ${totalMb} MB`);
console.log(`Output: ${pageCount} pages, ${outMb} MB, in ${ms}ms`);

if (pageCount !== IMAGE_COUNT) {
  console.error(`✗ FAILED — expected ${IMAGE_COUNT} pages, got ${pageCount}`);
  process.exit(1);
}
console.log(`✓ Combined ${IMAGE_COUNT} images into a correct ${pageCount}-page PDF in ${ms}ms.`);
