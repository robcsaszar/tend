No `.claude/tend/config.yaml` exists in this repo. Run a refactor scan focused on component extraction on `src/routes/curator/`.

`src/routes/curator/create.svelte`, `src/routes/curator/avatars.svelte`, and `src/routes/curator/import.svelte` each contain an identical 4-element status-banner block: an icon, a heading, a message paragraph, and a dismiss button. Text content differs between the three; structure is identical; none of the three uses prop-spreading.

`src/routes/curator/questions.svelte` contains a visually similar-looking status banner, but its wrapper element has a `{...bannerProps}` spread and it includes an extra conditional retry button not present in the other three.

`docs/components.md` has no existing status-banner-equivalent component listed.
