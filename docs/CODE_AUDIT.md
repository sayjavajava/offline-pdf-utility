# Code Audit — `offline-pdf-utility`

**Audit date:** 2026-08-11 · **Commit audited:** `a051160` ("Converted to fully offline utility")
**Audience:** the coding agent implementing these changes.

---

## Status — every originally-scoped finding is implemented. Open post-release items: **F-12**. Blocked: **F-1, F-11**.

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
| 8 | **F-1, F-11** | ⛔ **blocked — measured, not deferred. See below.** |
| 8 | **F-12** | ⬜ **open — real work, scoped below.** Found post-release: `v0.1.0` testers correctly identified that DOCX conversion producing an unsearchable image undermines the feature's actual purpose, not just a footnote-able limitation. |
| 8 | F-13 | ✅ done — `dd92468` |

### The two features that cannot be built as specified

Both were attempted and both are blocked by the same property of the product: it
ships as a single HTML file opened from disk, where the origin is `null`.

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

**F-1 · Protect PDF (add a password).** Three independent findings, in order of discovery:

1. Neither `pdf-lib` nor `@cantoo/pdf-lib` can *write* encryption — `SaveOptions` has no password
   fields. Confirmed from source.
2. `@jspawn/qpdf-wasm@0.0.2`, the package this document proposed, **does not support `wasmBinary`**
   — the string appears nowhere in its loader. It can only `fetch` its 1.22 MB `.wasm` as a sibling
   file. That cannot be inlined into the single-file build, and fetching a sibling from a `null`
   origin is blocked — the same failure that broke **P0-1**. The package also ships no API surface
   beyond the CLI and no usage docs (its README points at a `tests` directory it does not include).
3. Hand-rolling PDF encryption on top of pdf-lib was considered and rejected. Writing a correct
   AES-256 (R6) security handler means deriving `/O`, `/U`, `/OE`, `/UE` and `/Perms` and encrypting
   every string and stream. Getting it subtly wrong produces a file the user *believes* is protected
   — worse than not offering the feature.

**A viable path exists** if this is wanted: a qpdf (or similar) WASM build compiled with Emscripten's
`wasmBinary` support, letting the binary be inlined as base64. That is a build-and-vendor task, not
an integration task, and it would add well over a megabyte to a bundle that is already 6.74 MB.

**CI was red and is now fixed** (`afb6aa9`). `jsdom@30` requires Node `^22.22.2` but both workflow
jobs pinned Node 20, so `verify` failed before a single test ran — meaning the gate protecting all
of this work was not actually running. Both jobs are on Node 22 and `package.json` now declares
`engines`.

**Everything actionable in this audit is now implemented.** The only open items are F-1 and F-11,
both blocked for measured reasons set out below rather than for want of effort.

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
  `pdf-render.ts`, `docx-convert.ts` and `pdf.worker.ts` are excluded because they cannot execute
  under jsdom at all; the Playwright checks cover them.
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

### Two corrections to this document

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
- `protectPdf` is now **`removePdfPassword`**. `mergePdf` routes through `loadPdf` and names the
  failing file (**P1-12**). `parsePageRange` is exported and order-preserving (**P1-6**/**P1-7**).
- New tools: **`rotatePdf`** (**F-2**), **`rearrangePdf`** (**F-3**).

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
| `src/lib/pdf-utils.ts` | **All** PDF logic over `@cantoo/pdf-lib`, `mammoth`, `html2pdf.js`. |
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
| **P1** | 11 | **0** | Wrong behaviour, misleading errors, silent failures. |
| **P2** | 9 | **1** (P2-24) | Code health, type safety, a11y, infra. |
| **T** | 11 | **0** | Test specs — all written. |
| **F** | 13 | **2** (F-1, F-12) | Additive features. F-2–F-10, F-13 done; F-11 closed as incompatible; F-12 added post-release, still open. |

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

**F-12 · Real, text-based DOCX→PDF conversion — open, real work, not a quick fix.** Raised by a
tester on `v0.1.0`: `convertDocxToPdf` (`src/lib/pdf-utils.ts`) still rasterizes, exactly as **P1-16**
described and only partially mitigated. The pipeline is `mammoth` → HTML → `html2pdf.js`
(`html2canvas` + `jsPDF`), which embeds a **picture** of the page as the PDF content. P1-16 fixed the
symptoms — margins, page sizing, a UI warning — but the fundamental gap remains: **no selectable,
searchable, or copyable text**, which is the actual reason most people convert a document to PDF
(resumes, reports, anything meant to be searched, copied, or read by a screen reader). A warning label
does not close that gap; it only discloses it.

**Why this is a real project, not a config change:** producing genuine text output means laying out
mammoth's HTML as real PDF text objects — line wrapping against actual font metrics, page breaks that
don't split a paragraph mid-word, headings, bold/italic runs, lists, and at minimum simple tables.
That's a layout engine, not a rendering tweak.

**Candidate approaches — none chosen yet, each needs verification before commitment** (same discipline
as **F-1**: this document previously recommended a library without checking it could do the job, and
that cost a full spike to discover):

1. **Hand-rolled layout on `@cantoo/pdf-lib`.** No new dependency; consistent with how every other
   tool in this app already draws text (`addWatermark`, `addPageNumbers`) and already owns the
   font-encoding validation (`assertEncodable`) this would need too. Most implementation work, but the
   lowest-risk failure mode: a layout bug produces visually-wrong-but-safe output, not a false
   guarantee (contrast with why hand-rolled encryption was rejected for F-1). **Preferred default**
   unless the spike finds a clearly better option.
2. **`pdfmake`.** Purpose-built for structured-content → real-text PDF, with wrapping, lists, and
   tables handled for you, and it embeds fonts rather than fetching them (verify this explicitly — it
   is the make-or-break property for this app). Needs a translation layer from mammoth's HTML to
   pdfmake's `docDefinition` JSON; whether an existing one is reliable enough to depend on, or whether
   to write a narrow one covering only what mammoth actually emits, is exactly what the spike should
   determine. Adds a dependency and font-embedding bundle weight — measure it.
3. Anything else the spike turns up. Do not add a dependency to this offline, single-file build
   without doing what **F-1**'s spike did: read the source, confirm no network fetch is reachable from
   the code path used, and measure the actual bundle cost — not the README's claim.

**Scope the spike should answer before implementation starts:** what subset of mammoth's HTML output
(headings, bold/italic, lists, tables, images, hyperlinks) is worth supporting for v1 — mammoth's
`messages` array (currently discarded, see P1-16) is a ready-made signal for what it couldn't map
cleanly, which is a reasonable place to draw the v1 line.

**Accept:** a DOCX with a heading, a bold/italic run, and a list converts to a PDF where that text is
genuinely selectable and found by Ctrl+F — verified by reading it back with `pdfjs-dist`'s
`getTextContent()` (the same check **F-7**'s text extraction already uses), not just by eyeballing the
render.

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
