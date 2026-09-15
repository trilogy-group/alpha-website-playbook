# Protocols

- `apex-website-ticket-protocol.md`: how any agent or person validates, claims, reconciles, executes, tests (three rings), documents, communicates, and closes an APEX website ticket.
- `recipes/`: one execution recipe per ticket class. Written so far: `launch-copy.md`.
- Validator: `tests/validate-ticket.mjs --file <apex tasks json> [--summary]` classifies tickets and produces the Missing Info text for incomplete ones.
