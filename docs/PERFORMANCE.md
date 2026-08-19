# Large-file performance

Verified, not assumed: this documents real runs of the actual built app against synthetic
large documents, not estimates. Every number below came from `scripts/bench-large-pdf.mjs`
(the core suite) or a one-time comprehensive pass using the same fixture-generation approach
(the full 16-tool sweep) — both load the real `dist/index.html` in a real Chromium instance via
Playwright, the same way `check:offline:runtime` does, and drive each tool exactly as a user
would: pick a file, fill the form, click the button, wait for the download.

## Test documents

Synthetic PDFs generated in-memory (`@cantoo/pdf-lib`), sized to resemble a real office
document rather than a degenerate worst case: each page carries 30 lines of real text, and
every Nth page also embeds an incompressible noise PNG standing in for a scanned page or photo
(random pixel data, so its size can't be inflated by compression the way a solid-color test
image would be).

| Tier | Pages | Size | Shape |
|---|---|---|---|
| Realistic | 400 | 5.8 MB | image every 20th page |
| Heavy (scanned-contracts style) | 800 | 74.6 MB | image every 5th page |

## Results — all 16 tools, realistic tier (400 pages / 5.8 MB)

One comprehensive pass, every tool exercised end to end (file in, button clicked, download
verified):

| Tool | Time | Note |
|---|---|---|
| Split | 2.7s | |
| Merge (2× the file) | 2.7s | 11.6 MB out |
| Edit Metadata | 2.2s | |
| Convert to PDF (8.6 MB image) | 2.9s | |
| Convert to PDF (DOCX, 150 paragraphs) | 1.8s | |
| Protect (AES-256) | 3.2s | |
| Unlock | 2.5s | using Protect's own output as the fixture |
| Add Watermark | 2.1s | |
| Rotate | 1.7s | |
| Delete / Reorder | 1.6s | |
| Add Page Numbers | 2.0s | |
| Extract Images | 1.7s | 20 embedded images |
| Extract Text | 2.6s | |
| Compress | 2.9s | |
| Crop / Resize | 2.0s | |
| PDF to Images (preview + full 400-page export) | 20.2s | see caveat below |
| Redact (10 real drag-drawn boxes) | 7.2s | includes manual navigation, not just compute |

**17/17 passed** (Convert counted twice: image and DOCX).

## Results — heavy tier (800 pages / 74.6 MB)

The operations most sensitive to file size — the ones actually going through qpdf's WASM
module or doing per-page rendering — re-run against a much heavier, denser document:

| Tool | Time |
|---|---|
| Merge (2× the file, 1600 pages out) | 5.8s |
| Split (extract 1-50) | 1.8s |
| Compress | 7.2s |
| Protect (AES-256) | 6.1s |
| PDF to Images preview (renders all 800 pages internally) | 15.6s |

Nothing failed, crashed, or hit a memory ceiling at 74.6 MB.

## Reproduce it yourself

```bash
npm run build
npm run bench:large-pdf                                    # 400-page tier, core suite
BENCH_PAGES=800 BENCH_IMG_EVERY=5 BENCH_IMG_SIZE=400 \
  npm run bench:large-pdf                                  # heavy tier
BENCH_SUBSET="Compress,Protect" npm run bench:large-pdf     # only matching tools
```

The core suite covers the operations most likely to regress on a future change — the six
worker-dispatched bulk operations, plus both halves of PDF to Images — rather than all 16, to
keep it fast enough to actually run before a release. The full 16-tool numbers above are a
point-in-time comprehensive pass using the same methodology and fixture shapes.

## Known issue this testing surfaced

**PDF to Images renders the entire document just to show 12 thumbnails.** The preview always
internally renders every page — even though it only ever displays the first 12 — which is why
its numbers above (8.2s at 400 pages, 15.6s at 800) are the outlier: pure wasted work, and a
real main-thread freeze while it happens (this path isn't worker-offloaded — it needs a canvas,
which the app's worker doesn't have access to). Being tracked as a fix; the export path itself
(what a user actually downloads) is unaffected and already fast.

## What this doesn't tell you

This is a single desktop-class machine running one operation at a time, not a stress test of
concurrent tabs, low-memory devices, or documents shaped very differently from these two tiers
(e.g., thousands of pages, or images far larger than the ~300-470 KB ones used here). Treat
these numbers as "this works well at realistic office-document scale," not as a guaranteed
ceiling.
