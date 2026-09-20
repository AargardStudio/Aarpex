# AarPex — notes for Claude

## Versioning & changelog

This repo tracks its version in `VERSION` (plain semver string, mirrored in
`package.json`'s `version` field) and its history in `CHANGELOG.md`
(Keep a Changelog format).

**Every time a change is made and published (committed + pushed):**

1. Add an entry to `CHANGELOG.md` describing what changed, under a new
   version heading (or `[Unreleased]` if versioning it can wait).
2. Bump `VERSION` and `package.json`'s `version` to match — PATCH for
   fixes, MINOR for new features, MAJOR for breaking changes.
3. Include the `VERSION`/`package.json`/`CHANGELOG.md` updates in the
   same commit as the change itself, not a separate one.
