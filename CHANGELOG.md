# Changelog

All notable changes to this project are documented here. Each release's
section is lifted verbatim into its GitHub Release notes by
`.github/workflows/ci.yml`'s `release` job — write for that audience (someone
deciding whether to download a new build), not as a commit log.

**Convention:** add a bullet under `## [Unreleased]` in the same PR that ships
the change, under `### Added` / `### Changed` / `### Fixed` as appropriate.
When cutting a release, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`
and add a fresh, empty `## [Unreleased]` above it. The release workflow fails
the release if it can't find a section matching the tag being pushed, so this
isn't optional bookkeeping — it's what the release notes are made of.

## [Unreleased]

### Changed

- The project now has a name: **OffGridPDF**. The downloadable file is
  `offgridpdf.html` instead of a bare `index.html` — if you're upgrading
  from an earlier release, the new download replaces it; nothing about how
  the app works or what it promises has changed.
- The dashboard now groups tools into four category tabs (Organize Pages,
  Security, Convert & Export, Edit & Enhance) instead of one long list of
  16 cards — only the selected category's tools are shown at once.

### Added

- **Convert to PDF**: select several JPEG/PNG images at once to combine them
  into one multi-page PDF, in the order shown, instead of converting each one
  separately and merging them afterward.
- **Redact PDF**: find every occurrence of a name, case number, or other
  text across the whole document and turn them into redaction boxes
  automatically, instead of locating and drawing over each one by hand.
  Nothing is redacted without review — matches are added to the same box
  list hand-drawn ones use, so they can be removed before applying. A match
  that crosses a line break, or a page with no text layer at all (most
  likely scanned), is flagged rather than silently skipped or guessed at.
  Fast even on a large document: measured 0.8s to search all 400 pages of a
  real-world-sized report, whether the term appears once or on every page.
- **Redact PDF**: apply the box(es) drawn on the current page to a range of
  other pages (or every other page) in one step, instead of redrawing the
  same box on each page by hand. Pages whose size doesn't match the page you
  drew on are skipped and named, rather than silently misplacing the box.
- Large-file performance is now documented and benchmarked
  ([`docs/PERFORMANCE.md`](docs/PERFORMANCE.md)) — real measured results on
  hundreds of pages and tens of MB, not estimates.
- **Compare PDFs**: find what changed between two versions of a document,
  page by page — both whether the extracted text differs and whether the
  page renders differently, reported independently since either can change
  without the other. Read-only; produces a downloadable text report, not a
  new PDF.

### Fixed

- **PDF to Images**: the page preview used to render the entire document
  just to display 12 thumbnails, freezing the tab for several seconds on a
  large file (measured: 8.4s at 400 pages, 15.6s at 800). It now renders
  only the pages it shows, regardless of document size, and says so
  ("first 12 of 400 pages") instead of implying the whole document was
  scanned.

## [0.2.0] - 2026-08-19

Five new tools, a security fix, and a full dependency vulnerability cleanup —
everything here is additive, nothing breaking.

### Added

- **Protect PDF** — add an AES-256 password to a PDF, via qpdf compiled to
  WASM (loaded with zero network requests). Optionally restrict printing,
  copying, or editing with a separate permissions password — PDF readers
  grant full access to whoever supplies the same password used to open the
  file, so a genuine restriction needs two distinct passwords, not one.
- **Redact PDF** — draw boxes over content to permanently delete it, not just
  cover it. A page with a redaction box is rebuilt as a plain image with no
  text layer underneath, so nothing under the box stays selectable,
  copyable, or searchable. Pages you don't touch keep their real text.
- **Compress PDF** — shrink a PDF by recompressing its embedded images and
  content streams. Most effective on image-heavy documents.
- **Crop / Resize Pages** — trim margins non-destructively, or rescale pages
  to a target paper size (A4/Letter/Legal/custom) with content scaled
  proportionally to fit.
- **Split PDF** can now export as a zip of individual per-page PDFs, not just
  one combined file.

### Changed

- **Convert to PDF**: DOCX conversion now produces genuinely selectable,
  searchable text, replacing the old rasterized-image output.

### Fixed

- **Unlock PDF**: some encrypted PDFs (ones whose cross-reference table is a
  compressed stream) reported success but silently remained
  password-protected after "unlocking." Fixed at the source.
- All 17 `npm audit` vulnerabilities resolved — 0 remaining.

## [0.1.0] - 2026-08-17

Initial release.
