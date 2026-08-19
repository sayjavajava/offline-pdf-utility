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

### Added

- **Convert to PDF**: select several JPEG/PNG images at once to combine them
  into one multi-page PDF, in the order shown, instead of converting each one
  separately and merging them afterward.

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
