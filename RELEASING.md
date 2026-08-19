# Releasing

## Cutting a release

1. Confirm `main` is green (`.github/workflows/ci.yml`'s `verify` job) and
   everything you want in the release is merged.
2. Add a `## [Unreleased]` section to [`CHANGELOG.md`](./CHANGELOG.md) if one
   doesn't already exist, with entries for everything since the last release
   under `### Added` / `### Changed` / `### Fixed` as appropriate. This
   should mostly already be done — the convention is that each feature PR
   adds its own bullet as part of the PR, not as a separate step here.
3. Decide the version bump (see below), then in one commit on `main`:
   - Rename `## [Unreleased]` in `CHANGELOG.md` to `## [X.Y.Z] - YYYY-MM-DD`.
   - Add a fresh, empty `## [Unreleased]` above it, ready for the next cycle.
   - Bump `"version"` in `package.json` (and run `npm install
     --package-lock-only` so `package-lock.json` picks it up too).
4. Tag it and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`. This
   is what actually triggers the release — pushing the tag runs `verify`,
   then (if that passes) the `release` job, which:
   - Extracts the `CHANGELOG.md` section matching the tag and uses it as the
     release notes. **Fails the release outright if no section matches** —
     this is deliberate, not a bug; see `ci.yml`'s `release` job for why.
   - Publishes `index.html` and `SHA256SUMS.txt` as release assets, built
     from the exact commit `verify` just checked.
5. Once published, spot-check it: download the asset, confirm the checksum
   matches, open it once.

## Versioning

Plain semver, currently in the `0.x` series:

- **Patch** (`0.2.x`) — bug fixes only, no new tools or behavior changes.
- **Minor** (`0.X.0`) — new tools or features. This is what most releases
  will be: the app has no persisted user state or config to migrate between
  versions (every run is stateless — open a file, process it, done), so the
  usual semver worry about minor releases needing to stay backward-compatible
  mostly doesn't apply here by construction.
- The one case that *does* warrant a deliberate version decision rather than
  an automatic minor bump: changing an **existing** tool's default behavior
  in a way that would surprise someone already relying on the old one (e.g.
  if Crop/Resize's scale-to-fit default ever changed to stretch-to-fill).
  That's a real breaking change even though nothing on disk needs migrating.
- **`1.0.0`** is a product decision ("this tool set and quality bar is what
  we're committing to"), not a technical milestone. No need to force it.

## What happens to previous versions

**Published releases and tags are never deleted or moved, full stop.** This
isn't a general best practice being imported from elsewhere — it follows
directly from what this app is:

- **No auto-update, no telemetry, no update-check of any kind.** The offline
  guarantee (`check:offline:runtime` in CI) means the app can never phone
  home to ask "is there a newer version?" — that would itself be a network
  request, which the whole product promise rules out. A user who downloaded
  `v0.1.0` and has been running it fully offline has no way to know `v0.2.0`
  exists and no mechanism that could tell them. Deleting `v0.1.0` doesn't
  nudge anyone to upgrade; it just strands whoever is still on it with no way
  to even re-download their own current copy (new machine, lost file,
  reinstall).
- **The trust model is a published checksum.** The README tells users to
  verify `index.html` against `SHA256SUMS.txt` from the release before
  running it. If that release later disappears, anyone who saved the
  checksum — in their own notes, in a security review, in an internal audit
  — can no longer verify anything against it. Deleting a release retroactively
  breaks a promise this project makes explicitly, in writing, to end users.
- **No storage or clutter pressure.** GitHub Releases are free and unlimited
  for a public repo. Nothing is gained by removing old ones, and the release
  list growing over time is normal, not a problem to manage.

**Tags are immutable once pushed.** Never re-tag or force-push an existing
`vX.Y.Z` to point at a different commit — that silently invalidates every
checksum anyone already verified against it. If a release needs correcting,
cut a new patch version instead.

### If an older release turns out to have a real problem

Don't delete or unpublish it. Instead:

1. Fix it and cut a new release (patch or minor, per the rules above).
2. Edit the **old** release's notes to add a visible callout at the top, e.g.:

   > ⚠️ **This version has a known issue affecting X. See [vX.Y.Z] for the
   > fix.**

The broken file stays downloadable and checksum-verifiable — the warning is
just louder than the rest of its notes. GitHub has no formal "deprecate"
flag for releases beyond `prerelease`/`draft`; an edited note is the
mechanism available, and it's sufficient.

### "Latest"

GitHub marks the most recent non-prerelease as "Latest" automatically —
that's sufficient signal for someone browsing the Releases page today and
doesn't need manual management.
