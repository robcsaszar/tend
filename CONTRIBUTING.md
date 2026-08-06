# Contributing

Thanks for considering a contribution to `tend`. This is a small, opinionated skill pack. Contributions are welcome, but the bar is "does this fit the pack's shape," not "is this a good idea in general."

## Before you start

- **Bug in an existing skill's check?** Open an issue with the exact false-positive or false-negative example. A skill that flags the wrong thing, or misses an obvious one, is the highest-value kind of report here.
- **New skill idea?** Open an issue first. Every skill in this pack shares one phase structure and one config file; a new skill needs to fit that shape, not introduce its own.
- **Design questions** (should this be a new capability module vs. core? should this be its own skill vs. folded into an existing one?) are worth raising as an issue before writing code. See `AGENTS.md` for the boundaries already decided.

## Making a change

1. Fork and branch from `main`.
2. Follow the existing shape. `skills/tend-security` is the reference example: copy its phase structure (`0. Load config` → `1. Triage` → `2. Scan` → `3. Fix` → `4. Verify & present` → `NEVER`), don't invent a new one.
3. If your change touches a skill's `scripts/` validator, add or update fixtures and confirm both a valid and an invalid case produce the right exit code before opening a PR.
4. If you're adding a new skill, it needs `evals/` with at least 2 realistic cases (prompt + falsifiable assertions) before it's mergeable. See any existing skill's `evals/` directory for the format.
5. Update `README.md`'s skill table and, if you added a script, `SAFETY.md`, in the same change.

## Quality bar

Every skill in this pack is expected to score B or higher against `ai-forge-judge`'s rubric (Universal + Skill Module dimensions, 120 points total). This isn't enforced by CI here (the pack itself has none, by design), but a PR that visibly regresses a skill's structure, description, or anti-pattern coverage will be asked to fix that before merge.

## What won't be merged

- Changes that make a skill commit, branch, or open a PR on the user's behalf: the working-tree-diff-and-stop model is the point of this pack.
- New capability modules or scope expansions without a prior issue discussing the boundary.
- Orakl-specific (or any other single-repo-specific) assumptions leaking back into a skill: these skills need to read as generic SvelteKit + TS guidance, not one project's dogfood notes. `tend-docs` is the sole documented exception (dogfood-only by design).

## Questions

Open an issue. There's no separate chat/forum for this project.
