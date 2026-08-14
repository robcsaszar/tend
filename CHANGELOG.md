# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [0.7.0] - 2026-08-14

### Changed

- `tend-onboard`, `tend-refactor`, `tend-security`, `tend-tests`: added failure branches for their validator scripts. A validator that runs and rejects still blocks unconditionally; a validator that cannot run (missing `node`, missing script, usage error) now continues with a recorded `⚠ unvalidated` label rather than leaving the outcome undefined. Both cases exit `1`, so the branches key on the error text.
- `tend-onboard`: a config that could not be validated must not be left on disk unmarked for the other `tend-*` skills to trust — it is now either removed or stamped unvalidated.
- `tend-tests`: added an explicit stop for repos with no test runner configured; selecting a runner is a project decision, not a coverage fix.
- `tend-docs`, `tend-tests`: descriptions rewritten as human-facing prose with trigger phrasing removed, matching the house rule for skills that set `disable-model-invocation: true` (their descriptions never reach the router).

## [0.6.0] - 2026-08-06

### Added

- Unattended mode, opt-in via onboarding: `tend-onboard` now offers (Phase 4) to install a GitHub Actions sweep workflow with a user-chosen cadence. The template ships inside the skill at `skills/tend-onboard/assets/tend-sweep.yml`; the workflow — never the skill — commits and opens one labeled PR per fix, gated by an open-PR cap and per-skill duplicate guard.
- README "Unattended use" section documenting the wrapper design and its backpressure.
- `tend-onboard` evals (the one skill that was missing them).

### Fixed

- `tend-refactor`'s scoped-style extraction guidance now describes Svelte's compile-time scoping class semantics instead of Astro slot scoping.

## [0.5.0] - 2026-07-10

### Added

- Initial release: tend-onboard, tend-security, tend-perf, tend-refactor, tend-a11y, tend-tests, and tend-docs skills.

[0.6.0]: https://github.com/robcsaszar/tend/releases/tag/v0.6.0
[0.5.0]: https://github.com/robcsaszar/tend/releases/tag/v0.5.0
