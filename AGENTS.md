# AGENTS.md

## Mission

This repo publishes the `tend` skill pack: local, on-demand maintenance skills for SvelteKit + TypeScript repos. There is no build, no tests, no runtime of its own. The deliverable is the contents of `skills/*`. Every skill shares one shape (config → triage → scan → fix → verify, one atomic change per run, never commit) and one shared config file (`.claude/tend/config.yaml`, schema owned by `tend-onboard`). Changes should be judged by: would a stranger who installs one of these skills into their own SvelteKit repo get a correct, safe, minimal fix out of it?

## Layout convention

- One directory per skill under `skills/<name>/`, `name:` in frontmatter matching the directory name exactly.
- Every skill follows the same phase structure: `0. Load config` → `1. Triage` (MANDATORY READ a core reference) → `2. Scan` (stop at first real hit; module-gated checks load only when their module is active) → `3. Fix` (one atomic, verified change) → `4. Verify & present` (re-run checks, show diff, **never commit**) → `## NEVER` (3-line `**NEVER**`/`**Instead:**`/`**Why:**` format). Keep new skills or edits to existing ones in this shape: it's load-bearing, not decorative; `tend-onboard`'s config schema and every other skill's Phase 0 wording assume it.
- Structured-findings skills (`tend-security`, `tend-refactor`, `tend-tests`) ship `scripts/validate-*.mjs` + `assets/*.json`. Diff-is-the-finding skills (`tend-perf`, `tend-a11y`, `tend-docs`) don't. Don't add a validator to one of these without updating this file's reasoning for why not.
- Every skill ships `evals/eval-N/{prompt,assertions}.md`. See `ai-forge-eval` in the source repo (orakl) for the assertion format if extending.
- Every skill sets `disable-model-invocation: true` in frontmatter: user-invoked only (`/tend-security`, etc.), never auto-triggered from conversation. This is the design decision behind the whole pack (single-skill, on-demand, human-paced runs replacing an unattended CI fleet that produced an 84-PR backlog). A skill that auto-triggers reintroduces the unattended-breadth failure mode the pack exists to avoid. New skills must set this flag too; don't add trigger-phrase language to a description once this flag is set, it's dead weight since auto-matching never runs.
- `skills/tend-onboard/assets/tend-sweep.yml` is a copy-out template for consuming repos, installed (opt-in, cadence-adjusted) by `tend-onboard`'s Phase 4. Never turn the template into a live workflow in *this* repo; the only workflow here is the Release workflow (see Releasing below).

## Judgment boundaries

NEVER:
- Never let a skill commit, branch, or open a PR. The pack's entire premise is working-tree-diff-and-stop; a skill that commits breaks the local review gate every other design decision depends on. The sweep template doesn't break this rule: its steward step commits *outside* any skill invocation, and the skill session's tool allowlist in the template must never gain git-write or `gh` tools.
- Never have two skills read different shapes from `.claude/tend/config.yaml`. The schema lives in `tend-onboard/references/config-schema.md`; every other skill's Phase 0 must match it exactly, not a remembered approximation.

ASK:
- Ask before changing the 5-module capability catalog (`data`, `validation`, `realtime`, `auth`, `feature-flags`): it's referenced by name across every module-gated skill's Phase 2 and `tend-onboard`'s detection logic.
- Ask before changing the license or copyright holder.

ALWAYS:
- When a skill's `scripts/` directory gains, loses, or changes what a script does: update [`SAFETY.md`](SAFETY.md) in the same change.
- When adding, removing, or renaming a skill: update the table in [`README.md`](README.md) in the same change.
- When the sweep template or `tend-onboard`'s unattended-mode phase changes: update the README "Unattended use" section in the same change.

## Adding a skill

1. Copy the phase-structure shape from an existing skill (`skills/tend-security` is the canonical example) rather than starting from a blank file.
2. Decide: structured-findings (ships a validator) or diff-is-the-finding (doesn't)? Follow the existing 3-vs-3 split's reasoning, not a default.
3. If it uses capability modules, gate each module's reference pack behind the config `modules:` list: never load a pack for an inactive module.
4. Add `evals/` with 2-3 real eval cases before calling it done.
5. Add a row to the table in `README.md`.

## Releasing

Releases are cut by the **Release** workflow (`.github/workflows/release.yml`), never by hand. It is a manual `workflow_dispatch` with one input, `tag`, and it releases the commit at the tip of the branch it is run on. Run it on `main`.

The workflow, in order:
1. Rejects a tag that is not `vX.Y.Z`, or that already exists.
2. Fails unless `version` in `.claude-plugin/plugin.json` and `plugins[0].version` in `.claude-plugin/marketplace.json` both equal `X.Y.Z`.
3. Takes the `## [X.Y.Z]` block from `CHANGELOG.md` as the release notes, and fails if there is none.
4. Creates the tag at the checked-out commit and publishes the GitHub release with those notes.

Nothing is created until every check passes, so a failed run leaves nothing to clean up.

To prepare a release, in one PR:
- Set the same new version in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
- Add a `## [X.Y.Z] - YYYY-MM-DD` block at the top of `CHANGELOG.md`, and its `[X.Y.Z]: …` link reference at the bottom.
- Merge to `main`.

Then run the workflow on `main` with `tag=vX.Y.Z`, from the Actions tab (**Release → Run workflow**) or from a shell:

```sh
gh workflow run release.yml --ref main -f tag=vX.Y.Z
```

Afterwards, confirm the release exists and its notes match the changelog block.

NEVER:
- Never push a tag or create a release outside the workflow. A hand-made tag makes the workflow refuse that version, and a hand-written release skips the changelog and version checks.
- Never work around a failed run by hand-writing notes or skipping a check. Fix the changelog or the manifests, merge, and re-run.
