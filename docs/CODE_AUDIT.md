# Code Audit — `offline-pdf-utility`

**Audit date:** 2026-08-11 · **Commit audited:** `a051160` ("Converted to fully offline utility")
**Audience:** the coding agent implementing these changes.

---

## Status — every originally-scoped finding is implemented. Open backlog items: **F-14, F-15, F-16** — written up for later implementation, not started. Closed (won't build): **F-11**.

| Phase | Findings | State |
|---|---|---|
| 1 | P0-1, P0-2, P2-20 | ✅ done — `dec8572`, `6d068f1` |
| 2 | T-1, T-2, P2-21, P2-22 | ✅ done — `56f0f58` |
| 3 | P1-10, P0-5, P1-8, P1-9 | ✅ done — `f3fe35d` |
| 4 | P0-3, T-4 | ✅ done — `68f2e7e` |
| 5 | P1-6, P1-7, P0-4, P1-12, P1-15, T-3/T-5/T-6/T-7/T-8 | ✅ done — `34fcf90`, `9daab3e`, `78f2520`, `bec703b` |
| 6 | P1-11, P1-13, P1-14, P1-16, P2-23, T-10, T-11 | ✅ done — `39e961f` |
| 7 | P2-17, P2-19, P2-18, P2-25 | ✅ done — `d80057a`, `6a162f7`, `b05c5b9` |
| 8 | F-2, F-3, F-8, F-10 | ✅ done — `f3b658f`, `4fed11c`, `41a5290` |
| 8 | F-6, F-7 (images), F-9, F-4, F-5 | ✅ done — `121a5a1`, `8d50856`, `f76784e`, `7af39f0` |
| 8 | F-7 (text) | ✅ done — see the Extract Text tool |
| — | P2-24 | ✅ done — `f76784e` (operations run in a worker) |
| 8 | **F-11** | ⛔ **closed, will not be built — a deliberate product decision. See below.** |
| 8 | F-1 | ✅ done — `60b9e85` (see below — the "blocked" verdict was wrong; see the correction) |
| 8 | F-12 | ✅ done — `4ae3de0` |
| 8 | F-13 | ✅ done — `dd92468` |
| 9 | F-17 | ✅ done — `9644ed4` |
| 9 | **F-14, F-15** | ⬜ **open — written up, not started. See below.** |
| 9 | **F-16** | ⬜ **open — needs a real spike; initial evidence discourages the obvious approach. See below.** |
| — | P1-17 | ✅ done — `b4ace14` (discovered verifying F-1's round trip, predates it) |

### The one feature that cannot be built as specified

**F-11 · Service worker / PWA — CLOSED, will not be built.** `navigator.serviceWorker.register()`
is rejected outright here: *"The URL protocol of the current origin ('null') is not supported."*
Service workers require an http(s) origin. (Note `isSecureContext` reports `true` on `file://`,
which misleads anyone reasoning about this from feature detection.)

It was briefly proposed that a second, *hosted* build target would unblock this and also shrink the
download. **That proposal was withdrawn.** The product's promise is: download one file, keep it, run
it forever, trust nobody. A hosted build asks users to load the app from a server they must trust not
to change, every time — trading the guarantee away for a smaller download. The bundle size is not a
cost to apologise for; it is what the guarantee weighs. Do not reopen this without changing the
product's premise first.

**F-1 · Protect PDF (add a password) — ✅ DONE (`60b9e85`), reversing this document's own "blocked"
verdict.** This was previously marked blocked on the claim that `@jspawn/qpdf-wasm`'s loader "does
not support `wasmBinary`" and therefore could not be inlined into a single-file build. That claim was
too narrow: the loader does not read a `wasmBinary` config field, but it **does** honor a `locateFile`
hook, and `fetch()` resolves a `data:` URI locally rather than over the network. Pointing `locateFile`
at a base64 data URI built from the bundled binary loads and runs the module with **zero network
requests** — verified directly against the real `file://` build with every non-local request blocked,
before it was relied on for anything. **Lesson repeated from P0-1: verify the actual hook surface in
a browser, don't stop at the first API that doesn't exist.**

What shipped: the wasm binary is bundled the same way the pdf.js CMap tables are (generated, not
committed, deflated before base64 — ~1.22 MB → ~0.41 MB packed) via `scripts/generate-qpdf-wasm.mjs`,
and the qpdf CLI is driven through its virtual filesystem (`FS.writeFile` / `callMain` / `FS.readFile`
— it exposes no library API, only the CLI). It only offers AES-256: qpdf's "128" key length maps to
legacy RC4, which qpdf itself now refuses to write without an extra weak-crypto override. This
module's success path cannot run under jsdom (Node's `fetch` does not resolve a `data:` URI the way a
real browser does), so `qpdf-engine.ts` is excluded from unit coverage and instead verified with
Playwright against the built file — same treatment as `pdf-render.ts`.

Verifying the round trip (Protect, then Unlock through the app's own existing tool) surfaced a real,
**pre-existing** bug in `removePdfPassword` unrelated to anything F-1 added, initially worked around
here for this tool's own output — then fixed for real at the source, in `loadPdf` itself. See **P1-17**.

**CI was red and is now fixed** (`afb6aa9`). `jsdom@30` requires Node `^22.22.2` but both workflow
jobs pinned Node 20, so `verify` failed before a single test ran — meaning the gate protecting all
of this work was not actually running. Both jobs are on Node 22 and `package.json` now declares
`engines`.

**Everything originally scoped in this audit is implemented.** **F-11** stays closed for the product
reasons above. **F-14–F-17** are a later addition: backlog features written up for future
implementation, not yet started — see below.

### Worker feasibility on `file://` — measured, not assumed

Several remaining items need a background worker, and the single-file build means a worker can never
be a sibling file. Tested in Chromium against the real `dist/index.html` over `file://`:

| Capability | Result |
|---|---|
| Classic worker from a blob URL | ✅ **works** — message round-tripped |
| **Module** worker from a blob URL (`{ type: 'module' }`) | ❌ **fails to start** |
| `navigator.serviceWorker.register()` | ❌ rejected: *"URL protocol of the current origin ('null') is not supported"* |
| `isSecureContext` | `true` (misleading — it does not make service workers available here) |

**Consequences:**

- **F-9, F-4, F-5 are viable**, but must use **classic** workers. Bundlers emit module workers by
  default, so set `worker: { format: 'iife' }` in `vite.config.ts` and confirm the emitted worker is
  inlined, not referenced as a separate file. A module worker will fail *silently at runtime only in
  the file:// build* — jsdom tests and `npm run dev` will both pass. Verify in a browser.
- **F-11 (service worker / PWA) is not achievable for the primary distribution mode** and should not
  be attempted as written. A service worker requires an http(s) origin; the app ships as a file
  opened from disk. It would only mean anything alongside a second, *hosted* build target, which
  does not currently exist. **That is a product decision, not an implementation task** — F-11 is
  reclassified as blocked pending that call.

**Current baseline** (re-measure before you claim a regression):

- `npm run test` → **181 passing**. `npm run typecheck` → clean under `strict`.
- `npm run test:coverage` → passes; `src/lib` at **94% lines**. Thresholds are a ratchet set just
  below what the suite achieves — raise them as coverage improves, never lower them to go green.
  `pdf-render.ts`, `pdf.worker.ts`, and `qpdf-engine.ts` are excluded because they cannot execute
  under jsdom at all; the Playwright checks cover them. (`docx-convert.ts` used to be excluded for
  the same reason — needing `html2canvas` and a live DOM — but no longer exists: see **F-12**.)
- `npm run lint` → **0 errors, 1 warning** (react-refresh on button variants).
- `npm run build` → single self-contained `dist/index.html` (~6.74 MB; pdf.js is the largest
  single contributor, then the inlined PDF worker, then the bundled CMap tables).
- `npm run check:offline` and `npm run check:offline:runtime` → both green, and both run in CI.

**Browser-verified** against the `file://` build, not just jsdom: all 11 tools render working forms,
the grid is keyboard-reachable (**P2-23**), unlock works end to end, the F-10 watermark options
produce the expected content-stream output, and **zero** network requests are attempted.

### The offline guarantee is now enforced, not asserted

`npm run check:offline` (structure + markup) and `npm run check:offline:runtime` (loads the built
file from disk with the network blocked, drives every tool, fails on a single request) both run in
CI. Both were verified to **fail** when the P0-2 CDN font link was deliberately reintroduced — a
guard never seen failing is decoration.

Two consequences for anyone changing this project:

- **Anything a browser could fetch must be inlined.** pdf.js's predefined CMap tables are compiled
  in for this reason (`scripts/generate-cmaps.mjs`, run by `prepare` on install); without them a CJK
  PDF rendered a blank page while reporting success. Standard-font and wasm data are deliberately
  *not* bundled — pdf.js falls back acceptably and they would cost megabytes.
- **Releases publish the artifact CI checked**, downloaded from the `verify` job, with its SHA-256 in
  `SHA256SUMS.txt`. The release job previously rebuilt from source, which meant the file users
  downloaded was never the one proven to make zero requests.

### A note on mocks

`src/components/tools/tools.test.tsx` mocks `@/lib/download`. It hand-listed its exports, so adding
one to that module made unrelated tool tests fail with a misleading assertion diff. It now spreads
`importOriginal()` and overrides only the side-effecting helpers. **Prefer that pattern** for any
new module mock.

### Three corrections to this document

**P0-1 was under-diagnosed.** It blamed `BrowserRouter` alone. After fixing that, the page still
rendered **completely blank** from `file://`: a page opened from disk has a `null` origin, and Vite
emits `<script type="module" src=…>`, which is fetched under CORS rules and blocked — as are
CSS-referenced woff2 files. No router change could fix that. The build now emits one self-contained
`index.html` via `vite-plugin-singlefile` with fonts inlined as data URIs. **Lesson for the
remaining work: verify in a browser, not by reading.**

**P0-3's error mapping was right but incomplete.** Probing the library confirmed the three states,
then the acceptance test caught a **fourth** shape the probe missed. All four are now handled in
`loadPdf`:

| Input | Library throws |
|---|---|
| wrong password | `Error: Password incorrect` |
| no password option | `EncryptedPDFError` |
| **empty password vs. a real-password file** | **`NEEDS PASSWORD`** ← missed by inspection |
| corrupt file | `MissingPDFHeaderError` (rethrown untouched) |

**F-1 was marked blocked on an incomplete API check.** See the correction above, under F-1 itself:
the loader's `locateFile` hook was never tried, only the absence of a `wasmBinary` field was. The
lesson is the same one P0-1 already taught this document — verify the real surface in a browser
before writing "cannot be done."

### What already exists — reuse it, don't rebuild it

- **`loadPdf(file, password?)`** in `src/lib/pdf-utils.ts` — the single load path for every tool,
  owning decryption and the error mapping. Any new PDF-reading code goes through it.
- **`src/lib/download.ts`** — `downloadBlob`, `stripExtension`, `derivedName`, `reportToolError`,
  `hexToRgbUnit` (Phases 3 / F-10). All tools download and surface errors through this.
- **`src/lib/pdf-ops.ts`** holds the implementations; **`src/lib/pdf.worker.ts`** dispatches to them
  off the main thread; **`src/lib/pdf-utils.ts`** is the public API that routes through the worker
  and falls back to an inline call. New operations go in `pdf-ops.ts` and are exposed via
  `pdf-utils.ts` — that is what puts them on the worker.
- **`src/lib/pdf-render.ts`** — pdf.js rasterisation (F-4/F-5). Main thread by necessity: it draws
  to a canvas. Uses the **legacy** pdf.js build deliberately; see the commit for why.
- **`src/lib/zip.ts`** — STORE-method zip writer and `crc32`, used by both image features.
- **`src/lib/image-extract.ts`** — embedded-image extraction and PNG reconstruction (F-7).
- **`src/lib/file-validation.ts`** — PDF extension + `%PDF-` magic checks, large-file warning
  (Phase 6 / **P1-11**).
- **`src/components/FilePicker.tsx`** — drag-and-drop + multi-file reorder/remove (**F-8**).
- **`src/test/fixtures.ts`** — `makePdfFile(n)`, `pageIndicesOf(blob)`, `encryptedPdfFile(...)`,
  `pngFile`/`jpegFile` (settable MIME for **P1-15**), `docxFile`, `makeCorruptPdfFile`.
  Multi-page fixtures give each page a **distinct size**, so assert page *identity* with
  `pageIndicesOf`, never just the count — a count-only assertion passes for a split that returns
  the wrong pages.
- **Encrypted fixtures** are committed (RC4-128, AES-256, empty-password) and regenerated by
  `scripts/generate-encrypted-fixtures.py`. The **T-2 blocker this document flagged is resolved.**
- The original `protectPdf` (which despite its name only *removed* protection) is now
  **`removePdfPassword`**. **`protectPdf` has since been reused for a genuinely new function** that
  does the opposite — adds a password (**F-1**) — do not confuse the two by name alone.
  `mergePdf` routes through `loadPdf` and names the failing file (**P1-12**). `parsePageRange` is
  exported and order-preserving (**P1-6**/**P1-7**).
- New tools: **`rotatePdf`** (**F-2**), **`rearrangePdf`** (**F-3**), **`protectPdf`** (**F-1**, via
  `qpdf-engine.ts` — see **What already exists** below).
- **`src/lib/qpdf-engine.ts`** — qpdf-via-WASM encryption (**F-1**). Only exposes one function,
  `encryptPdfBytes`; cannot run under jsdom (see the coverage exclude in `vite.config.ts`), verify
  with Playwright against the built file instead.
- **`src/lib/inflate.ts`** — the `DecompressionStream`-based inflate helper, shared by the bundled
  CMap tables (`pdf-render.ts`) and the bundled qpdf binary (`qpdf-engine.ts`). Extracted during
  **F-1**; do not re-duplicate it a third time.

---

## 0. How to use this document

Every finding has a **stable ID** (`P0-1`, `P1-6`, `P2-17`, `T-3`, `F-2`). Each states:

- **Where** — exact file, symbol, and line at the audited commit.
- **Observed** — what the code does today.
- **Required** — what it must do instead.
- **Accept** — the check that proves it is fixed.

Reference IDs in commit messages (`fix(P0-3): real PDF decryption via @cantoo/pdf-lib`) so the
audit and the history stay linked. Line numbers are from commit `a051160` and will drift as you
work — always re-locate by symbol name, never by line number alone.

**Read [§7 Execution order](#7-suggested-execution-order) before starting.** Several findings share
a refactor; doing them in the wrong order means writing the same code twice.

### What this codebase is

A React 18 + TypeScript + Vite SPA (shadcn/ui + Tailwind, glassmorphism theme) that performs PDF
operations entirely client-side — nothing is uploaded. Substantially all logic lives in one file:

| File | Role |
|---|---|
| `src/lib/pdf-utils.ts` | **All** PDF logic over `@cantoo/pdf-lib`, `mammoth`, `pdfjs-dist`, qpdf (WASM). |
| `src/lib/download.ts` | Shared download / filename / error-toast helpers. |
| `src/lib/file-validation.ts` | PDF magic/extension checks + large-file warning. |
| `src/components/tools/*.tsx` | One form component per tool (8 tools). |
| `src/components/FilePicker.tsx` | Shared drag-drop picker with multi-file reorder. |
| `src/components/GlassDashboard.tsx` | Tool grid + `useState`-based switching between tools. |
| `src/App.tsx` | Router (2 routes), providers. |
| `src/components/ui/*` | Kept shadcn primitives only: button, card, input, label, toast, tooltip. |

Exports of `pdf-utils.ts`: `splitPdf`, `mergePdf`, `removePdfPassword`, `editPdfMetadata`,
`convertImageToPdf`, `convertDocxToPdf`, `addWatermark`, `rotatePdf`, `rearrangePdf`,
`parsePageRange`, `detectImageFormat`, plus module-private `loadPdf`.

> Everything from here down describes the codebase **as audited at `a051160`**. It is the original
> analysis and is left intact so the reasoning behind each finding survives. Findings already
> fixed carry an inline **✅ DONE** marker on their heading — check that before starting one. The
> [Status block](#status--phases-1–7-and-phase-8-f-2-f-3-f-8-are-done) above is the authority on
> current state.
>
> Since the audit: Vitest + RTL and CI exist (113 tests locally), `protectPdf` was renamed
> `removePdfPassword`, `pdf-lib` was replaced by `@cantoo/pdf-lib`, and Phases 3–7 plus F-2/F-3/F-8
> have landed. See the Status block for commit refs.

### Severity summary

Counts are as originally audited, with what remains open after Phases 1–8 (partial).

| | Found | Still open | Meaning |
|---|---|---|---|
| **P0** | 5 | **0** | Broken and user-visible. |
| **P1** | 12 | **0** | Wrong behaviour, misleading errors, silent failures. P1-17 found and fixed post-release, during F-1. |
| **P2** | 9 | **1** (P2-24) | Code health, type safety, a11y, infra. |
| **T** | 11 | **0** | Test specs — all written. |
| **F** | 17 | **3** (F-14, F-15, F-16) | Additive features. F-1–F-10, F-12, F-13, F-17 done; F-11 closed as incompatible; F-14, F-15, F-16 written up, not started. |

### The three that mattered most — all now fixed

Kept for the reasoning, which the remaining work still draws on.

1. **P0-1** ✅ — the documented offline distribution mode rendered a 404. The real cause ran deeper
   than the router; see [the correction above](#two-corrections-to-this-document).
2. **P0-2** ✅ — the "100% offline" app requested Google Fonts on every load.
3. **P0-3** ✅ — password support was inert; Unlock PDF had never worked. It now does, verified
   end to end in a browser.

All five P0s are closed. The most significant remaining work is **Phase 8 features** (especially
**F-4**/**F-5** thumbnails) and **P2-24**/**F-9** (main-thread freeze / workers), plus bumping CI
Node so `jsdom@30` can boot.

---

## 1. P0 — Broken today, user-visible

### P0-1 · The documented offline usage renders a 404 — ✅ DONE (`dec8572`)

**Where:** `src/App.tsx:16` (`<BrowserRouter>`), `src/pages/NotFound.tsx:19`.

**Observed:** `README.md:49-54` instructs end users to unzip `dist/` and *"open the `index.html`
file directly in your web browser"*. Under the `file://` protocol `location.pathname` is the on-disk
path (e.g. `/home/user/dist/index.html`), which does not match `<Route path="/">`, so the catch-all
`<Route path="*">` wins and every user of the primary distribution mode sees the 404 page. The app
is unusable exactly as documented.

`NotFound`'s "Return to Home" link is `<a href="/">`, which under `file://` navigates to the
filesystem root — so the escape hatch is broken too.

**Required:**
- Swap `BrowserRouter` → `HashRouter` in `src/App.tsx`. `vite.config.ts:8` already sets
  `base: "./"`, so assets resolve correctly; routing is the only remaining blocker.
- Replace `NotFound`'s `<a href="/">` with react-router's `<Link to="/">`.
- Rebuild `dist/` (or apply **P2-20** and stop committing it) — the committed bundle carries the bug.

**Accept:** `npm run build`, then open `dist/index.html` via `file://` in a browser — the dashboard
renders, and a bad hash route shows `NotFound` whose home link returns to the dashboard.

---

### P0-2 · "100% offline" makes a network request on every load — ✅ DONE (`dec8572`)

**Where:** `index.html:10-12` and the committed `dist/index.html`; `tailwind.config.ts:86-89`.

**Observed:** the document head `preconnect`s to `fonts.googleapis.com` / `fonts.gstatic.com` and
links a stylesheet for **Inter** and **Space Grotesk** — precisely the two families Tailwind maps to
`font-sans` and `font-display`:

```ts
fontFamily: {
  'sans': ['Inter', 'sans-serif'],
  'display': ['Space Grotesk', 'sans-serif']
}
```

No `@font-face` rule exists anywhere in `src/index.css`, so these fonts have **exactly one source:
the network**. Offline — the app's entire selling point, asserted in `README.md:11`, the
`GlassHeader` "Offline Processing" badge, and the "100% Offline Processing / Your files never leave
your device" panel in `GlassDashboard.tsx:125-126` — both families silently fall back to generic
`sans-serif`, and the browser blocks on two failing DNS lookups first.

The privacy claim survives (no *file* data leaves the device), but the offline claim does not, and
the request does leak "this user opened the app" to a third party on every launch.

**Required:**
- Self-host both families: `@fontsource/inter` + `@fontsource-variable/space-grotesk` imported from
  `src/main.tsx`, or vendored `.woff2` files under `public/fonts/` with `@font-face` in
  `src/index.css`. Prefer the subset/variable builds — bundle size matters here (see **P2-25**).
- Delete the three `<link>` tags from `index.html`.
- While in this file: remove the `lovable.dev` OG and Twitter image URLs (`index.html:17,21`) and
  fix the stale `og:title` "doc-craft-kit" / `og:description` "Lovable Generated Project".

**Accept:** load the built app with DevTools **Network → Offline**, or with a request-blocking rule
on `fonts.googleapis.com` — zero failed requests, and headings still render in Space Grotesk (visibly
distinct from the fallback). `grep -r "fonts.googleapis" .` returns nothing outside `node_modules`.

---

### P0-3 · Password support is fake — the Unlock tool can never work — ✅ DONE (`68f2e7e`)

**Where:** `src/lib/pdf-utils.ts` lines **47, 107, 136, 213** (four identical casts);
`protectPdf` (`:102`); `README.md:15`; password inputs in `SplitTool.tsx:66`, `EditTool.tsx:81`,
`AddWatermarkTool.tsx:73`, `UnlockTool.tsx:58`.

**Observed:** all four password-accepting functions do:

```ts
pdfDoc = await PDFDocument.load(arrayBuffer, { password: password || undefined } as any);
```

`pdf-lib@1.17.1`'s `LoadOptions` is `{ ignoreEncryption, parseSpeed, throwOnInvalidObject,
updateMetadata, capNumbers }` — **there is no `password` option.** The `as any` is what makes this
compile; TypeScript would have rejected it otherwise (see **P2-18**). The property is silently
discarded, and `PDFDocument.load` throws `EncryptedPDFError` for *any* encrypted input:

> `Input document to 'PDFDocument.load' is encrypted. You can use PDFDocument.load(..., { ignoreEncryption: true }) if you wish to load the document anyways.`

*(verified in the shipped bundle: `dist/assets/index-CATjNAmf.js`)*

The catch block matches on `error.message.includes('encrypted')` and reports:

> "This PDF is password protected. Please enter the correct password."

So a user **who typed the correct password** is told to try again, forever. The consequences:

- **Unlock PDF has never worked** for any input, yet `README.md:15` advertises *"Unlock PDF: Remove
  password protection from encrypted PDF files."*
- The password fields on **Split**, **Edit Metadata**, and **Add Watermark** are dead UI.
- `protectPdf` is a **misnomer** — it removes protection. Its own docstring says so. Nothing in the
  codebase adds protection.

**Required — migrate to `@cantoo/pdf-lib`.** This is a maintained drop-in fork of `Hopding/pdf-lib`
(current `2.8.1`) that implements the standard security handler. Verified against the fork's source,
not from memory:

`src/api/PDFDocumentOptions.ts`:
```ts
export interface LoadOptions {
  ignoreEncryption?: boolean;
  parseSpeed?: ParseSpeeds | number;
  throwOnInvalidObject?: boolean;
  warnOnInvalidObjects?: boolean;
  updateMetadata?: boolean;
  capNumbers?: boolean;
  password?: string;            // ← the option upstream lacks
  forIncrementalUpdate?: boolean;
  preserveXFA?: boolean;
}
```

`src/core/parser/PDFParser.ts` imports `CipherTransformFactory` from `../crypto` (the ported pdf.js
standard security handler — RC4 and AES) and sets `context.isDecrypted` from its key.

Migration steps:

1. `npm rm pdf-lib && npm i @cantoo/pdf-lib`. Update the **single** import site,
   `src/lib/pdf-utils.ts:1`. The rest of the API is source-compatible.
2. **Delete all four `as any` casts.** They are now type-correct without them — and if one still
   needs a cast, that is a signal you have the API wrong.
3. **Do not collapse `''` to `undefined`.** The current `password || undefined` destroys a
   meaningful value: the fork's README states *"An empty password is valid for some PDFs. Pass it
   explicitly — do not omit the option or treat `''` as 'no password'."* Thread
   `password: string | undefined` through and pass it as given.
4. **Report three distinct states.** Probe first, then decide:
   ```ts
   const probe = await PDFDocument.load(bytes, { ignoreEncryption: true });
   if (probe.isEncrypted && password === undefined) throw new Error('This PDF is encrypted. Enter its password to continue.');
   // then load for real with { password } and map a decryption failure to:
   //   'Incorrect password for this PDF.'
   // a non-encryption failure must rethrow unchanged — do not swallow parse errors as password errors
   ```
   The current single message conflates all three, which is what makes the tool unusable.
5. **Rename `protectPdf` → `removePdfPassword`** and update `UnlockTool.tsx:2,28`. Keep its
   docstring note that it does not *add* passwords.
6. Update `README.md` once this genuinely works.

**Scope boundary — read this before promising anything.** This delivers **decryption only.**
*Adding* a password remains impossible: the fork's `SaveOptions` is `{ useObjectStreams,
addDefaultPage, objectsPerTick, updateFieldAppearances, rewrite }` — **no encryption fields**
(verified in the same source file). Some third-party tutorials claim `save({ userPassword,
ownerPassword, permissions })` works; that is **not** in this library's types and will not compile.
A real "Protect PDF" feature needs a different engine — see **F-1**, and keep it out of this task.

**Accept:** **T-4** passes, covering an encrypted fixture with the correct password (succeeds),
a wrong password (`Incorrect password`), and no password (`This PDF is encrypted…`).
`grep -n "as any" src/lib/pdf-utils.ts` returns nothing. Manually: encrypt a PDF, unlock it in the
app, confirm the output opens with no password.

**Sources:** [@cantoo/pdf-lib on npm](https://www.npmjs.com/package/@cantoo/pdf-lib) ·
[`PDFDocumentOptions.ts`](https://raw.githubusercontent.com/cantoo-scribe/pdf-lib/master/src/api/PDFDocumentOptions.ts) ·
[`PDFParser.ts`](https://raw.githubusercontent.com/cantoo-scribe/pdf-lib/master/src/core/parser/PDFParser.ts)

---

### P0-4 · Watermark inputs are unvalidated; raw library assertions reach the user — ✅ DONE (`9daab3e`)

**Where:** `addWatermark` (`src/lib/pdf-utils.ts:203-238`); `AddWatermarkTool.tsx:65,69`.

**Observed:** three independent failure modes, all surfacing library internals in a toast.

1. **Opacity.** `AddWatermarkTool.tsx:69` sets `min="0" max="1"` on a `type="number"` input — which
   browsers do **not** enforce for typed input, only for stepper clicks and form validation (never
   invoked here). Typing `5` sends `opacity: 5` to `page.drawText`, tripping pdf-lib's internal range
   assertion. The user sees the raw assertion text.
2. **Font size.** `Number('')` is `0`, so clearing the field draws invisible text and reports
   success. Negative values are equally unguarded.
3. **Text encoding.** `embedFont('Helvetica-Bold')` is a standard **WinAnsi** font. Any CJK
   character, emoji, or even a curly quote pasted from Word throws
   `WinAnsi cannot encode "机" (0x673a)` — cryptic, and it names no remedy.

Related, lower severity: the x-position heuristic `width / 2 - (text.length * fontSize) / 4`
(`:227`) is a crude character-width estimate that pushes long text off the left edge of the page,
and the colour is hardcoded red `[1,0,0]` at `AddWatermarkTool.tsx:31` with no UI (see **F-10**).

**Required:** validate in `addWatermark` — the library boundary, so every caller benefits — and
throw messages a non-technical user can act on:
- opacity outside `[0,1]` → `Opacity must be between 0 and 1.`
- font size not finite, `<= 0`, or `> 300` → `Font size must be between 1 and 300.`
- empty/whitespace-only text → `Enter watermark text.`
- unencodable characters: detect **before** drawing and throw naming the offending character, e.g.
  `The watermark text contains characters this font cannot render (机). Use Latin characters, or
  choose a different font.` Implement by attempting `font.encodeText(text)` in a `try`, or by
  testing the string against the WinAnsi range.
- Replace the width heuristic with `font.widthOfTextAtSize(text, fontSize)` and centre properly:
  `x = (width - textWidth) / 2`.

Mirror the numeric guards in the component (clamp on blur) so the common case never reaches the
library, but keep the library-level checks — the component is not the only possible caller.

**Accept:** **T-8** passes. Manually: opacity `5`, font size `0`, and text `机密` each produce a clear
message, and a long watermark string stays centred on the page.

---

### P0-5 · Non-`Error` throws fail silently — ✅ DONE (`f3fe35d`)

**Where:** all six tool components, identically — e.g. `SplitTool.tsx:43-47`,
`MergeTool.tsx:37-41`, `ConvertTool.tsx:47-51`, `UnlockTool.tsx:38-42`, `EditTool.tsx:44-48`,
`AddWatermarkTool.tsx:41-45`.

**Observed:**
```ts
} catch (error) {
  if (error instanceof Error) {
    toast({ title: 'Error …', description: error.message, variant: 'destructive' });
  }
}                                   // ← no else
```
Anything not an `Error` instance — a thrown string, a `DOMException` from an aborted or revoked file
read, a rejected worker message, an error crossing a realm boundary (where `instanceof` fails even
for genuine `Error`s) — is swallowed. `finally` clears `isLoading`, so the button returns to its
resting state, **no toast appears, and no file downloads.** To the user the operation appears to have
succeeded and done nothing. This is the worst failure mode in the app: silent, and indistinguishable
from success.

**Required:** never leave the `catch` without user feedback. Fix once, in the shared helper from
**P1-10**:
```ts
const message = error instanceof Error ? error.message : String(error);
toast({ title, description: message || 'An unexpected error occurred.', variant: 'destructive' });
```
Also `console.error(error)` the original so the stack survives for debugging.

**Accept:** **T-10** includes a case per tool where the mocked util rejects with a non-`Error`
(`Promise.reject('boom')`) and asserts a destructive toast is still rendered.

---

## 2. P1 — Correctness and behaviour

### P1-6 · `parsePageRange` silently swallows every invalid segment — ✅ DONE (`34fcf90`)

**Where:** `src/lib/pdf-utils.ts:11-33`.

**Observed:** each segment is validated and, on failure, **dropped with no record**. Given a 5-page
document:

| Input | Result | Problem |
|---|---|---|
| `"1-3, 99"` | pages 1-3 | page 99 vanishes; user believes it was included |
| `"5-3"` | *(empty)* | reversed range dropped; generic error |
| `"0"` | *(empty)* | plausible off-by-one user error, no explanation |
| `"abc"` | *(empty)* | typo, no explanation |
| `"1, , 3"` | pages 1, 3 | empty segment ignored |

Only the all-invalid case is reported, via `splitPdf`'s generic `Invalid page range specified.`
(`:61`). Partial invalidity — the dangerous case — is completely silent.

**Required:** collect rejected segments and report them specifically:
- out of range → `Pages 99, 104 are outside this 5-page document.`
- reversed → `"5-3" is backwards — did you mean 3-5?`
- unparseable → `Could not understand "abc" in the page range.`

Return `{ indices, errors }` (or throw an aggregate) rather than a bare array, and have `splitPdf`
surface it. **Export `parsePageRange`** so **T-3** can test it directly.

**Accept:** **T-3** passes, including partial-invalidity cases.

---

### P1-7 · Page order and duplicates are discarded — ✅ DONE (`34fcf90`)

**Where:** `src/lib/pdf-utils.ts:12,32` — `new Set<number>()` and `.sort((a, b) => a - b)`.

**Observed:** `"5,1"` yields pages **1 then 5**, not 5 then 1. `"1,1"` yields **one** page. The user's
explicit ordering is silently overridden.

**Required (deliberate behaviour change — flag it in the commit message):** preserve input order and
allow duplicates. Drop the `Set` and the `sort`; de-duplicate only within a single expanded range.
`copyPages` already accepts repeated indices, so `"3,1,1"` correctly produces page 3, page 1, page 1.
This makes Split double as a reorder/duplicate tool at zero cost and feeds **F-3**.

**Accept:** **T-3** pins the new ordering explicitly (`"5,1"` → `[4, 0]`), so nobody "fixes" it back
to sorted later.

---

### P1-8 · Two distinct filename-mangling bugs — ✅ DONE (`f3fe35d`)

**Where:**
- `.replace('.pdf', '')` — `SplitTool.tsx:37`, `UnlockTool.tsx:32`, `EditTool.tsx:38`
- `.split('.')[0]` — `ConvertTool.tsx:41`, `AddWatermarkTool.tsx:35`

**Observed:**

| Input filename | Expression | Output | Correct |
|---|---|---|---|
| `report.pdf.backup.pdf` | `.replace('.pdf','')` | `report.backup_split.pdf` | `report.pdf.backup_split.pdf` |
| `Q3.REPORT.PDF` | `.replace('.pdf','')` | unchanged (case-sensitive) | stripped |
| `report.v2.docx` | `.split('.')[0]` | `report.pdf` | `report.v2.pdf` |
| `2026.01.15-notes.pdf` | `.split('.')[0]` | `2026_watermarked.pdf` | `2026.01.15-notes_watermarked.pdf` |

`replace` hits the **first** occurrence anywhere in the string, not the extension; `split('.')[0]`
truncates at the **first** dot. Both are wrong for any filename containing more than one dot — dated
and versioned filenames are common.

**Required:** one helper, used by all six tools:
```ts
export const stripExtension = (name: string) => name.replace(/\.[^./\\]+$/, '');
```
Anchored to the end, case-insensitive by construction, safe for dotfiles and no-extension names.
Place it in `src/lib/download.ts` alongside **P1-10**.

**Accept:** **T-9** covers all four rows above.

---

### P1-9 · `URL.revokeObjectURL` is called synchronously after `click()` — ✅ DONE (`f3fe35d`)

**Where:** all six tools — e.g. `SplitTool.tsx:41`, `MergeTool.tsx:35`.

**Observed:**
```ts
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);   // ← same tick
```
`a.click()` only *schedules* the download. Browsers that fetch the blob asynchronously (historically
Firefox, and Safari under load) can find the URL already revoked, producing a **silently failed or
zero-byte download** — with a "Success!" toast already on screen. Intermittent and
machine-dependent, which is exactly why it survives manual testing.

**Required:** defer the revoke — `setTimeout(() => URL.revokeObjectURL(url), 1000)` — inside the
shared helper (**P1-10**). Keep the synchronous `removeChild`; only the revoke must wait.

**Accept:** **T-9** asserts `revokeObjectURL` has **not** been called synchronously after the click,
and **has** been called after advancing fake timers.

---

### P1-10 · The same 12-line download block is copy-pasted six times — ✅ DONE (`f3fe35d`)

**Where:** every `handleX` in `src/components/tools/*.tsx`.

**Observed:** identical create-URL → create-anchor → append → click → remove → revoke → toast
sequences, differing only in filename and toast text. Six copies means every fix in this document
touching that path (**P0-5**, **P1-8**, **P1-9**) must be applied six times and can be forgotten in
one.

**Required:** create `src/lib/download.ts`:
```ts
export function downloadBlob(blob: Blob, filename: string): void
export function stripExtension(name: string): string
export function derivedName(original: string, suffix: string, ext = 'pdf'): string
```
`downloadBlob` owns the anchor lifecycle and the deferred revoke (**P1-9**); `stripExtension` /
`derivedName` own filename derivation (**P1-8**). Then collapse each tool's handler to
`downloadBlob(blob, derivedName(file.name, '_split'))`.

Consider also a `useToolAction` hook wrapping the
`setIsLoading(true)` → try/catch/finally → toast shape, which every tool repeats and which is where
**P0-5**'s missing `else` belongs. Optional, but it removes the last of the duplication.

**This refactor is a prerequisite for P0-5, P1-8, and P1-9. Do it first — see [§7](#7-suggested-execution-order).**

**Accept:** `grep -c "createObjectURL" src/components/tools/*.tsx` returns 0 for every file; **T-9**
and **T-10** pass.

---

### P1-11 · A cancelled file picker stores `undefined` in `File | null` state — ✅ DONE (`39e961f`)

**Where:** `handleFileChange` in all six tools — e.g. `SplitTool.tsx:15-19`.

**Observed:**
```ts
if (e.target.files) { setFile(e.target.files[0]); }
```
`e.target.files` is a `FileList` that is **truthy when empty**. Cancelling the dialog after a prior
selection sets state to `undefined` while the declared type is `File | null`. The `!file` guard
catches it by luck, but the type is a lie — and under **P2-18**'s stricter settings it becomes a real
error.

**Required:** `setFile(e.target.files?.[0] ?? null)`. Add validation at the same point, since
`accept=".pdf"` only filters the *dialog* — users can switch to "All files", and drag-and-drop
(**F-8**) bypasses it entirely:
- reject non-PDF by extension **and** magic bytes (`%PDF-`) for the PDF tools;
- warn above a size threshold (~100 MB), since everything is main-thread (**P2-24**).

**Accept:** **T-10** includes a cancelled-picker case asserting state resets to `null` and the action
button re-guards.

---

### P1-12 · `mergePdf` loses the name of the file that failed — ✅ DONE (`78f2520`)

**Where:** `src/lib/pdf-utils.ts:84-89`.

**Observed:** the per-file `PDFDocument.load` in the loop is unguarded. One corrupt or encrypted file
out of nine aborts the merge with pdf-lib's raw message and **no indication of which file** — the
user must bisect by hand.

**Required:**
```ts
try {
  pdfDoc = await PDFDocument.load(arrayBuffer);
} catch (cause) {
  throw new Error(`Could not read "${file.name}": ${cause instanceof Error ? cause.message : cause}`, { cause });
}
```
Encrypted members deserve the specific message from **P0-3** (`"contract.pdf" is encrypted…`), since
`mergePdf` takes no password at all today.

**Accept:** **T-5** merges a good file with a corrupt one and asserts the error contains the corrupt
file's name.

---

### P1-13 · Merge order is the browser's, not the user's — ✅ DONE (`39e961f`, `4fed11c`)

**Where:** `MergeTool.tsx:15` (`Array.from(e.target.files)`); rendered list at `:56-58`.

**Observed:** `FileList` order follows the *directory listing*, not the order the user
ctrl-clicked. The list is displayed unnumbered, so nothing signals which order will actually be used,
and there is no way to change it. Merge order is the single thing that matters for this tool, and the
user has no control over it.

**Required (minimum):** number the list — `1. intro.pdf`, `2. body.pdf` — and state "files are merged
in this order". **Better:** the reorderable list in **F-8**. At minimum, up/down buttons per row and
a remove button; today a mis-selection means re-picking everything.

**Accept:** **T-5** pins that output order matches input array order; component test asserts the
numbered list renders.

---

### P1-14 · The Split placeholder contradicts the validation — ✅ DONE (`39e961f`)

**Where:** `SplitTool.tsx:62` (placeholder `"all"`) vs `SplitTool.tsx:26-29` (empty-value guard).

**Observed:** the placeholder implies leaving the field blank means "all pages" — a reasonable
reading — but `handleSplit` rejects empty input with *"No pages specified"* before `splitPdf` (which
**does** accept the literal string `"all"`, `pdf-utils.ts:56`) is ever reached. The one supported
keyword is undiscoverable.

**Required:** treat blank as `"all"` (consistent with the placeholder, and the harmless default), and
change the placeholder to a real example: `e.g. 1, 3-5, 8 — or "all"`.

**Accept:** component test: submitting with an empty pages field calls `splitPdf` with `'all'`.

---

### P1-15 · `convertImageToPdf` trusts `file.type` alone — ✅ DONE (`78f2520`)

**Where:** `src/lib/pdf-utils.ts:164-169`.

**Observed:** branches solely on `file.type === 'image/jpeg' | 'image/png'`. Browsers report an
**empty** `type` when the OS has no MIME mapping (common on Linux, and for some Windows pickers and
drag-drop sources). A perfectly valid `photo.jpg` is then rejected with *"Unsupported image type.
Please use JPEG or PNG."* — while `ConvertTool.tsx:28` has already routed it here via
`file.type.startsWith('image/')`, so an empty type falls to the `.docx` branch and then to
"Unsupported file type" instead. Two different wrong answers for the same valid file.

**Required:** resolve the format by precedence — magic bytes → extension → MIME:
- JPEG: `FF D8 FF`
- PNG: `89 50 4E 47 0D 0A 1A 0A`

Sniffing is 8 bytes of an `ArrayBuffer` you already read, and it also catches the reverse case
(a `.png` that is really a JPEG, which `embedPng` would reject with a parser error). Apply the same
resolution in `ConvertTool`'s routing so both layers agree.

**Accept:** **T-7** includes a `File` with `type: ''` and a `.png` name, and a `.png`-named file whose
bytes are JPEG.

---

### P1-16 · DOCX→PDF silently produces a scanned-looking document — ✅ DONE (`39e961f`)

**Where:** `convertDocxToPdf` (`src/lib/pdf-utils.ts:184-193`).

**Observed:**
```ts
const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
const element = document.createElement('div');
element.innerHTML = html;
const pdfBlob = await html2pdf().from(element).output('blob');
```
`html2pdf.js` renders via **html2canvas** and embeds the result as a **raster image** in jsPDF
(confirmed: the build emits a separate `html2canvas-*.js` chunk). Consequences, none disclosed to the
user:

- **The output PDF has no selectable, searchable, or copyable text.** It is a picture of a document.
- **No page size, margins, or orientation are configured** — content runs to the paper edge.
- **No page-break control** — paragraphs and table rows are sliced mid-line at page boundaries.
- **Mammoth's HTML is unstyled** — it deliberately drops most Word formatting, so headings, tables,
  and lists render as bare browser defaults, wider than the page for wide tables.
- Mammoth's `messages` array (unsupported-feature warnings) is **discarded** — the destructure takes
  only `value`.

**Required:**
- Configure the pipeline:
  ```ts
  html2pdf().set({
    margin: [15, 15, 15, 15],
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
    html2canvas: { scale: 2 },
  })
  ```
- Wrap mammoth's HTML in a container with a print stylesheet (readable base font, `max-width`,
  `table { width: 100%; table-layout: fixed }`, `img { max-width: 100% }`).
- Surface `mammoth`'s `messages` as a non-blocking warning toast when non-empty.
- **State the limitation in the UI** — one line under the Convert heading: *"DOCX conversion renders
  pages as images; text in the output will not be selectable."* Users converting a contract need to
  know this before they send it.
- Longer term, a text-preserving path (`docx` → pdf-lib text layout) is a much larger project; record
  it as a follow-up, not part of this fix.

**Accept:** convert a multi-page DOCX with a table — output is A4, has margins, no row is sliced
mid-height, and the UI shows the rasterization notice.

**Superseded by F-12.** The rasterizing pipeline this finding improved (margins, page sizing, the UI
warning) was later replaced entirely with a text-based one — see **F-12** below. `html2pdf.js` and the
rasterization notice described here no longer exist.

### P1-17 · `removePdfPassword` silently fails to decrypt a PDF whose xref is a compressed stream — ✅ DONE (`b4ace14`)

**Found while verifying F-1's round trip** (Protect → Unlock through the app's own two tools), not
from a report. `removePdfPassword` (`loadPdf` + `pdfDoc.save()`, unchanged since **P0-3**) reported
success and downloaded a file — but the file was **still encrypted**. Reproduced directly, no app UI
involved:

```
doc = PDFDocument.load(bytes, { password })   // isEncrypted → false, content readable
saved = doc.save()
reloaded = PDFDocument.load(saved, { ignoreEncryption: true })
reloaded.isEncrypted → true                    // the save did not actually strip it
```

**Root cause, isolated by reading the parser, not by guessing:** a PDF whose cross-reference table is
a **compressed xref stream** (PDF 1.5+; qpdf's default, and common output from many modern PDF
writers) stores that xref stream as an ordinary indirect object, same as any page or font.
`PDFParser.parseIndirectObject` reads it correctly for its metadata — Root, Info, and critically
Encrypt all get pulled into `context.trailerInfo` — but then *unconditionally* registers the object
itself in the document's live object table too (`this.context.assign(ref, object)`, no exception for
the type it just consumed). That stray object still carries its own `/Encrypt` reference in its own
dict, untouched by the trailer cleanup (which only clears `context.trailerInfo.Encrypt`, a separate
copy). `.save()` serializes every live object, so the stale one — `/Type /XRef` and all — ends up in
the resaved file, and a later load can find that `/Encrypt` and report the file as still encrypted.

There are two shapes this takes, both handled by the fix:
- **Unencrypted source:** the stray object parses cleanly as a `PDFRawStream` with `/Type /XRef` in
  its dict.
- **Encrypted source:** pdf-lib's decrypt pass *re-parses the entire byte stream* through a
  `CipherTransformFactory`, including the xref stream — which the PDF spec requires to stay
  plaintext, since it bootstraps decryption in the first place. Decrypting bytes that were never
  encrypted corrupts them, the object fails its internal parse, and it degrades to an opaque
  `PDFInvalidObject` holding the raw, undecrypted bytes. Confirmed by inspection: `/Type /XRef ...
  /Encrypt N 0 R` reads perfectly plainly inside those raw bytes — a `PDFRawStream`-shaped check alone
  cannot see this variant at all.

**Consequence (before the fix):** any PDF encrypted with a tool that emits a compressed xref stream —
not just this app's own **F-1** — failed Unlock silently: no error, a "Success!" toast, a file that
downloaded fine, and was still password protected. This predated F-1; F-1 only surfaced it by being
the first thing in this codebase to produce that xref shape.

**Fixed at the source**, in `loadPdf` (`pdf-ops.ts`) — the single load path every tool shares:
`stripStaleXRefStreamObjects` deletes any indirect object shaped like a cross-reference stream after
load, in both forms above (`/Type /XRef` is reserved for xref streams by the PDF spec, so this is
safe by construction, not a heuristic). `qpdf-engine.ts`'s `--object-streams=disable` workaround —
shipped with F-1 as a stopgap for this app's own output — was removed once the real fix landed; qpdf
now runs with its own defaults, and the Protect → Unlock round trip was re-verified against the real
built app with every non-local request blocked, producing genuinely compressed-xref output that
decrypts cleanly.

**Pinned by a new committed fixture**, `encrypted-aes-256-xrefstream.pdf` (pdf-lib cannot write
encryption at all, so — like the other encrypted fixtures — this had to be generated once and
committed; this one specifically needed qpdf itself to reproduce the compressed-xref shape, since the
Python/pypdf generator behind the other three does not emit it). Confirmed to fail without the fix
and pass with it before committing either.

**Accept:** `removePdfPassword` on a compressed-xref-stream encrypted PDF genuinely decrypts it —
verified both by unit test (`pdf-utils.test.ts`) and by a real-browser round trip through the app's
own Protect and Unlock tools.

---

## 3. P2 — Code health and infrastructure

### P2-17 · Dead code — ✅ DONE (`d80057a`)

**Where:** `src/components/PDFDashboard.tsx`, `src/components/PDFToolCard.tsx`,
`src/components/Header.tsx`, `src/App.css`.

**Observed:** the first three are the superseded pre-glassmorphism dashboard, imported by nothing
outside each other (`PDFDashboard` → `PDFToolCard`; `Header` referenced nowhere). The live tree is
`Index` → `FloatingOrbs` + `GlassHeader` + `GlassDashboard` → `GlassPDFCard`. `App.css` is imported
by no module (`main.tsx` imports only `index.css`). All four are tree-shaken from the bundle but
still get read, reviewed, and grepped — and `PDFDashboard` lists tools that no longer exist, which
misleads anyone reading it as a spec.

**Required:** delete all four.

**Accept:** `npm run build` succeeds; `grep -rn "PDFDashboard\|PDFToolCard\|App.css" src/` is empty.

---

### P2-18 · Type safety is switched off — ✅ DONE (`6a162f7`)

**Where:** `tsconfig.app.json:18-22`, `tsconfig.json:12-17`, `eslint.config.js:26`.

**Observed:**
```jsonc
"strict": false, "noUnusedLocals": false, "noUnusedParameters": false,
"noImplicitAny": false, "noFallthroughCasesInSwitch": false   // tsconfig.app.json
"strictNullChecks": false                                      // tsconfig.json
```
plus `"@typescript-eslint/no-unused-vars": "off"`.

Every guardrail is disabled. This is not academic: **P0-3** (the fake password option) and **P1-11**
(`undefined` in `File | null` state) are both bugs a default-strict TypeScript project would have
rejected at compile time. `noImplicitAny: false` is also why `import html2pdf from 'html2pdf.js'`
compiles despite the package shipping no type declarations.

**Required (incremental — do not flip everything at once):**
1. `strictNullChecks: true` in **both** configs; fix the fallout (mostly `File | null` handling).
2. Add `src/types/html2pdf.d.ts` declaring the chained API surface actually used.
3. `noImplicitAny: true`, then full `strict: true`.
4. Re-enable `@typescript-eslint/no-unused-vars` (as `warn` first if the backlog is large).
5. Add `"typecheck": "tsc --noEmit"` to scripts and wire it into CI (**P2-22**).

Note that the shadcn/ui primitives in `src/components/ui/` may need fixes under `strict` — they are
vendored, so change them in place and note it.

**Accept:** `npm run typecheck` and `npm run lint` both pass with the stricter settings.

---

### P2-19 · Two lockfiles — ✅ DONE (`d80057a`)

**Where:** `bun.lockb` (193 KB) and `package-lock.json` (254 KB), both committed.

**Observed:** two package managers' lockfiles for one project. They will drift, and contributors get
different dependency trees depending on which tool they run — a genuinely painful class of bug to
diagnose.

**Required:** pick one (npm is what the README documents), delete the other, and state the choice in
the README's setup section. Add a `packageManager` field to `package.json`.

---

### P2-20 · `dist/` is committed — ✅ DONE (`6d068f1`)

**Where:** `dist/` (tracked since `a051160`); `.gitignore` ignores `/build` but not `/dist`.

**Observed:** a committed build artifact that nothing verifies is current. It **already** carries
**P0-1** and **P0-2**, so anyone following the README's offline instructions gets the 404 bug even
after those are fixed in source. Reviewing PRs is also noisy — every rebuild churns hashed asset
filenames.

**Required:** choose one and be explicit:
- **Preferred:** add `/dist` to `.gitignore`, `git rm -r --cached dist`, and publish the offline zip
  as a **GitHub Release artifact** built by CI. Update `README.md`'s "For End-Users" section to point
  at Releases.
- **Alternative:** keep it committed, but add a CI job that rebuilds and fails if the tree differs.

Either way, `dist/` must be regenerated after **P0-1**/**P0-2** or deleted.

---

### P2-21 · `package.json` metadata is still the scaffold's — ✅ DONE (`56f0f58`)

**Where:** `package.json:2-4`.

**Observed:** `"name": "vite_react_shadcn_ts"`, `"version": "0.0.0"`, **no `license` field** — while
the repo ships a full **GPL-3.0** `LICENSE` (674 lines). The README never mentions the license
either, so the strongest constraint on reuse is invisible to anyone reading either file.

**Required:** set `"name": "offline-pdf-utility"`, a real starting version (`0.1.0`),
`"license": "GPL-3.0-or-later"`, plus `description`, `repository`, and the missing `test` /
`typecheck` scripts. Add a License section to the README.

---

### P2-22 · No CI — ✅ DONE (`56f0f58`)

**Observed:** no `.github/workflows/`. Nothing prevents a merge that fails to typecheck, lint, or
build — the reason several findings here reached `main`.

**Required:** one workflow on push + PR: `npm ci` → `typecheck` → `lint` → `test` → `build`. Add the
release-artifact job from **P2-20** on tags. Node 20, npm cache enabled.

---

### P2-23 · Accessibility — ✅ DONE (`39e961f`)

**Where:** `GlassPDFCard.tsx:14-18`, `GlassDashboard.tsx:92`, all `src/components/tools/*.tsx`.

**Observed:**
1. **The entire tool grid is keyboard-unreachable.** `GlassPDFCard` renders a shadcn `<Card>` — a
   plain `<div>` — with an `onClick` and no `role`, no `tabIndex`, and no key handler. Keyboard and
   screen-reader users cannot open any tool. This is the most severe a11y defect here: it is not
   degraded access, it is *no* access.
2. `GlassDashboard.tsx:92`'s "Back to Tools" is a bare `<button className="text-white mb-4">` — no
   focus ring, doesn't match the design system, invisible against a light background.
3. Every tool component hardcodes `text-white` / `text-gray-400` instead of the `text-foreground` /
   `text-muted-foreground` tokens the rest of the app uses. `src/index.css:85` defines a `.dark`
   theme, so under the light theme these render white-on-white.
4. Watermark/opacity numeric inputs have no `aria-describedby` for their constraints (**P0-4**).

**Required:** make `GlassPDFCard` a real `<button>` (or add `role="button"`, `tabIndex={0}`, and
Enter/Space handling), with a visible `focus-visible` ring; restyle the back button with the shared
`Button` component and an accessible label; replace hardcoded colours with theme tokens.

**Accept:** **T-11** asserts every card is reachable by `Tab` and activates on `Enter`.

---

### P2-24 · Everything runs on the main thread with no real progress

**Where:** all six tools (`isLoading` boolean); `src/lib/pdf-utils.ts` throughout.

**Observed:** parsing, copying, drawing, and serialization all happen on the UI thread. A 200-page
watermark or a large merge freezes the tab — no progress, no cancel, and the browser may offer to
kill the page. `isLoading` only swaps the button label. The `Progress` primitive is already vendored
in `src/components/ui/progress.tsx` and unused.

**Required:** short term, disable the whole form (not just the button) and show indeterminate
progress with an honest "this may take a while for large files" note. Proper fix is **F-9** — do that
*after* tests exist, since it moves every util across a message boundary.

---

### P2-25 · Large unused dependencies ship in the bundle — ✅ DONE (`b05c5b9`)

**Where:** `package.json:13-65`; `src/components/ui/` (~50 vendored shadcn components).

**Observed:** the dependency list is the full shadcn scaffold — `recharts`, `embla-carousel-react`,
`react-day-picker`, `input-otp`, `vaul`, `cmdk`, `react-resizable-panels`, `@tanstack/react-query`,
and ~40 Radix packages — for an app whose six tools use **Button, Input, Label, Card, and Toast**.
`@tanstack/react-query` is instantiated in `App.tsx:9` and never used for a single query (there is no
server — this is an offline app).

Tree-shaking removes what is genuinely unreferenced, but every vendored `src/components/ui/*.tsx`
file *is* referenced by its own imports, and the whole point of this project is a zip that people
download and open offline — bundle size is a user-facing property, not just a build metric.

**Required:** measure first (`npx vite-bundle-visualizer` or `--mode=analyze`), then delete unused
`src/components/ui/*` files and drop their dependencies. Remove `QueryClientProvider` unless a
concrete use exists. Do this **after** the P0/P1 fixes and with tests in place — it is wide but
shallow, and easy to verify by build success.

---

## 4. Tests to add

Stack: **Vitest + React Testing Library**, unit *and* component. No test infrastructure exists today,
so **T-1** and **T-2** are prerequisites for everything else.

### T-1 · Harness — ✅ DONE (`56f0f58`)

Add dev deps: `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`,
`@testing-library/user-event`, `@testing-library/jest-dom`.

- Configure the `test` block **inside `vite.config.ts`** — it already defines the `@` alias
  (`:18-22`), and duplicating that in a separate `vitest.config.ts` is how the two silently diverge.
- `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']` importing
  `@testing-library/jest-dom/vitest`.
- Scripts: `test` (run once), `test:watch`, `test:coverage`, `typecheck`.
- Note: `jsdom` lacks `URL.createObjectURL`, `HTMLAnchorElement.prototype.click` behaviour, and
  `File.prototype.arrayBuffer` in some versions — stub them in setup; **T-9** depends on it.

### T-2 · Fixtures — `src/test/fixtures.ts` — ✅ DONE (`56f0f58`)

**Generate everything in-memory; commit no binary fixtures.**

- `makePdf(pageCount, { label: true })` — builds a PDF with pdf-lib, drawing `Page N` on each page so
  tests can assert *which* pages survived, not merely how many. Returns a `File`.
- `makeEncryptedPdf(password)` — required by **T-4**. `pdf-lib` cannot *write* encryption
  (**P0-3**), so this needs either a small checked-in encrypted fixture (the one justified binary) or
  a qpdf-wasm helper if **F-1** lands first. **Decide this early — T-4 is the acceptance test for the
  headline P0 fix and cannot be written without it.**
- `makeCorruptPdf()` — bytes that are not a PDF, for **T-5**.
- `PNG_1x1_BASE64`, `JPEG_1x1_BASE64` → `File` helpers, with variants having `type: ''` for
  **P1-15**.
- `makeDocx()` — minimal valid DOCX (a zip with `word/document.xml`) for the **P1-16** path.

### T-3 · `parsePageRange` *(export it first — P1-6)* — ✅ DONE (`34fcf90`)

Table-driven: single page · comma list · range · mixed · surrounding whitespace · `"all"` (any case)
· `""` · `"0"` · reversed `"5-3"` · beyond `maxPages` · non-numeric · duplicates · **order
preservation** (`"5,1"` → `[4, 0]`, pinning **P1-7**) · partial invalidity reporting the specific bad
segment (pinning **P1-6**).

### T-4 · `splitPdf` — *acceptance test for P0-3* — ✅ DONE (`68f2e7e`)

Correct page **count and identity/order** (via the page labels from **T-2**) · invalid range throws ·
`"all"` round-trips every page · **encrypted input with: correct password → succeeds; wrong password
→ `Incorrect password`; no password → `This PDF is encrypted…`; a non-encrypted file with a password
supplied → still succeeds**.

### T-5 · `mergePdf` — ✅ DONE (`78f2520`)

Fewer than 2 files throws · page count equals the sum · **page order follows input array order**
(pins **P1-13**) · a corrupt member produces an error **naming that file** (pins **P1-12**).

### T-6 · `editPdfMetadata` — ✅ DONE (`bec703b`)

Round-trip: save → reload → assert `getTitle` / `getAuthor` / `getSubject` / `getKeywords` /
`getProducer` / `getCreator` · **empty fields do not clobber existing metadata** (the current
`if (metadata.title)` guards mean clearing a field is impossible — decide whether that is intended
and pin it either way) · keywords split and trim on commas.

### T-7 · `convertImageToPdf` — ✅ DONE (`78f2520`)

PNG and JPEG each produce a **one-page** PDF whose page size equals the image dimensions ·
unsupported type throws · **a file with `type: ''` and a `.png` name still works** and **a
`.png`-named file containing JPEG bytes is handled** (both pin **P1-15**).

### T-8 · `addWatermark` — *acceptance test for P0-4* — ✅ DONE (`9daab3e`)

Page count and existing content preserved · opacity `5`, `-1`, `NaN` throw **our** message, not
pdf-lib's · font size `0` and negative throw ours · non-WinAnsi text (`机密`, an emoji, a curly quote)
throws the readable message naming the character · long text stays within page bounds.

### T-9 · `downloadBlob` / `stripExtension` — ✅ DONE (`f3fe35d`)

Filename derivation for `a.pdf` · `report.pdf.backup.pdf` · `Q3.REPORT.PDF` · `report.v2.docx` ·
`no-extension` (all pin **P1-8**) · the anchor is appended and removed · **`revokeObjectURL` is not
called synchronously, and is called after advancing fake timers** (pins **P1-9**).

### T-10 · Component tests — one file per tool — ✅ DONE (`39e961f`)

Mock `@/lib/pdf-utils` and `@/lib/download`. Per tool:
- no file selected → guard toast, and the util is **never called**;
- while pending → button disabled and shows the in-progress label;
- success → util called with the **exact expected arguments** (this is what catches a wired-up-wrong
  refactor), and `downloadBlob` called with the expected filename;
- rejection with an `Error` → toast shows its message;
- **rejection with a non-`Error` → a destructive toast still appears** (pins **P0-5**);
- cancelled picker → state resets to `null` (pins **P1-11**).

Plus tool-specific cases: empty pages field calls `splitPdf(file, 'all')` (**P1-14**); Merge renders
a **numbered** file list (**P1-13**).

### T-11 · `GlassDashboard` — ✅ DONE (`39e961f`)

Each of the six cards opens its tool · "Back to Tools" returns to the grid · **every card is
reachable by `Tab` and activates on `Enter`/`Space`** (pins **P2-23**) · switching tools resets the
previous tool's state.

**Coverage target:** `src/lib/**` is the whole product — hold it to a high bar (90%+ lines). Do not
set a global threshold that the vendored `src/components/ui/**` would have to meet; exclude it.

---

## 5. Features that can be added without regression risk

Each is **additive**: a new function in `pdf-utils.ts`, a new component in `tools/`, and a new entry
in the `pdfTools` array (`GlassDashboard.tsx:21-58`) plus its `activeTool` branch (`:93-98`). None
modifies an existing tool's behaviour. Ordered by value-to-risk.

**F-1 · Protect PDF (add a password)** — the feature users will expect the moment Unlock works, and
the natural counterpart to **P0-3**. **Requires a spike before any commitment:** neither `pdf-lib`
nor `@cantoo/pdf-lib` can *write* encryption — verified, `SaveOptions` has no password fields. The
realistic offline option is **qpdf compiled to WASM**: [`@jspawn/qpdf-wasm`](https://registry.npmjs.org/@jspawn/qpdf-wasm/latest)
exists (v0.0.2, ~1.34 MB unpacked, zero dependencies, ships `qpdf.js` + `qpdf.mjs`). Caveats to
resolve **first**: it is `0.0.x` and early-stage; 1.34 MB is a real cost for a bundle users download
as a zip; and the WASM binary must be bundled locally, not fetched, or it breaks **P0-2** all over
again. Prototype, confirm, *then* decide. **Do not bundle this with P0-3** — P0-3 must ship on its
own.

**F-2 · Rotate pages** — ✅ DONE (`f3b658f`) — `page.setRotation(degrees(n))`. Smallest possible new tool; good first
addition once the test harness exists.

**F-3 · Delete / reorder pages** — ✅ DONE (`f3b658f`) — falls out of **P1-6**/**P1-7** almost free: reuse the improved
`parsePageRange` and the now order-preserving `copyPages` call.

**F-4 · PDF → images (PNG/JPEG per page)** — needs `pdfjs-dist`. Bundle the worker locally.

**F-5 · Page thumbnails / preview** — same `pdfjs-dist` dependency as F-4, so pair them. **High
user value:** today users choose page ranges completely blind, which is what makes **P1-6**'s silent
dropping so damaging.

**F-6 · Page numbers / Bates stamping** — same drawing path as the watermark; reuse the font handling
and text-encoding validation from **P0-4** rather than duplicating it.

**F-7 · Extract embedded images / extract text** — ✅ DONE, both halves. Image extraction
(`8d50856`) is pure pdf-lib; text extraction came later, once `pdfjs-dist` was already bundled for
F-4/F-5.

> **This item was briefly marked done when only the image half existed.** The status table said
> ✅ while `getTextContent` appeared nowhere in the source. A feature wrongly marked complete is
> worse than one left open, because nobody goes looking for it. When splitting a finding across two
> deliverables, track them separately.

**F-8 · Drag-and-drop + a reorderable file list** — ✅ DONE (`4fed11c`) — properly fixes **P1-13** and applies to every
tool. Note that drag-drop bypasses `accept=`, so it depends on **P1-11**'s validation landing first.

**F-9 · Web Worker offloading with real progress** — resolves **P2-24**. **Do this after the tests
exist** (§4): it moves every util across a message boundary, and the unit tests are what will prove
behaviour is unchanged. `Progress` is already vendored and unused.

**F-10 · Richer watermark options** ✅ DONE (`41a5290`) — rotation (diagonal is the conventional look), tiling, position
presets, and a colour picker. The colour is currently hardcoded red `[1,0,0]`
(`AddWatermarkTool.tsx:31`) with no UI at all, despite `addWatermark` already accepting an RGB tuple —
so the plumbing is done and only the control is missing.

**F-11 · Service worker / PWA** — ⛔ **BLOCKED, do not implement as written.** Service workers cannot
register from `file://` (measured — see the worker findings in the status block), which is the app's
primary distribution mode. This needs a second hosted build target to mean anything, which is a
product decision. Original rationale follows: makes a *hosted* deployment work offline after first load, and
gives installability. Complements **P0-2**, which fixes the `file://` case.

**F-12 · Real, text-based DOCX→PDF conversion — ✅ DONE (`4ae3de0`).** Raised by a tester on `v0.1.0`:
`convertDocxToPdf` still rasterized, exactly as **P1-16** described and only partially mitigated. The
old pipeline was `mammoth` → HTML → `html2pdf.js` (`html2canvas` + `jsPDF`), which embedded a
**picture** of the page as the PDF content — no selectable, searchable, or copyable text, which is the
actual reason most people convert a document to PDF.

**Chosen approach: hand-rolled layout on `@cantoo/pdf-lib`** (`src/lib/docx-layout.ts`), the
"preferred default" this document named — `pdfmake`, the other candidate, was checked rather than
assumed: it pulls in `pdfkit` (a whole second PDF engine) at 15 MB unpacked, pure duplication of what
`@cantoo/pdf-lib` already does in this bundle, on top of a translation-layer risk from mammoth's HTML
to pdfmake's `docDefinition` JSON. Hand-rolling draws real text objects the same way `addWatermark` and
`addPageNumbers` already do — DOM-walk mammoth's HTML into a small block model (headings, paragraphs
with bold/italic/link runs, ordered/unordered lists with nesting, simple tables, block images), then
lay those blocks out onto A4 pages with greedy word-wrapping against real font metrics.

**Scope, matching what mammoth's HTML actually emits** (verified against real mammoth output, not
guessed): headings, paragraphs, bold/italic runs, lists, simple tables, and images embedded as `data:`
URIs. Deliberately not supported, and not silently faked — see `docx-layout.ts`'s module docstring:
only the four standard Helvetica variants are used (a character outside WinAnsi — CJK, Cyrillic, emoji
— is replaced with `?` and counted in a non-blocking warning, never silently dropped); links render
styled but are not clickable (no PDF Link annotation); a table row that doesn't fit the remaining page
moves to a new page as a whole rather than splitting.

**A real mistake, caught before it shipped, not after:** since nothing in the new pipeline needs
`html2canvas` or a live DOM to render into (mammoth needs no DOM at all; the layout engine only uses
`DOMParser`), the plan was to route it through the PDF worker (**F-9**) for the same off-main-thread
benefit every other tool gets. `DOMParser` is *not*, in fact, available in a dedicated Worker's global
scope in Chromium — confirmed by actually running it there and getting `DOMParser is not defined`.
jsdom emulates one, which is exactly why this looked worker-safe under the unit tests and only failed
once Playwright drove it end to end against a real browser. **The same class of mistake this document
has hit before** (P0-1, and F-1's own "blocked" correction) — a Node/jsdom-only assumption stated as
fact. Reverted to the main thread, the same boundary the old pipeline used, now for a different reason;
documented in `docx-convert.ts` so a future change doesn't retry it without testing for real first.

**Bonus: the bundle got smaller, not bigger.** Removing `html2pdf.js` and its dependents (`html2canvas`,
`jsPDF` — 22 packages) outweighed the new layout code, and moving conversion out of `pdf-ops.ts` (it
never actually ran through the worker) stopped it being duplicated into the worker bundle too.

**Accept, verified for real, not by eyeballing the render:** converted a real DOCX (heading, a
bold/italic run, nested bullet and numbered lists, a table, accented Latin text) through the actual
built `file://` app with every non-local request blocked, then fed the resulting PDF into this app's
own **Extract Text** tool — the exact check this document specified — and got the genuine document
text back, correctly structured, with zero network requests anywhere in the chain.

**F-13 · Split into a zip of individual per-page PDFs — ✅ DONE (`dd92468`).** From
[issue #2](https://github.com/sayjavajava/offline-pdf-utility/issues/2): a user expected Split to
produce one PDF per page in a zip, and reported the single-combined-file result as a bug. It wasn't
— re-verified against the `v0.1.0` release with a byte comparison, not just a page count: `all` and
`1, 2, 3` on a 3-page document each produce a genuinely new, re-saved file that happens to contain
every page, which is why it looked unchanged. Closed as not-a-bug. But the idea underneath — export
each selected page as its own file — is a real, missing mode, and it's cheap now:

- **The zip writer already exists and is proven.** `src/lib/zip.ts` (STORE method, no compression,
  hand-rolled because the payloads are already-compressed PDF bytes) is already used by
  **Extract Images** and **PDF to Images**. This is a third caller, not new infrastructure.
- **The page selection already exists.** `parsePageRange` — order-preserving, duplicate-preserving
  since **P1-7** — already resolves exactly the set this needs.
- **The only new code** is: for each resolved page index, `copyPages` + `addPage` into its own
  single-page `PDFDocument`, `save()`, and add it to the zip as `page-NNN.pdf` — the same per-page
  loop shape `renderPdfPages` already uses, just producing a PDF page instead of a PNG.

**Where it lives:** either a toggle on the existing `SplitTool` ("download as separate files"), or a
`splitPdfToZip` function alongside `splitPdf` in `pdf-ops.ts` so it runs through the worker like every
other operation (**F-9**). Prefer the toggle — it's the same tool, same inputs, just a different
output shape, and a second tool for this would just be Split with extra steps.

**Accept:** splitting a 3-page PDF for "all" with the new mode on produces a zip containing exactly 3
single-page PDFs, each opening independently with the right content — proven the same way **T-4**
proves page identity (via `pageIndicesOf`, not just a page count).

**F-14 · Compress / optimize a PDF — open, scoped below.** Reduces file size, mainly by
recompressing embedded images — a real, common request, and one this app can do with **no new
dependency**: qpdf (`qpdf-engine.ts`, already bundled for **F-1**) supports it directly.

**Technical basis (from `qpdf --help=all`, not assumed):**
- `--optimize-images` recompresses images as JPEG when that comes out smaller, subject to
  `--oi-min-width` / `--oi-min-height` / `--oi-min-area` thresholds — skip images too small for the
  format-conversion overhead to be worth it.
- `--recompress-flate --compression-level=9` uncompresses and recompresses already-flate-compressed
  content streams at maximum ratio (`--compress-streams=y`, already qpdf's default, only compresses
  streams that are currently *uncompressed*, so this second flag is what actually re-squeezes them).
- `--object-streams=generate` compacts the xref/object tables — this produces the compressed-xref
  shape **P1-17** fixed `loadPdf` to handle safely, so it's fine to use; no need to route around it
  the way **F-1** originally (and unnecessarily) did before that fix existed.

**Caveats to disclose, not silently absorb:**
- `--optimize-images` is lossy for any image it re-encodes as JPEG. Say so in the UI rather than
  quietly degrading photos — same principle as **P0-4**'s "don't silently substitute" and **F-12**'s
  documented WinAnsi limitation.
- This will not meaningfully shrink a typical text-only PDF — flate-compressed text is already
  efficient. The real payoff is image-heavy documents (scans, photos). Show a before/after size in
  the UI so the user can judge whether it helped, rather than promising a result it may not deliver.
- Not a full "print production" optimizer — no font subsetting, no resource deduplication. Scope is
  image recompression + stream recompression only; say that plainly rather than overselling it as
  general PDF optimization.

**Accept:** a PDF with a large embedded photo compresses to meaningfully fewer bytes with
`--optimize-images`, and the page count and image legibility survive the round trip (embed
dimensions unchanged, image still decodes) — verified by size comparison plus a reload, not just a
successful exit code.

**F-15 · Crop / resize pages — open, scoped below.** Two genuinely different operations sharing one
UI — verified directly from `@cantoo/pdf-lib`'s `PDFPage.ts` source, because the naive version of
this is easy to get wrong (see below):

- **Crop:** `page.setCropBox(x, y, width, height)`. Sets the *visible* window to a subregion of the
  page; the underlying content and MediaBox are untouched. Non-destructive — this is what "crop"
  means to a user (trim margins, hide a header/footer) without discarding or moving anything.
- **Resize:** must use `page.scale(x, y)`, **not** `page.setSize(width, height)`. Read from source,
  not guessed: `setSize` only rewrites the page's box dimensions (`setMediaBox`, and `setCropBox`/
  `setBleedBox`/`setTrimBox`/`setArtBox` *if* they currently match the MediaBox) — it never touches
  content coordinates. Shrinking a page with `setSize` alone just **clips** existing content (the
  same visual effect as an accidental crop); enlarging leaves content anchored at its original
  position with blank space added around it. `scale(x, y)` is the one that actually transforms
  content and annotations proportionally (`scaleContent`/`scaleAnnotations` internally) along with
  the box — that is what "resize" has to mean here, or the feature silently produces wrong output
  that only shows up when someone actually looks at the result.

**Design decision to make explicitly, not by default-arg accident:** "resize to a paper size" should
scale-to-fit preserving aspect ratio (`factor = min(targetW/currentW, targetH/currentH)`, uniform,
centered) rather than stretching non-uniformly (`xScale != yScale`) — stretching visibly distorts
text and images. Make scale-to-fit the default; if a stretch mode is offered at all, it should be a
clearly-labelled secondary option, not the default behaviour.

**UI scope for v1:** numeric margins (points or inches, one per side) for Crop — a visual drag-select
crop box needs a page-preview canvas, which is materially more UI work and can be a later
enhancement, not a blocker for v1. A paper-size dropdown (A4/Letter/Legal/custom) for Resize.

**Accept:** cropping by a fixed margin leaves content pixel-identical but reduces the visible
`CropBox` by the expected amount (verified via `getCropBox()` after reload, not just that *a* box
changed); resizing to A4 with scale-to-fit produces content that is proportionally scaled and
centered — verified by checking a known reference point's coordinates moved by the expected scale
factor, not merely that the MediaBox now reads A4 dimensions.

**F-16 · Repair a damaged PDF — open, needs a real spike first; initial evidence is discouraging.**
The obvious assumption — qpdf is purpose-built for this, wire it up — **did not survive testing**,
and this section exists specifically so that assumption doesn't get re-made without re-checking it.

**What was actually tested:** four corrupted variants of the same source PDF, built and checked
directly (not from documentation) against both this app's current `loadPdf` (`@cantoo/pdf-lib`) and
qpdf's default recovery (`qpdf in.pdf out.pdf`; qpdf's error recovery is on by default —
`--suppress-recovery` is what turns it *off*):

| Corruption | `loadPdf` today | qpdf default recovery |
|---|---|---|
| `startxref` missing entirely (severe truncation) | fails | **also fails** — `can't find startxref` |
| `startxref` present, points past EOF; compressed xref **stream** | **recovers on its own** | **fails** — `expected n n obj` |
| Same corruption, classic xref **table** | **recovers on its own** | not re-tested against qpdf in this spike |
| Corrupted `/Length` on a content stream | **recovers on its own** | not re-tested against qpdf in this spike |

The one directly-comparable case found **qpdf's repair worse than what this app's `loadPdf` already
tolerates today, for free, with no new code** — the opposite of the assumption this finding started
from. `@cantoo/pdf-lib` turns out to already have real fallback recovery for bad xref offsets; qpdf's
default recovery, at least for the xref-stream shape, does not reach as far.

**What a real spike needs before this is scoped as a feature:** damaged files sourced from something
real — bug reports against other PDF tools, or files with genuine corruption from an interrupted
download or disk fault, not more synthetic ones like the table above — to find an actual case where
`loadPdf` fails **and** qpdf (default recovery, or another mode not yet tried, such as forcing a full
linear object scan) succeeds. Until a case like that is found and confirmed, do not implement this as
"route damaged files through qpdf" on the strength of qpdf's own documentation alone.

**Fallback scope if the spike comes up empty:** a much smaller, safer **Diagnose** tool instead of
"Repair" — run `--check` (read-only; qpdf's own words: *"does not perform any validation of the
actual PDF page content or semantic correctness... merely checks that the PDF file is syntactically
valid"*; exit 0 clean / 2 errors / 3 warnings-only) and show the user qpdf's structural report.
`@cantoo/pdf-lib` has no equivalent diagnostic output of its own — it only throws or succeeds. This
has real, honest value (tell a user *why* their PDF won't open) without promising a fix that may not
exist.

**Accept:** either (a) qpdf genuinely repairs a real damaged file `loadPdf` cannot open today,
verified by successfully reading content back out of the repaired file afterward — not just a clean
exit code — or (b) if the spike finds no such case, ship `--check` alone as a read-only diagnostic
and record here why "repair" was dropped in favor of "diagnose."

**F-17 · Permissions on Protect PDF — ✅ DONE (`9644ed4`).** `qpdf --help=encryption` (verified, not
assumed) supports real restriction flags at the 256-bit strength **F-1** already uses:
`--print=[none|low|full]`, `--modify=[none|assembly|form|annotate|all]`, `--extract=[y|n]`
(copy/extract text and graphics), `--annotate=[y|n]` (commenting/filling forms), `--assemble=[y|n]`,
`--form=[y|n]`, `--modify-other=[y|n]`, `--accessibility=[y|n]` (usually ignored by readers),
`--cleartext-metadata`.

**The design point this finding has to lead with, verified empirically, not assumed:** restrictions
are enforced (by compliant readers) only for whoever opens the document with the **user** password —
anyone who supplies the **owner** password gets full, unrestricted access regardless of the flags.
Protect PDF today (`qpdf-engine.ts`) uses **the same password for both** (`--encrypt password
password 256`), which means bolting restriction checkboxes onto the existing single-password field
would ship something that *looks* like it works and **does nothing** — the one password anyone types
is the owner password, so they always get full access no matter what's checked. This is exactly the
"looks like success, silently does nothing" failure shape this audit has flagged repeatedly elsewhere
(P0-5, P1-17); it would be a new instance of it, introduced on purpose, if shipped this way.

Permissions therefore needs a genuine **two-password model**, not an addition to the current one:
- **Open password** (user password) — required to open the document at all. Can be left empty — a
  real, common pattern ("anyone can open it, but can't print or copy without the permissions
  password").
- **Permissions password** (owner password) — required to bypass the restrictions. Must differ from
  the open password or the restrictions do nothing (qpdf's `--allow-insecure` is specifically the
  flag needed to permit an *empty* owner password alongside restrictions, and its own help text
  calls that combination insecure) — the UI should require this field non-empty, or warn clearly if
  it matches the open password.

**Confirmed working, not hypothetical:** encrypted a test file with
`--encrypt '' ownersecret 256 --print=none --extract=n --modify=none --`, then read it back with
qpdf's own `--show-encryption`: opened with the empty user password ("Supplied password is user
password"), and every requested restriction correctly reported "not allowed."

**A limitation to disclose in the UI, not bury:** PDF permission restrictions are an honor system
enforced by compliant readers, not a hard security boundary — the content is still decryptable with
the (possibly empty) user password, so anyone with basic tooling can strip them. Say this plainly,
matching how Extract Text already discloses its OCR boundary and how Protect PDF's own description
already sets honest expectations.

**Verification gap to plan around:** `@cantoo/pdf-lib` has no API to read permission flags back after
loading (checked — only `doc.isEncrypted` exists). Testing this therefore needs either qpdf's own
`--show-encryption` output (real-browser/Playwright verification, the pattern already established for
**F-1**) or manual parsing of the raw `/P` integer in the encryption dictionary — plan the test
approach around that gap, not around an API that doesn't exist.

**UI scope for v1:** a simple three-control set matching what most consumer tools expose — "Allow
printing" (none/low-res/full), "Allow copying text/images" (yes/no), "Allow editing" (none/all —
collapse qpdf's five-level modify scale to a binary for v1; note the finer granularity exists if ever
needed) — plus the two required password fields. Don't expose all eight qpdf flags at once.

**Accept:** a PDF protected with printing disabled and a distinct permissions password reports, via
qpdf's own `--show-encryption`, "print low resolution: not allowed" and "print high resolution: not
allowed" when read back; it opens with just the open password (or no password, if left empty); and
the permissions password — not the open password — is what's required to see unrestricted access.

**What shipped and how it was verified.** `encryptPdfBytesWithPermissions` in `qpdf-engine.ts`
(`--print`, `--modify`, `--extract` flags alongside `--encrypt <open> <permissions> 256`),
`protectPdfWithPermissions` in `pdf-ops.ts`, wired through the worker like every other operation.
`ProtectTool`'s existing single-password flow is untouched by default; a "Restrict printing,
copying, or editing" checkbox reveals the permissions password field and the three v1 controls
(print none/low/full, edit none/all, copy allowed/not) only when turned on — so the common "just
add a password" case never sees the two-password model, and the model only appears once
restrictions are actually being requested. The permissions password is rejected outright if it
equals the open password, before any qpdf call — the exact silent-no-op shape this finding opened
with (P0-5, P1-17's pattern repeating).

**A correction to this section's own "Verification gap" note above:** it assumed
`qpdf-engine.ts`'s success path was untestable under Vitest because "Node's fetch does not resolve
a `data:` URI the way a browser does" (true when F-1 was written and verified). That assumption was
checked again while writing this feature's tests, not carried forward — and on the Node 22.22.2
this repo now requires (bumped for `jsdom@30`, see the F-1 section above), `fetch("data:...")`
resolves correctly and the *entire* qpdf WASM module loads and runs under Vitest. Confirmed directly:
`protectPdfWithPermissions` now has real unit tests (`pdf-utils.test.ts`) that run the actual qpdf
WASM encryption and prove a wrong password is rejected while both the open and permissions passwords
succeed — not just the pre-WASM validation, which is all that was previously testable this way. The
`qpdf-engine.ts` coverage exclusion in `vite.config.ts` is left in place here (it still covers
`encryptPdfBytes` and other qpdf-backed code this change doesn't touch, and revisiting a repo-wide
coverage gate is out of scope) — but the premise behind it no longer holds unconditionally and is
worth re-checking before the next qpdf-dependent feature assumes it.

Verified against the real built app (Playwright, `file://`, all non-local requests blocked, 0
network requests), using qpdf's own `--show-encryption` as the oracle (run a second time, directly
under Node — confirmed working per the correction above — rather than only in-browser, since
`@cantoo/pdf-lib` cannot read permission flags back): (1) protecting a file with printing/editing/
copying all disabled and a distinct permissions password produced a file where `--show-encryption`
reports every requested restriction as "not allowed", and correctly identifies the empty open
password as "Supplied password is user password" and the permissions password as "Supplied password
is owner password" — both valid, distinct credentials, exactly as required (note: `--show-encryption`
reports the *declared* restriction bits from the encryption dictionary regardless of which valid
password opened the file — confirmed via `qpdf --help=--show-encryption` — so it is not itself the
tool that proves a reader *enforces* the bits differently for user vs. owner access; that enforcement
is reader-side behavior specified by the PDF format itself, which is what the two-distinct-passwords
requirement exists to make meaningful); (2) the UI rejects a permissions password equal to the open
password before ever reaching qpdf; (3) leaving the restrictions checkbox off still produces the
original F-1 behavior — full permissions, single shared password — with no regression.

---

## 6. Things deliberately **not** flagged

Recorded so a later reviewer doesn't re-raise them:

- **`color: { type: 'RGB', … }` object literal** (`pdf-utils.ts:231`) instead of pdf-lib's `rgb()`
  helper — structurally identical to what `rgb()` returns and works at runtime. A typing smell, not a
  bug; it resolves itself under **P2-18**.
- **`embedFont('Helvetica-Bold')` with a raw string** — equals `StandardFonts.HelveticaBold`'s value
  and is valid. The *encoding* problem is real and is **P0-4**; the string form is fine.
- **`html2pdf` on a detached element** (`pdf-utils.ts:188-191`) — looks like it should render blank,
  but html2pdf.js clones the source into its own `html2pdf__overlay` / `html2pdf__container`
  appended to `document.body` (verified in the shipped bundle). Not a bug. The *rasterization* is the
  real issue — **P1-16**.
- **`copyPages` drops form fields, outlines, and annotations** — a genuine pdf-lib limitation
  affecting Split and Merge, but not a defect in this code. Worth documenting in the README rather
  than "fixing".
- **`public/robots.txt` allowing all crawlers** — irrelevant for an offline tool; harmless if hosted.

---

## 7. Suggested execution order

Ordered so shared refactors land before the work that sits on them. Each phase should be its own
commit (or PR) and leave the app working.

**Phase 1 — Make the app actually work offline** ✅ DONE
1. **P0-1** HashRouter + `<Link>`.
2. **P0-2** self-hosted fonts, strip CDN and Lovable meta.
3. **P2-20** decide `dist/`'s fate — Phase 1 invalidates the committed build.

**Phase 2 — Test harness** ✅ DONE
4. **T-1** Vitest + RTL wiring.
5. **T-2** fixtures. **Resolve the encrypted-fixture question now** — **T-4** blocks on it.
6. **P2-21** `package.json` metadata + `test`/`typecheck` scripts; **P2-22** CI.

**Phase 3 — Shared refactor** ✅ DONE (`f3fe35d`)
7. **P1-10** `src/lib/download.ts` — `downloadBlob`, `stripExtension`, `derivedName` — absorbing
   **P0-5** (the missing `else`), **P1-8** (filenames), **P1-9** (deferred revoke). Collapse all six
   tools onto it. Then **T-9**.

**Phase 4 — The headline fix** ✅ DONE
8. **P0-3** migrate to `@cantoo/pdf-lib`, delete the four `as any`, three-state error mapping, rename
   `protectPdf` → `removePdfPassword`, update the README. Then **T-4**.
   *Ship this alone. Do not combine it with **F-1**.*

**Phase 5 — Library correctness** ✅ DONE
9. **P1-6** + **P1-7** page ranges (export `parsePageRange`) → **T-3**.
10. **P0-4** watermark validation and encoding → **T-8**.
11. **P1-12** merge error context, **P1-15** image sniffing → **T-5**, **T-7**.
12. **T-6** metadata round-trip.

**Phase 6 — UI correctness** ✅ DONE (`39e961f`)
13. **P1-11** file-input handling and validation; **P1-14** split placeholder; **P1-13** numbered
    merge list; **P1-16** DOCX pipeline config + limitation notice.
14. **P2-23** accessibility. → **T-10**, **T-11**.

**Phase 7 — Cleanup** ✅ DONE
15. **P2-17** dead code; **P2-19** lockfiles; **P2-18** strictness (expect the widest diff — do it
    with the full suite green); **P2-25** dependency pruning.

**Phase 8 — Features** *(F-2, F-3, F-8 ✅; rest open)*
16. **F-2**, **F-3** ✅ → **F-8** ✅ → **F-5**/**F-4** → **F-9** → the rest.
    **F-1** only after its spike concludes.

---

## 8. Verification checklist

Before calling this audit addressed:

- [x] `npm run typecheck` — clean under `strict`.
- [x] `npm run lint` — 0 errors / 1 warning; `no-unused-vars` re-enabled as warn.
- [x] `npm run test` — 113 specs green locally (CI Node 20 vs jsdom@30 still broken — see Status).
- [x] `npm run build` — succeeds; ~2.72 MB → ~2.62 MB after **P2-25**.
- [ ] **Offline smoke test:** build, open `dist/index.html` over `file://` with the network
      **disabled**, and run all six tools end-to-end against real files. This single test covers
      **P0-1**, **P0-2**, and the download path from **P1-9**.
- [ ] **Encryption smoke test:** unlock a genuinely password-protected PDF; confirm the output opens
      without a password, and that a wrong password reports `Incorrect password`.
- [x] `grep -rn "as any" src/` — empty.
- [x] `README.md` claims match reality: Unlock works, offline means offline, DOCX rasterization is
      disclosed, license stated.
