#!/usr/bin/env node
/**
 * Runtime half of the offline guarantee.
 *
 * Loads the real built page from disk with every non-local request blocked,
 * drives each tool, and asserts that nothing was ever requested. This is the
 * check that actually proves the promise: static analysis cannot see a URL
 * assembled at runtime, and cannot tell a vendored code path that is present
 * from one that runs.
 *
 * Any attempt to reach the network is both a privacy leak (it reveals that
 * someone opened the app, and when) and a functional break (a page opened from
 * disk has a `null` origin, so the request fails anyway).
 *
 * Usage: node scripts/check-offline-runtime.mjs
 * Requires Playwright's Chromium. Set PLAYWRIGHT_CHROMIUM_PATH to override.
 */
import { chromium } from "playwright";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";

const DIST = new URL("../dist/index.html", import.meta.url).href;
if (!existsSync(new URL("../dist/index.html", import.meta.url).pathname)) {
  console.error("✗ dist/index.html not found — run `npm run build` first.");
  process.exit(1);
}

/** A PDF with real text in a non-embedded standard font — the case most likely
 *  to make a renderer reach for font data over the network. */
async function makeSamplePdf(dir) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const size of [[400, 200], [300, 300]]) {
    doc.addPage(size).drawText("Offline integrity check", { x: 20, y: 100, font, size: 16 });
  }
  const path = join(dir, "sample.pdf");
  writeFileSync(path, await doc.save());
  return path;
}

const dir = mkdtempSync(join(tmpdir(), "offline-check-"));
const samplePdf = await makeSamplePdf(dir);

const launchOptions = {};
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
}
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ acceptDownloads: true });

const attempts = [];
const isLocal = (url) =>
  url.startsWith("file://") || url.startsWith("blob:") || url.startsWith("data:") || url === "about:blank";

// Covers the page and every worker it spawns.
await context.route("**/*", (route) => {
  const url = route.request().url();
  if (!isLocal(url)) {
    attempts.push(`${route.request().method()} ${url}`);
    return route.abort();
  }
  return route.continue();
});

const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error).split("\n")[0]));
page.on("requestfailed", (request) => {
  if (!isLocal(request.url())) attempts.push(`FAILED ${request.url()}`);
});

await page.goto(DIST, { waitUntil: "load" });
await page.waitForTimeout(1200);

// Tools are grouped under category tabs (F-23) — only the active category's
// cards are in the DOM, so every tool must be discovered per-tab, not off a
// single flat query.
const categoryTabs = await page.locator("[data-testid=category-tabs] button").allTextContents();
if (categoryTabs.length === 0) {
  console.error("✗ The dashboard rendered no category tabs — the page did not start from file://.");
  await browser.close();
  process.exit(1);
}

const toolsByCategory = [];
for (let i = 0; i < categoryTabs.length; i++) {
  await page.locator("[data-testid=category-tabs] button").nth(i).click();
  await page.waitForTimeout(150);
  const tools = await page.locator("h3").allTextContents();
  toolsByCategory.push({ categoryIndex: i, tools });
}
const totalTools = toolsByCategory.reduce((n, c) => n + c.tools.length, 0);
if (totalTools === 0) {
  console.error("✗ No tool cards found in any category — the page did not start from file://.");
  await browser.close();
  process.exit(1);
}

// Open every tool, in every category. A tool that only reaches out when
// opened would otherwise slip through a check that never leaves the
// dashboard.
for (const { categoryIndex, tools } of toolsByCategory) {
  for (const tool of tools) {
    await page.goto(DIST, { waitUntil: "load" });
    await page.waitForTimeout(250);
    await page.locator("[data-testid=category-tabs] button").nth(categoryIndex).click();
    await page.waitForTimeout(150);
    await page.locator("h3", { hasText: tool }).first().click();
    await page.waitForTimeout(250);
  }
}

// Then actually process a document, including the rendering path.
await page.goto(DIST, { waitUntil: "load" });
await page.waitForTimeout(400);
const convertExportIndex = categoryTabs.findIndex((t) => t.startsWith("Convert & Export"));
await page.locator("[data-testid=category-tabs] button").nth(convertExportIndex).click();
await page.waitForTimeout(150);
await page.locator("h3", { hasText: "PDF to Images" }).first().click();
await page.waitForTimeout(250);
await page.locator("input[type=file]").setInputFiles(samplePdf);
await page
  .waitForSelector("[data-testid=page-previews] img", { timeout: 20000 })
  .catch(() => null);
await page.waitForTimeout(2500);

const rendered = await page.locator("[data-testid=page-previews] img").count();

await browser.close();

if (attempts.length > 0) {
  console.error(`✗ Offline guarantee broken — ${attempts.length} network request(s) attempted:\n`);
  for (const attempt of [...new Set(attempts)].slice(0, 15)) console.error(`  • ${attempt}`);
  console.error(
    "\nUsers are promised that nothing leaves their machine and that this runs\n" +
      "with no connection. Inline whatever this was reaching for.\n",
  );
  process.exit(1);
}

if (pageErrors.length > 0) {
  console.error("✗ The page raised errors while running offline:\n");
  for (const error of pageErrors.slice(0, 8)) console.error(`  • ${error}`);
  process.exit(1);
}

if (rendered === 0) {
  console.error(
    "✗ No page previews rendered. Nothing was fetched, but the renderer also\n" +
      "  produced nothing — an offline build that cannot render is still broken.",
  );
  process.exit(1);
}

console.log(
  `✓ Offline runtime verified — ${totalTools} tools opened across ${categoryTabs.length} categories, ` +
    `a text PDF rendered (${rendered} preview${rendered === 1 ? "" : "s"}), 0 network requests.`,
);
