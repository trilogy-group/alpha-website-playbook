# Project Overview: Alpha Website Playbook

Date: September 15, 2026
Owners: Matt Barge (Superbuilders), Yash Chitneni (Alpha)
Repository: `trilogy-group/alpha-website-playbook` (private)

## What this is

A written, versioned, machine-checkable definition of the correct state of alpha.school, page by page and campus state by campus state, plus the protocol any agent follows to execute and test an APEX website ticket.

Two deliverables live here:

1. **The website playbook.** For every campus lifecycle state and every section of a campus page, what must be present, what is forbidden, where the correct value comes from, who owns it when it is missing, which check enforces it, and which live page demonstrates it correctly. Plus the site-wide rules that apply to every page: brand copy, header and footer, layout, SEO and schema, accessibility, LLM readiness.
2. **The ticket protocol.** How a website ticket is validated at intake, claimed, executed, tested (the change, the whole page, and shared templates), documented, communicated, and closed or sent back for missing information.

## Why it exists

On September 15, 2026, a supervised agent worked 16 APEX tickets that said campus pages "still show launch copy but are already open." It fixed the sentence on 14 pages, verified by text, and closed the tickets. Three pages still showed a "Coming Fall 2026" image card, and one page served an unstyled header for 40 minutes because a tool step purged site-wide CSS. Review found:

- No document said what an open campus page must show, section by section, or what the approved media is per campus.
- No document said how a ticket must be tested before it closes, or that the whole page must be checked, not only the ticketed element.
- Work done on pages by people and other agents was never written back to the tickets, so the tickets no longer described the site.
- The observer that files tickets has its own assertions, the marketing workspace has its own rules, the MCP has its own checks, and none of them share one definition.

Yash confirmed there is no existing documentation of the correct website state. This repo is that documentation.

## Who uses it

| User | How |
| --- | --- |
| Claude Code, Codex, and other repo-reading agents | Clone or read the repo; entry files `README.md`, `AGENTS.md`, `CLAUDE.md` |
| Grok, Perplexity, and other URL-only agents | Published read-only site with a plain-text index; prompts point at the URL |
| The production observer (`superbuilders/aeo`) | Reads `spec/` to decide what to assert and how to word tickets |
| The Alpha WordPress MCP batch runner and ticket validator | Read `spec/` and `registry/` to plan edits and to refuse incomplete tickets |
| APEX | Links each website ticket to the playbook section it belongs to |
| Marketing and campus staff | Read `playbook/` to know what a page should look like and who to ask |

## How it is organized

```text
README.md              entry point and reading order
AGENTS.md, CLAUDE.md   agent entry files (same content, tool-specific names)
docs/                  this overview, the PRD, decision records
playbook/              human-readable requirements (markdown)
spec/                  machine-readable requirements (JSON, schema-validated)
protocols/             APEX ticket execution and testing protocol
registry/              approved assets, exemplar pages, owners, sources
tests/                 validators that check spec files and run checks against live pages
```

## How it is governed

- Requirements enter through pull requests. A code owner approves. The PR names the source of the requirement.
- Sources, in order of authority: a named decision by MacKenzie Price, Joe Liemandt, Matt, or Yash; a source-of-truth system (HubSpot Programs, the Operations sheet, the staff roster, the growth map API); a visually approved exemplar page; a repeated complaint from `#support-websites`, `#admin-websites`, APEX, or a DM.
- A defect on the live site is recorded as a spec change (with a failing check) before the page is fixed, and the check must pass afterward.
- The spec is versioned. Tickets and evidence cite the spec version they were tested against.

## Current status

- September 15, 2026: repository created, overview and PRD written.
- September 15, 2026 (M1, M2 drafts): 44 campus pages inventoried through the Alpha WordPress MCP (`spec/inventory/`), page model derived (`playbook/campus-page/page-model.md`, `spec/campus-page-model.json`), lifecycle states captured from the map API and the observer's Operations mapping (`spec/campus-lifecycle.json`), source pointers and the observer check catalog recorded (`registry/`). Conflicts and decisions for Yash and Matt are in `docs/findings-2026-09-15.md`.
- September 15, 2026 (M4 draft): APEX website ticket protocol written (`protocols/apex-website-ticket-protocol.md`), ticket classes spec and validator (`spec/ticket-classes.json`, `tests/validate-ticket.mjs`), first recipe. The validator reproduces the September 15 outcome: it rejects the Atlanta, La Jolla, and Santa Monica launch-copy tickets for missing approved media and accepts the other thirteen.
- September 15, 2026 (M5 partial): site-wide rules (`playbook/site/site-rules.md`, `spec/site-rules.json`); all 97 observer check names mapped to requirement rows (`spec/observer-check-map.json`); recipes for staff cards, campus facts, media, copy, and links; protocol v0.2 adds the partial-completion rule and step 8, filing new tickets for defects found while working (`tests/file-apex-ticket.mjs`). Group A replay: `docs/replay-group-a-2026-09-15.md`.
- September 15, 2026 (docs, this PR): related systems map in `docs/related-systems.md`; proposed ADR for the six findings questions in `docs/decisions-2026-09-15-findings.md` (still Proposed; Q1 HubSpot-wins is already recorded in `docs/decisions.md`).
- September 15, 2026 (M3 partial on main): Open-state rows for the sections group A exercised (`playbook/campus-page/open.md`, `spec/campus-page-requirements.json`). Remaining sections and remaining findings answers still open.
- September 16, 2026 (Community routing): documented the current `campus=<slug>` Community URL contract, source authority boundaries, exact HubSpot program ID identity join, Jacksonville and Short Hills mappings, ticket routing by surface, and incomplete observer coverage. This is documentation and read-only validation only; no Community app, map, HubSpot, or WordPress change is included.
- Next: finish M3 Open matrix; lock or rewrite Proposed answers Q2–Q6; keep city-OS out of this repo.
