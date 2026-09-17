# Alpha Website Playbook

The single source of truth for what every page of alpha.school must be, and for how an agent or a person executes and tests an APEX website ticket against it. Written to be agent-independent: Claude Code, Codex, Grok, Perplexity, or a human should reach the same conclusion from the same files.

Status: active and incomplete. See `docs/project-overview.md` for the original charter and `docs/alpha-website-playbook-strengthening-overview.md` for the September 17 audit-remediation scope.

## Read in this order

1. `playbook/00-how-to-use.md`: start here when handling a website request.
2. `docs/project-overview.md`: original charter, ownership, and governance.
3. `spec/`: the machine-readable form of the same requirements. Checks, validators, and the observer read these files. If prose and spec disagree, the spec is wrong or the prose is wrong; fix one, never work from the disagreement.
4. `protocols/`: how to take, execute, test, document, and close an APEX website ticket.
5. `registry/`: approved assets, exemplar pages, owners, and source-of-truth pointers.
6. `docs/related-systems.md`: what already exists outside this repo (and what is out of scope).
7. `docs/decisions-2026-09-15-findings.md`: proposed answers to the Sep 15 findings questions (awaiting Yash + Matt). See also the audit trail in `docs/decisions.md`.
8. `playbook/site/community-routing.md`: the Community URL contract, source boundary, identity crosswalk, and ticket routing.
9. `docs/findings-2026-09-16-community-routing.md`: the dated evidence behind the first verified Community mappings and coverage gaps.
10. `docs/alpha-website-playbook-strengthening-prd.md`: the approved work plan for closing known documentation gaps.

## Rules that never change

- Every requirement names its source: a person's decision, a source-of-truth system, a demonstrated-correct page, or a complaint. No requirement exists because it "seems right."
- Every defect found on the live site becomes a spec change first and a prose change second.
- A ticket is done only when the ticketed change is verified, the whole page is verified, and the ticket carries the evidence.
- Changes to this repo go through a pull request approved by a code owner (Matt Barge or Yash Chitneni).

## Related repositories

- `trilogy-group/AlphawordpressMCP`: the tool agents use to read and change alpha.school safely.
- `superbuilders/aeo`: the production observer that checks the live site against these requirements and files APEX tickets.
- `trilogy-group/alpha-event-task-management`: APEX, the ticket system of record.
- `trilogy-group/alpha-branding-skill`: brand production and QA skill; the brand rules in this playbook defer to MacKenzie's recorded choices and reference that skill.
- `marketingsupport` (Matt's workspace): the operating workflows that consume this playbook.
- Full map, including city-OS (out of scope): `docs/related-systems.md`.
