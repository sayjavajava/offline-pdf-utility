# Large-file performance

Verified, not assumed: this documents real runs of the actual built app against synthetic
large documents, not estimates. Every number below came from `scripts/bench-large-pdf.mjs`
(the core suite) or a one-time comprehensive pass using the same fixture-generation approach
(the full 16-tool sweep) — both load the real `dist/offgridpdf.html` in a real Chromium instance via
Playwright, the same way `check:offline:runtime` does, and drive each tool exactly as a user
would: pick a file, fill the form, click the button, wait for the download.

**Convention:** any PR that adds a new feature or changes how an existing one processes a
user's file gets a real large-scale run added or updated here, in the same PR — not deferred to
"later" and not left for someone to notice is missing. A feature that works on a 3-page test
fixture and has never been run at realistic scale is unverified, not done.

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

## Results — combining images into one PDF (F-22)

Convert to PDF's batch mode (select several JPEG/PNG files, get one multi-page PDF back) has a
different shape than the rest of this document: many separate input files rather than one large
one. Measured with `scripts/bench-image-batch.mjs`, same real-browser methodology — each image
is independently generated, incompressible noise, so file size isn't inflated by compression the
way a solid-color test image would be:

| Tier | Images | Total input | Result | Time |
|---|---|---|---|---|
| Realistic | 50 (300×300) | 12.9 MB | correct 50-page PDF | 1.5s |
| Heavy | 200 (500×500) | 143.2 MB | correct 200-page PDF | 12.1s |

This operation is worker-dispatched (`pdf-utils.ts` routes `convertImageToPdf` through the
worker, unlike Redact or DOCX conversion), so the UI stays responsive while it runs even at the
heavy tier. Both runs produced the exact expected page count — verified by loading the actual
downloaded PDF, not just checking that a download happened.

## Results — Redact "apply to other pages" (F-21)

Redact now scans every page's size (`getPageSizes`) as soon as a file is selected, to know which
pages a drawn box can safely be copied onto (a box copied onto a differently-sized page would
land in the wrong place — see the F-21 write-up). `getPageSizes` only reads each page's
`/MediaBox`, no canvas or content-stream decoding, so it's a different cost shape from
`renderPdfPages` despite touching every page too:

| Tier | Pages | Size | Page-size scan |
|---|---|---|---|
| Realistic | 400 | 5.8 MB | 2.1s |
| Heavy | 800 | 74.6 MB | 2.6s |

Included in `scripts/bench-large-pdf.mjs`'s core suite (`npm run bench:large-pdf`). The actual
redact-and-apply step (drawing a box, copying it across a range, downloading the result) isn't
part of the reproducible suite — it needs real mouse-drag simulation, not just a file upload — but
was verified end to end against the real built app: a 6-page fixture with one deliberately
differently-sized page, a box drawn on page 1, applied to pages 2–6, downloaded, then fed into
this app's own Extract Text tool as the oracle. Result: pages 1, 2, 3, 4, and 6 came back with
their marker text gone (genuinely redacted), page 5 — the mismatched-size page, correctly skipped
— came back with its marker text intact, exactly as the feature promises.

## Reproduce it yourself

```bash
npm run build
npm run bench:large-pdf                                    # 400-page tier, core suite
BENCH_PAGES=800 BENCH_IMG_EVERY=5 BENCH_IMG_SIZE=400 \
  npm run bench:large-pdf                                  # heavy tier
BENCH_SUBSET="Compress,Protect" npm run bench:large-pdf     # only matching tools

npm run bench:image-batch                                  # 50-image tier
BENCH_IMAGES=200 BENCH_IMG_SIZE=500 npm run bench:image-batch  # 200-image heavy tier
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
