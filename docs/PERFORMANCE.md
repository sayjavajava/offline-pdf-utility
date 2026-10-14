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

## Results — all 16 tools at the time, realistic tier (400 pages / 5.8 MB)

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
| PDF to Images (preview + full 400-page export) | 20.2s | superseded — see the F-20 section below |
| Redact (10 real drag-drawn boxes) | 7.2s | includes manual navigation, not just compute |

**17/17 passed** (Convert counted twice: image and DOCX). This was a one-time comprehensive pass;
the PDF to Images preview number above predates the F-20 fix and is kept for the historical
record, not as the current number — see below for the fixed cost.

## Results — heavy tier (800 pages / 74.6 MB)

The operations most sensitive to file size — the ones actually going through qpdf's WASM
module or doing per-page rendering — re-run against a much heavier, denser document:

| Tool | Time |
|---|---|
| Merge (2× the file, 1600 pages out) | 5.8s |
| Split (extract 1-50) | 1.8s |
| Compress | 7.2s |
| Protect (AES-256) | 6.1s |
| PDF to Images preview (renders all 800 pages internally) | 15.6s — superseded, see F-20 below |

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

## Results — PDF to Images preview, before/after the F-20 fix

The preview used to internally render *every page* of the document via `renderPdfPages` with no
`pageNumbers` filter, then throw away all but the first 12 results — a real, avoidable
main-thread freeze that grew with document size (this path isn't worker-offloaded; it needs a
canvas, which the app's worker doesn't have access to). Fixed by asking the cheap `getPageCount`
first and rendering only the pages actually displayed:

| Tier | Pages | Before (rendered every page) | After (renders only 12) |
|---|---|---|---|
| Realistic | 400 | 8.4s | 2.5s |
| Heavy | 800 | 15.6s | 2.5s |

The fix does what the numbers suggest: cost no longer scales with document size at all, since the
preview now touches a fixed 12 pages regardless of how many the document actually has. The export
path (what a user actually downloads) was never affected — it already rendered only the pages
requested.

## Results — Compare PDFs (F-19)

Compare renders and text-extracts every shared page of *both* files — the most expensive
per-page cost in the app, doubled. The first real run exposed a genuine bug, not just a slow
number: `renderPdfPages`/`extractPdfText` each open the document fresh on every call
(`pdf-render.ts`'s `loadDocument`), and the initial implementation called them once *per page*,
so comparing a 400-page document reopened (and re-parsed) each file 400 times over. Batched into
one call per file per signal instead — covering every shared page in a single call, the same
shape every other multi-page tool in this app already uses — before this ever shipped:

| Tier | Pages | Before (per-page calls) | After (batched) |
|---|---|---|---|
| Realistic | 400 | 136.0s | 12.6s |
| Heavy | 800 | *(not run — 136s at 400 pages was reason enough to fix first)* | 28.0s |

Included in `scripts/bench-large-pdf.mjs`'s core suite (`npm run bench:large-pdf`), comparing the
big fixture against itself — the full-cost path, since there's no equality short-circuit.
Progress reporting changed shape along with the fix: `onProgress` now reports steps completed
across all four batched streams (text + render, both files) rather than one call per literal
page, so the UI still moves smoothly instead of jumping from 0 to 100% once the batched calls
land — shown in the tool as a percentage rather than "page X of Y", since the step count no
longer maps 1:1 to a single page finishing.

Verified end to end against the real built app (not just the benchmark) with four small,
purpose-built fixtures: an identical file compared to itself (every page reported identical, 0%
pixel difference); a file with one page's text changed (that page, and only that page, flagged
as differing); a file with one fewer page (the extra trailing page correctly reported as "only in
A"); and a file with one page resized to different dimensions (correctly flagged as visually
different with no pixel ratio, since a ratio would be meaningless across different pixel
dimensions).

**A real correctness bug turned up during that last case, and was fixed before this shipped.**
The initial implementation also ran the text comparison on differently-sized pages, and a resized
page came back flagged as *textually* different too — even with the page's underlying content
byte-for-byte identical, just drawn onto a smaller MediaBox. Traced to pdf.js itself: its text
extraction clips text runs that extend past a page's MediaBox, so a page that was only resized
(never re-edited) can extract as visibly shorter text. Reporting that as "text differs" would
tell a user their content changed when it didn't — a false positive, not a curiosity. Fixed by
not evaluating the text signal at all for differently-sized pages (`textDiffers` is `undefined`
there, not `true`/`false`); the size change is already captured by `visuallyDiffers`, so nothing
about the pages actually differing goes unreported. Re-verified against the real built app: the
same resized-page fixture, with identical underlying wording, now reports "Different page size"
with no mention of a text change.

## Results — Find & Redact, Add Signature, Fill PDF Forms (F-24, F-26, F-25)

These three shipped in 0.3.0 without a run recorded here, against this file's own convention. Run
since with the same realistic tier (400 pages / 5.8 MB), driving the real built app. For Fill
Forms the same document gets one text field per page (400 fields, far more than most real
forms) so the cost of listing every field as a control shows up.

**A different, slower machine from the tables above**: a 4-vCPU Xeon @ 2.80GHz cloud container.
For calibration, on the same runs it took 3.9-4.2s for Compress (2.9s above) and 2.9-3.5s for Add
Watermark (2.1s above), so roughly 1.3-1.5× slower. Each figure below is the range over 2-3 runs.

| Operation | Time | Note |
|---|---|---|
| Find & Redact — search, term on 1 page | 1.8-2.4s | click Find → result; 1 match |
| Find & Redact — search, term on every page | 3.7-5.1s | 400 matches, one per page |
| Add Signature (typed, page 1) | 0.57-0.59s | click → download, 5.8 MB out |
| Fill Forms — read 400 fields | 0.84-0.85s | click → all 400 inputs rendered |
| Fill Forms — fill & download, flattened | 1.24-1.27s | 6.2 MB out |

All five passed; nothing froze or failed. The Find timings exclude the page-size scan Redact runs
when a file is selected, which is measured separately in the core suite.

**Correction to the 0.3.0 release notes.** They say Find measured *"0.8s to search all 400 pages
of a real-world-sized report, whether the term appears once or on every page."* That figure came
with no recorded method and doesn't reproduce here. Even scaled for this machine's speed, the
search is roughly 1.3-1.6s for a single match and about twice that when every page matches,
because each matched page pays for a real text layout (see `rectsForPageMatches`). Use the
numbers above.

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
worker-dispatched bulk operations, both halves of PDF to Images, Redact's page-size scan, Compare,
Find & Redact's search, Add Signature, and Fill Forms on a 400-field form — rather than every
tool, to keep it fast enough to actually run before a release.
`BENCH_SUBSET="Find,Signature,Fill"` runs just the last three. The full
16-tool numbers above are a point-in-time comprehensive pass using the same methodology and
fixture shapes, predating Compare PDFs.

## What this doesn't tell you

This is a single desktop-class machine running one operation at a time, not a stress test of
concurrent tabs, low-memory devices, or documents shaped very differently from these two tiers
(e.g., thousands of pages, or images far larger than the ~300-470 KB ones used here). Treat
these numbers as "this works well at realistic office-document scale," not as a guaranteed
ceiling.
