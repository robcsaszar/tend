# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

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
