# Decision Record

Decisions by name and date. Each becomes a rule in `spec/` and `playbook/`; this file is the audit trail.

| Date | Decision | By | Applied in |
| --- | --- | --- | --- |
| 2026-09-15 | Two-layer playbook (human markdown plus machine-readable spec) that the observer, the MCP batch runner, and the ticket validator all read. | Matt Barge | PRD section 7, repo layout |
| 2026-09-15 | Every requirement names its source; precedence is a named leadership decision, then a source-of-truth system, then a visually approved exemplar, then a repeated complaint. | Matt Barge | PRD section 8, `docs/project-overview.md` |
| 2026-09-15 | HubSpot is the source of truth for campus state. If HubSpot says a campus is Open, the website says open. The Operations sheet and the growth map are downstream of HubSpot; where they disagree with HubSpot, HubSpot wins and the other source is corrected. | Matt Barge | `spec/campus-lifecycle.json` precedence, `protocols/recipes/campus-facts.md`, `protocols/recipes/launch-copy.md` |
| 2026-09-15 | Proposed, awaiting Matt: campus roles (Director of Admissions, Dean of Parents) are resolved live from the Admissions Hub org chart with emails from HubSpot owners, never copied into a static list; the playbook keeps only the overrides Hailey confirmed and a dated snapshot as a fallback. Department roles stay in `registry/people.json` with a source and date. | Matt Barge (asked 2026-09-15) | `spec/responsibilities.json` 0.2 `roles.*.resolution`, `tests/resolve-campus-roles.mjs`, `playbook/responsibilities.md` |
