# Protocols

- `apex-website-ticket-protocol.md` (v0.4): validate, claim, reconcile, execute, test in three rings, roll back, document, and file new tickets for anything else found. Includes the partial-completion rule (do every fixable part, never close with a part open). The wording of every note and body it prescribes is `spec/ticket-templates.json` (v0.4 moved the literal blocks there; the document quotes generated examples).
- `production-and-staging.md`: environment choice, claim and lease mechanics, canary evidence, batches, and production completion.
- `rollback-and-incidents.md`: snapshots, collision recovery, partial saves, exact restoration, and incident containment.
- `evidence-and-screenshots.md`: required artifacts, viewport set, labels, privacy and APEX evidence upload.
- `recipes/`: one canonical recipe per executable ticket class. `media-copy-links.md` remains a combined historical overview; use `copy.md`, `link-cta.md`, and `media.md` for current execution.
- Helpers: `tests/validate-ticket.mjs` (intake), `tests/page-check.mjs` (ring 2), `tests/file-apex-ticket.mjs` (step 8, dry-run by default).

## Running as a fresh agent from a worktree

Work from a detached worktree of `origin/main` so a shared checkout is never edited. The playbook has no npm dependencies; do not symlink another checkout's `node_modules` into the worktree (a later `git worktree remove --force` follows the symlink and deletes the target, which happened on 2026-09-18). Pass `--playwright /Users/matthewbarge/DevProjects/aeo` to `tests/rendered-controls.mjs` instead. `list_receipts` filters by `ticketId` (not `apexTicketId`) and `runId`; unknown keys are dropped silently. A 429 from `flush_wp_engine_cache` carries `retryAfterSeconds` in the REST body; wait that long once rather than looping on `cooldownSeconds`.
