# Alpha Website Playbook

The single source of truth for what every page of alpha.school must be, and for how an agent or a person executes and tests an APEX website ticket against it. Written to be agent-independent: Claude Code, Codex, Grok, Perplexity, or a human should reach the same conclusion from the same files.

Status: scaffolding. See `docs/project-overview.md` for the why and `docs/PRD.md` for what will be built and in what order.

## Read in this order

1. `docs/project-overview.md`: what this repo is, who owns it, how it is used.
2. `playbook/`: human-readable requirements. Start with `playbook/00-how-to-use.md`.
3. `spec/`: the machine-readable form of the same requirements. Checks, validators, and the observer read these files. If prose and spec disagree, the spec is wrong or the prose is wrong; fix one, never work from the disagreement.
4. `protocols/`: how to take, execute, test, document, and close an APEX website ticket.
5. `registry/`: approved assets, exemplar pages, owners, and source-of-truth pointers.

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
