# Working in this repo (for coding agents)

You are working on **OffGridPDF** — 20 PDF tools that run entirely in the browser, shipped as one
self-contained HTML file. This file tells you how work is done here. It's aimed at coding agents
(Claude Code, Cursor, Codex, and anything else that reads `AGENTS.md`), but nothing in it is
agent-specific — a human contributor should read it too.

**Read [`CONTRIBUTING.md`](CONTRIBUTING.md) as well.** It has the setup and the exact pre-PR
checklist and is not duplicated here.

---

## 1. The one thing you must not break

**The offline guarantee is the product, not a feature of it.** A user downloads one file,
disconnects, and nothing they open ever leaves their machine. A regression here is treated as a
security bug — see [`SECURITY.md`](SECURITY.md).

Two CI gates enforce it, and both must stay green:

- `npm run check:offline` — the built `dist/offgridpdf.html` is one self-contained file with
  nothing fetchable in it.
- `npm run check:offline:runtime` — loads the real built file from disk with the network cut,
  drives every tool, and fails if anything is requested. Static analysis can't see a URL assembled
  at runtime; this can.

So: **before adding any dependency or asset reference, assume the answer is "vendor it locally"**
and only depart from that with a reason you can state. The established pattern for a library that
wants to fetch something at runtime is in §5.

## 2. How work is done here

### Verify against reality, not plausibility

This is the house rule that matters most, and most of §5 exists because of it.

- **Don't reason about an API from memory — call it and look.** `@jspawn/qpdf-wasm` was written
  off for weeks as impossible to inline because it ignores a `wasmBinary` option. True, and
  irrelevant: it honours `locateFile`, and `fetch()` resolves a `data:` URI locally. The feature
  shipped once someone actually checked the hook surface instead of stopping at the first missing
  API.
- **Don't assert a coordinate convention — prove it with a fixture.** See §5 on pdf.js transforms.
- **Don't quote a performance number you didn't run.** [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md)
  holds measured numbers from realistic-size documents, produced by the reproducible harnesses in
  `scripts/` (`bench-large-pdf.mjs`, `bench-image-batch.mjs`). Extend a harness; never estimate.
- **jsdom is not a browser.** Anything needing a real canvas, Worker, or `data:` URI fetch is
  excluded from unit coverage and verified against the built file with Playwright instead
  (`pdf-render.ts`, `qpdf-engine.ts`). If your module is in that category, say so and test it that
  way rather than mocking until it passes.

A spike that proves an idea *doesn't* work is a success. Write down the real blocker and stop.

### Report honestly, including what you didn't do

PR descriptions here state what was verified, what was assumed, and what was deliberately skipped
and why — including a **"Not touched, and why"** section when that's the honest answer. If you
couldn't run something (no credentials, no device), say so plainly rather than implying coverage
you don't have. If you find one of your own earlier claims was wrong, correct it and move on.

### One concern per PR, driven to green

Branch (`claude/<topic>`) → implement → run the full local gate → push → open PR → **watch CI to
green** → address review → merge. A PR you opened is yours until it merges or closes; red CI on it
is work now, whatever its review state. Never skip, disable, or quarantine a test to get green, and
never push an empty commit to kick CI.

### Comment the *why*, not the *what*

The most distinctive convention in this codebase. Comments explain decisions, rejected
alternatives, and constraints — not what the line already says. If you make a non-obvious choice,
the comment explaining it is part of the change; if you remove a safeguard, justify it in the same
breath. Read `.github/workflows/ci.yml` or `src/lib/pdf-redact.ts` for the register to match.

## 3. Repo conventions

- **Tool logic** lives in `src/lib/*.ts` with a sibling `*.test.ts`; **UI** in
  `src/components/tools/*Tool.tsx`. Pure, fiddly logic (offset mapping, geometry) gets split into
  its own exported function *specifically* so it can be unit-tested with literal fixture data —
  see `locateMatches` in `pdf-search.ts` and `toPixelRect` in `pdf-redact.ts`. Do the same for the
  next one.
- **Fixtures are built in memory** in `src/test/fixtures.ts` with `@cantoo/pdf-lib`. Don't commit
  binary PDFs.
- **Coverage thresholds in `vite.config.ts` are a ratchet** — up or flat, never down. Files
  excluded from coverage have a comment saying why; keep that true.
- **`src/lib/pdf-cmaps.generated.ts` and `qpdf-wasm.generated.ts` are generated** by `npm ci`'s
  `prepare` step. Gitignored. Never hand-edit or commit them.
- **`CHANGELOG.md`**: one entry under `## [Unreleased]` for anything user-facing. Internal-only
  changes (tooling, CI, refactors) don't need one.
- **Releases are tag-driven.** Pushing `v*` runs the release job, which **fails if `CHANGELOG.md`
  has no matching `## [X.Y.Z]` section**, and publishes the exact artifact CI verified with its
  SHA-256 — never a rebuild. See [`RELEASING.md`](RELEASING.md).
- **npm only.** Don't introduce a second lockfile.
- Features are numbered `F-<n>` in comments and commits. Numbers are never reused — find the next
  free one with `grep -rhoE "F-[0-9]+" src`.

## 4. Where the deeper context lives

Implementation plans, architecture decisions, audits, and the feature backlog live in a **separate
private `tool-docs` repository**, not here — this repo is code plus its own user-facing docs. If
you have access to it, read `tool-docs/AGENTS.md` first and
`tool-docs/offline-pdf-utility/CODE_AUDIT.md` for the full history of what was built and why.

**If you don't have access**, this file plus `CONTRIBUTING.md`, `SECURITY.md` and `RELEASING.md`
are enough to work correctly in this repo. You'll be missing the backlog and the audit trail, so:
don't invent an `F-` number, and ask before starting anything large.

There is a sibling native Android app,
[`offline-pdf-android`](https://github.com/sayjavajava/offline-pdf-android), shipping the same 20
tools. **This repo is the behaviour spec for it** — a change to a tool's behaviour here is a change
the Android app may need to mirror. Some capabilities (batch mode, tool chaining, theme toggle)
went Android-first and are candidates to port back the other way.

## 5. Landmines — each of these cost a real investigation

**Bundling something that wants to fetch.** Generate the asset at `npm ci` time into a
`*.generated.ts`, deflate + base64 it, and point the library's own file-resolution hook at a
`data:` URI — `fetch()` resolves that locally, so the offline guarantee holds. Used for the pdf.js
CMap tables and the qpdf wasm binary (~1.22 MB → ~0.41 MB packed). **The hook is `locateFile`, not
`wasmBinary`.**

**Node's `fetch` is not the browser's.** Node doesn't resolve a `data:` URI the way a real browser
does, so `qpdf-engine.ts`'s success path cannot run under jsdom at all. That's why it's
Playwright-verified against the built file instead of unit-tested.

**pdf.js text positioning.** `item.transform` from `getTextContent()` is in raw, *unrotated*
content-stream space — it is byte-identical on a rotated and an unrotated page. `page.getViewport()`
*is* rotation-aware. Rather than hand-rolling the reconciliation, `pdf-search.ts` reuses pdf.js's
own `TextLayer` and reads rects via a DOM `Range` + `getClientRects()`. That needed the minimum
`TextLayer` CSS vendored from `pdfjs-dist` into `src/lib/text-layer.css`, because the class is
driven by CSS custom properties nothing else sets, and rotation is applied by a separate rule keyed
off `data-main-rotation`. Both bugs were caught only by real screenshot verification.

**Two-phase scanning for per-page work.** Cheap pass over every page (`getTextContent()` only — no
render, no DOM), then the expensive pass only on pages that matched: 0.8s across a 400-page
document either way. The same lesson was learned once already when PDF-to-Images rendered the whole
document instead of the pages it displayed.

**Redaction means deletion.** The Redact tool rebuilds the page as a flat image. It is *not* a
black rectangle drawn on top, which is what most "redaction" features ship. Never optimise it into
one.

**PDF permission restrictions are an honour system.** Compliant readers respect them; the content
is still decryptable with the open password, and the UI says so plainly. Keep it honest.
