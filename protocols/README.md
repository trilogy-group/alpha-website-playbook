# Protocols

- `apex-website-ticket-protocol.md` (v0.2): validate, claim, reconcile, execute, test in three rings, roll back, document, and file new tickets for anything else found. Includes the partial-completion rule (do every fixable part, never close with a part open).
- `recipes/`: `launch-copy.md`, `staff-card.md`, `campus-facts.md`, `media-copy-links.md`.
- Helpers: `tests/validate-ticket.mjs` (intake), `tests/page-check.mjs` (ring 2), `tests/file-apex-ticket.mjs` (step 8, dry-run by default).
