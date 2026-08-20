# Security Policy

## Supported versions

This project is pre-1.0 and ships a single evolving line of releases — there is no
long-term-support branch. Security fixes target the **latest release only**. Older releases
stay published and checksum-verifiable forever (see [`RELEASING.md`](RELEASING.md) for why),
but that is an archival guarantee, not a promise that they keep receiving patches — upgrade to
the latest release to get a fix.

## Reporting a vulnerability

Please **do not open a public issue** for a security report until a fix is available — this
avoids giving anyone a working exploit against users who haven't upgraded yet.

Preferred: use GitHub's private reporting for this repository — **Security tab → "Report a
vulnerability"** (this opens a private advisory only the maintainer can see). If that option
isn't available to you, open a regular issue with the words "security report" and no exploit
details, and a private channel will be set up in reply.

Include what you'd want to see in someone else's report: the affected tool/version, a minimal
reproduction (ideally a small PDF or file that triggers it), and what you'd expect to happen
instead. There's no formal SLA — this is a single-maintainer project — but reports get looked at
promptly and a fix is prioritized over other work.

## What's in scope

This app runs entirely client-side with no server, no accounts, and no stored user data, which
rules out a lot of the usual web-app threat surface (there is no backend to authenticate to or
inject into). What's actually relevant here:

- **The offline guarantee itself.** The core promise is that the app never makes a network
  request — no telemetry, no update check, no asset fetched from anywhere once you have the
  file. A change (including a dependency bump) that makes it phone home *is* a security bug for
  this project, not just a bug. This is exactly what `npm run check:offline` and
  `npm run check:offline:runtime` exist to catch in CI on every push — if you find a way past
  them, that's a high-priority report.
- **Malicious-input handling.** A crafted PDF, DOCX, or image file causing unexpected code
  execution, a crash usable for something worse than a crash, or content from one file leaking
  into another's output.
- **XSS or script injection** via any file's metadata, filename, or content being rendered
  unsanitized somewhere in the UI.
- **Dependency vulnerabilities** in anything shipped in the built `offgridpdf.html` (this
  repository already runs Dependabot security updates and GitHub's default CodeQL scanning; a
  report that adds to what those already catch is still welcome).

## What's out of scope

Anything that assumes a server, an account system, or persisted user data — this app has none
of those by design. General bug reports with no security impact belong in a regular issue, not
a private report.
