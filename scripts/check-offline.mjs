#!/usr/bin/env node
/**
 * Static half of the offline guarantee.
 *
 * The product promise is that you can download one file, disconnect, and run
 * it forever — and that nothing you open ever leaves your machine. That held
 * when it was last checked by hand, which is not the same as it holding after
 * the next dependency bump.
 *
 * This asserts two structural properties of the build:
 *
 *   1. The build is ONE self-contained page. Any sibling .js/.css/.wasm/font
 *      would have to be fetched, and a page opened from disk has a `null`
 *      origin and cannot fetch siblings — it would simply fail to start (this
 *      is exactly how P0-1 shipped broken).
 *   2. Nothing in that page sits in a position the browser would fetch from,
 *      or calls a network API with an absolute URL.
 *
 * It deliberately does NOT flag every http:// substring. The bundle is full of
 * XML namespace identifiers (w3.org, openxmlformats.org, ns.adobe.com) and
 * licence comments that merely look like URLs and are never requested. Flagging
 * those would train everyone to ignore this check. Only fetchable positions
 * count.
 *
 * Static analysis cannot see a URL assembled at runtime, so this is the cheap
 * first line; check-offline-runtime.mjs proves the property by actually
 * loading the page with the network cut.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST = new URL("../dist/", import.meta.url).pathname;
const failures = [];

// The single self-contained page vite.config.ts's rename-shipped-output
// plugin renames dist/index.html to, after the build.
const MAIN_PAGE = "offgridpdf.html";

// Files the page never requests: they exist only if a host or OS asks for them
// out-of-band, and their absence does not stop the app working offline.
const INERT_SIBLINGS = new Set([MAIN_PAGE, "favicon.ico", "robots.txt", "placeholder.svg"]);

// ---------------------------------------------------------------------------
// 1. One self-contained page
// ---------------------------------------------------------------------------
let entries;
try {
  entries = readdirSync(DIST);
} catch {
  console.error("✗ dist/ not found — run `npm run build` first.");
  process.exit(1);
}

for (const name of entries) {
  if (statSync(join(DIST, name)).isDirectory()) {
    failures.push(`dist/${name}/ is a directory — the build must emit a single page.`);
    continue;
  }
  if (!INERT_SIBLINGS.has(name)) {
    failures.push(
      `dist/${name} is a sibling file the page may need to fetch. ` +
        `Assets must be inlined; a file:// page cannot fetch siblings.`,
    );
  }
}

const html = readFileSync(join(DIST, MAIN_PAGE), "utf8");

// ---------------------------------------------------------------------------
// 2. Nothing fetchable points off-machine
// ---------------------------------------------------------------------------
const EXTERNAL = String.raw`(?:https?:)?\/\/[^"'\s)]+`;

/**
 * Only markup and stylesheet positions — the ones we author and the browser
 * resolves before any script runs.
 *
 * JavaScript network APIs are deliberately NOT matched here. The bundle
 * vendors pdf.js and mammoth, which contain `XMLHttpRequest` and `fetch` in
 * code paths this app never enters (pdf.js can load a PDF from a URL; we only
 * ever hand it bytes). Flagging their presence would fire on every build, and
 * a check that always fires is a check everyone learns to skip. Whether any of
 * them actually runs is a runtime question — check-offline-runtime.mjs answers
 * it by loading the page with the network cut.
 */
const FETCHABLE_POSITIONS = [
  [`<script[^>]+\\bsrc\\s*=\\s*["']${EXTERNAL}`, "i", "a <script src> pointing off-machine"],
  [`<link[^>]+\\bhref\\s*=\\s*["']${EXTERNAL}`, "i", "a <link href> (stylesheet, preconnect, prefetch…)"],
  [`<(?:img|iframe|video|audio|source|embed|track)[^>]+\\bsrc\\s*=\\s*["']${EXTERNAL}`, "i", "a media/frame src"],
  [`\\bsrcset\\s*=\\s*["'][^"']*${EXTERNAL}`, "i", "a srcset entry"],
  // Case-sensitive, and not preceded by an identifier character, so the CSS
  // `url(...)` function is matched but JavaScript's `new URL(...)` is not.
  [`(?<![A-Za-z0-9_$.])url\\(\\s*["']?${EXTERNAL}`, "", "a CSS url() reference"],
  [`@import\\s+(?:url\\()?\\s*["']${EXTERNAL}`, "i", "a CSS @import"],
];

for (const [pattern, flags, description] of FETCHABLE_POSITIONS) {
  const matches = [...html.matchAll(new RegExp(pattern, `g${flags}`))];
  for (const match of matches.slice(0, 3)) {
    const excerpt = match[0].replace(/\s+/g, " ").slice(0, 110);
    failures.push(`${description}: ${excerpt}`);
  }
  if (matches.length > 3) {
    failures.push(`  …and ${matches.length - 3} more of: ${description}`);
  }
}

// ---------------------------------------------------------------------------
if (failures.length > 0) {
  console.error("✗ Offline guarantee broken:\n");
  for (const failure of failures) console.error(`  • ${failure}`);
  console.error(
    "\nThis app is distributed as one file people open from disk with no network.\n" +
      "Anything fetchable either leaks that they opened it, or simply fails.\n" +
      "Inline the asset rather than relaxing this check.\n",
  );
  process.exit(1);
}

const sizeMb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);
console.log(`✓ Offline build intact — single self-contained page, ${sizeMb} MB, nothing fetchable.`);
