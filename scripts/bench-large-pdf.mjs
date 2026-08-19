#!/usr/bin/env node
/**
 * Large-document benchmark: how the real built app performs on a document
 * shaped like a real office file at scale — hundreds of pages, a mix of
 * text and scanned-looking image content, several MB total.
 *
 * This is a manual, on-demand check (not run in CI): it exists so the
 * numbers in docs/PERFORMANCE.md are reproducible and re-checkable after a
 * change, not just asserted once and left to go stale.
 *
 * Usage: node scripts/bench-large-pdf.mjs
 * Requires Playwright's Chromium and a fresh `npm run build`.
 *
 * Tunable via env vars:
 *   BENCH_PAGES=800 BENCH_IMG_EVERY=5 BENCH_IMG_SIZE=400 node scripts/bench-large-pdf.mjs
 *   BENCH_SUBSET="Compress,Protect" node scripts/bench-large-pdf.mjs   # only matching labels
 */
import { chromium } from "playwright";
import { existsSync, mkdtempSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";

const DIST_PATH = new URL("../dist/offgridpdf.html", import.meta.url).pathname;
const DIST = "file://" + DIST_PATH;
if (!existsSync(DIST_PATH)) {
  console.error("✗ dist/offgridpdf.html not found — run `npm run build` first.");
  process.exit(1);
}

// --- Minimal PNG encoder (random pixel data — incompressible, so file size
// is predictable and representative of a scanned/photo page, not a
// degenerate solid-color image that would compress to nothing). ---
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
    raw[rowStart] = 0; // filter: none
    randomBytes(width * 3).copy(raw, rowStart + 1);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

async function makeLargePdf({ pages, imageEveryNPages, imageSize }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const noisePng = makeNoisePng(imageSize, imageSize);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([612, 792]); // US Letter
    page.drawText(`Document page ${i} of ${pages}`, { x: 50, y: 740, size: 14, font });
    for (let line = 0; line < 30; line++) {
      page.drawText(
        `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Line ${line + 1} on page ${i}.`,
        { x: 50, y: 700 - line * 20, size: 10, font, color: rgb(0.2, 0.2, 0.2) },
      );
    }
    if (i % imageEveryNPages === 0) {
      const embedded = await doc.embedPng(noisePng);
      const dim = embedded.scale(imageSize > 400 ? 400 / imageSize : 1);
      page.drawImage(embedded, { x: 106, y: 60, width: dim.width, height: dim.height });
    }
  }
  return Buffer.from(await doc.save());
}

const PAGES = Number(process.env.BENCH_PAGES ?? 400);
const IMG_EVERY = Number(process.env.BENCH_IMG_EVERY ?? 20);
const IMG_SIZE = Number(process.env.BENCH_IMG_SIZE ?? 300);
const SUBSET = process.env.BENCH_SUBSET; // comma-separated substrings, or unset for all

console.log(`Generating a synthetic test PDF: ${PAGES} pages, image every ${IMG_EVERY} pages @ ${IMG_SIZE}px...`);
const pdfBytes = await makeLargePdf({ pages: PAGES, imageEveryNPages: IMG_EVERY, imageSize: IMG_SIZE });
const dir = mkdtempSync(join(tmpdir(), "bench-large-pdf-"));
const bigPdfPath = join(dir, "big.pdf");
writeFileSync(bigPdfPath, pdfBytes);
const sizeMb = (statSync(bigPdfPath).size / (1024 * 1024)).toFixed(1);
console.log(`  ${bigPdfPath} — ${sizeMb} MB, ${PAGES} pages`);

const launchOptions = {};
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
page.on("pageerror", (e) => console.error("  [page error]", String(e).split("\n")[0]));

const results = [];
async function timed(label, fn) {
  if (SUBSET && !SUBSET.split(",").some((s) => label.includes(s))) return;
  const start = Date.now();
  try {
    const extra = await fn();
    const ms = Date.now() - start;
    results.push({ label, ms, ok: true });
    console.log(`  ✓ ${label}: ${ms}ms${extra ? "  (" + extra + ")" : ""}`);
  } catch (err) {
    const ms = Date.now() - start;
    results.push({ label, ms, ok: false, error: String(err).split("\n")[0] });
    console.log(`  ✗ ${label}: FAILED after ${ms}ms — ${String(err).split("\n")[0]}`);
  }
}
// Tools are grouped under category tabs (F-23) — only the active category's
// cards are in the DOM, so the right tab has to be selected before a tool's
// h3 can be found at all.
async function openTool(category, name) {
  await page.goto(DIST, { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.locator("[data-testid=category-tabs] button", { hasText: category }).click();
  await page.waitForTimeout(150);
  await page.locator("h3", { hasText: name }).first().click();
  await page.waitForTimeout(300);
}
async function clickAndDownload(buttonNameRegex, timeout = 120000) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout }),
    page.getByRole("button", { name: buttonNameRegex }).first().click(),
  ]);
  const path = await download.path();
  return path ? statSync(path).size : 0;
}

console.log(`\nRunning tools against the ${PAGES}-page / ${sizeMb} MB file:\n`);

await timed("Split (extract 1-50)", async () => {
  await openTool("Organize Pages", "Split PDF");
  await page.locator("input[type=file]").setInputFiles(bigPdfPath);
  await page.waitForTimeout(400);
  await page.locator("input#pages").fill("1-50");
  await clickAndDownload(/Split/i);
});

await timed("Merge (2x big file)", async () => {
  await openTool("Organize Pages", "Merge PDF");
  await page.locator("input[type=file]").setInputFiles([bigPdfPath, bigPdfPath]);
  await page.waitForTimeout(400);
  await clickAndDownload(/Merge/i);
});

await timed("Compress", async () => {
  await openTool("Edit & Enhance", "Compress PDF");
  await page.locator("input[type=file]").setInputFiles(bigPdfPath);
  await page.waitForTimeout(400);
  await clickAndDownload(/Compress PDF/i);
});

await timed("Add Watermark", async () => {
  await openTool("Edit & Enhance", "Add Watermark");
  await page.locator("input[type=file]").setInputFiles(bigPdfPath);
  await page.waitForTimeout(400);
  await page.locator("input#text").fill("CONFIDENTIAL");
  await clickAndDownload(/Add Watermark/i);
});

await timed("Add Page Numbers", async () => {
  await openTool("Edit & Enhance", "Add Page Numbers");
  await page.locator("input[type=file]").setInputFiles(bigPdfPath);
  await page.waitForTimeout(400);
  await clickAndDownload(/Add Page Numbers/i);
});

await timed("Protect (AES-256)", async () => {
  await openTool("Security", "Protect PDF");
  await page.locator("input[type=file]").setInputFiles(bigPdfPath);
  await page.waitForTimeout(400);
  await page.locator("input#password").fill("bench-pass-123");
  await page.locator("input#confirm-password").fill("bench-pass-123");
  await clickAndDownload(/Protect PDF/i);
});

// The preview always internally renders every page (see docs/PERFORMANCE.md
// and the F-20 finding) but only *displays* PREVIEW_LIMIT (12). This
// measures the real, currently-wasted internal cost.
await timed("PDF to Images — preview (renders every page, shows 12)", async () => {
  await openTool("Convert & Export", "PDF to Images");
  await page.locator("input[type=file]").setInputFiles(bigPdfPath);
  await page.waitForSelector("[data-testid=page-previews] img", { timeout: 180000 });
});

await timed("PDF to Images — full export as PNGs (zip)", async () => {
  await openTool("Convert & Export", "PDF to Images");
  await page.locator("input[type=file]").setInputFiles(bigPdfPath);
  await page.waitForSelector("[data-testid=page-previews] img", { timeout: 180000 });
  await clickAndDownload(/Export Pages/i, 240000);
});

// F-21: Redact now scans every page's size (getPageSizes) as soon as a file
// is selected, to know which pages are safe to copy a box onto. Measures
// time from file-select to that scan completing (the page-count label
// appearing), not a full redaction — mouse-drag drawing isn't part of the
// reproducible suite (see docs/PERFORMANCE.md).
await timed("Redact — page-size scan on file select", async () => {
  await openTool("Security", "Redact PDF");
  await page.locator("input[type=file]").setInputFiles(bigPdfPath);
  await page.waitForSelector(`text=/Page 1 of ${PAGES}/`, { timeout: 180000 });
});

await browser.close();

console.log("\n--- Summary ---");
console.log(`File: ${PAGES} pages, ${sizeMb} MB (every ${IMG_EVERY}th page carries a scanned-style image)`);
for (const r of results) {
  console.log(`${r.ok ? "OK  " : "FAIL"}  ${r.label.padEnd(45)} ${r.ms}ms${r.ok ? "" : "  — " + r.error}`);
}
const failed = results.filter((r) => !r.ok);
if (failed.length) process.exit(1);
