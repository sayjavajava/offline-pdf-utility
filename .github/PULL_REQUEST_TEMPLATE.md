## Summary

<!-- What changed, and why. For a bug fix: what was actually wrong, not just what the symptom
     was. For a new tool/feature: what it does and where it fits in the app. -->

## Test plan

<!-- CI runs typecheck/lint/test/build/both offline checks automatically, but check the ones
     that apply locally before pushing — it's faster to catch here than in CI. Delete lines that
     don't apply. -->

- [ ] `npm run typecheck` / `npm run lint` / `npm run test` — clean
- [ ] `npm run build` — clean
- [ ] `npm run check:offline` / `npm run check:offline:runtime` — still zero network requests
      (only worth re-stating if this PR touches `index.html`, adds a dependency, or adds an
      asset reference — otherwise these are covered by CI without local re-verification)
- [ ] Added/updated tests for the change
- [ ] `CHANGELOG.md` — added an `## [Unreleased]` bullet, if this is user-facing
- [ ] `docs/PERFORMANCE.md` — added a real large-scale benchmark, if this adds or changes how a
      feature processes a user's file (see the convention note at the top of that file)
- [ ] Verified manually against the actual built app (not just tests), for anything UI-facing
