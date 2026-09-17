# Protocols

- `apex-website-ticket-protocol.md` (v0.3): validate, claim, reconcile, execute, test in three rings, roll back, document, and file new tickets for anything else found. Includes the partial-completion rule (do every fixable part, never close with a part open).
- `production-and-staging.md`: environment choice, claim and lease mechanics, canary evidence, batches, and production completion.
- `rollback-and-incidents.md`: snapshots, collision recovery, partial saves, exact restoration, and incident containment.
- `evidence-and-screenshots.md`: required artifacts, viewport set, labels, privacy and APEX evidence upload.
- `recipes/`: one canonical recipe per executable ticket class. `media-copy-links.md` remains a combined historical overview; use `copy.md`, `link-cta.md`, and `media.md` for current execution.
- Helpers: `tests/validate-ticket.mjs` (intake), `tests/page-check.mjs` (ring 2), `tests/file-apex-ticket.mjs` (step 8, dry-run by default).
