# Contributing

Thanks for considering it. This is a small, single-maintainer project, so the process is
lightweight — but a few things below are load-bearing, not style preferences.

## Before you start

For anything beyond a trivial fix, **open an issue first** to discuss the approach. It's a
faster path to a merged PR than writing the code first and finding out the direction doesn't
fit.

## Setup

```bash
git clone https://github.com/sayjavajava/offline-pdf-utility.git
cd offline-pdf-utility
npm ci        # this repo uses npm only — do not commit another lockfile
npm run dev
```

`npm ci`'s `prepare` step also generates two files from installed dependencies
(`src/lib/pdf-cmaps.generated.ts`, `src/lib/qpdf-wasm.generated.ts`). They're gitignored and
regenerate automatically — don't hand-edit or commit them.

## Before opening a PR

Run the same checks CI does, in this order (a failure early saves time over one late):

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run check:offline           # dist/ is one self-contained file, nothing fetchable
npm run check:offline:runtime   # loads the real build with the network cut, drives every tool
```

The last two exist because "100% offline" is this project's core promise, not a nice-to-have —
see [`SECURITY.md`](SECURITY.md) for why a regression there is treated as a security bug, not
just a bug. Any change that adds a dependency or an asset reference should pass both.

## What a PR should include

- **Tests.** Vitest + React Testing Library; fixtures live in `src/test/fixtures.ts` (PDFs built
  in-memory with `@cantoo/pdf-lib`, not committed binaries). Coverage thresholds in
  `vite.config.ts` are a ratchet, not an aspiration — they should go up or stay flat, never down.
  A few files are excluded from coverage because they need a real canvas/Worker that jsdom can't
  provide (see the `exclude` comments in `vite.config.ts` for which, and why); those are covered
  by the runtime checks instead.
- **A `CHANGELOG.md` entry** under `## [Unreleased]`, if the change is user-facing (new tool,
  behavior change, bug fix a user would notice). Internal-only changes (tooling, CI, refactors)
  don't need one — see the convention note at the top of that file.
- **A `docs/PERFORMANCE.md` update**, if you're adding a feature that processes a user's file or
  changing how an existing one does. The convention (stated at the top of that file) is a real
  run against a realistic-size document, not a 3-page smoke test — `scripts/bench-large-pdf.mjs`
  and `scripts/bench-image-batch.mjs` are the reproducible harness most features can extend.

## Scope

This app is entirely client-side by design — no server, no accounts, no telemetry. A
contribution that needs a backend, a network call, or stored user data is out of scope. See the
"Technologies" section of the [README](README.md) for how far that constraint already reaches
(e.g. why a PDF-writing library fork was chosen, why qpdf is loaded from a base64 `data:` URI
instead of a sibling file). If a feature idea needs something the offline constraint rules out —
OCR is the clearest example, since every practical engine wants to fetch a language model —
open an issue to discuss it before writing code; it may still be possible with a different
architecture, but it's worth confirming before investing the time.

## Code style

Follow what's already there: TypeScript, functional React components, Tailwind + shadcn/ui for
UI, comments that explain *why* rather than *what*. `npm run lint` enforces most of the
mechanical parts.
