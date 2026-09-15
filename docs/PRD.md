# PRD: Alpha Website Playbook

Version: 0.1 (draft for review)
Date: September 15, 2026
Author: Matt Barge with Claude
Reviewers: Yash Chitneni, Matt Barge
Status: Proposed

## 1. Problem

alpha.school has about 60 campus pages, 100 marketing pages, and 200 posts. Changes arrive from campus staff through APEX, from the production observer that files defects automatically, from brand reviews, and from leadership. Several people and several agents edit the site. There is no written definition of what a page should be, so:

- Agents and people fix what a ticket names and miss what it implies. On September 15, 2026, 3 of 16 "launch copy" tickets were closed with the launch image still on the page.
- Testing is ad hoc. A text check passed while a page's header was visibly broken.
- Work done on pages is not written back to tickets, so tickets stop describing reality.
- Each tool (observer, MCP, marketing workflows) encodes its own partial rules, and they drift.
- Every new agent or person has to rediscover the rules by reading pages and asking around.

## 2. Goals

1. Any agent or person can determine, for any page and campus state, whether the page is correct and what to change, using only this repo and the named sources of truth.
2. Any agent can take an APEX website ticket and execute, test, document, and close it the same way, with the same evidence, regardless of which model or tool it runs on.
3. The observer, the MCP batch runner, and the ticket validator run from the same machine-readable spec, so a rule is enforced once and identically.
4. Every rule cites its source, and every defect found becomes a rule.

## 3. Non-goals

- Redesigning the site or changing the page template. The playbook documents the approved template; design changes are separate projects.
- Replacing APEX, the observer, or the MCP. The playbook feeds them.
- Copywriting. Approved copy is recorded here; new copy is written elsewhere and approved by the named owner before it enters the registry.
- Sister brands (Nova, NextGen, Texas Sports Academy, Alpha High) in version 1, except where their content leaks onto alpha.school pages.

## 4. Users and jobs

| User | Job to be done |
| --- | --- |
| Supervised agent (Claude Code, Codex) working APEX tickets | Validate the ticket, find the exact page and section, make the change, test the change and the page, write evidence, close or send back |
| URL-only agent (Grok, Perplexity) answering "is this page right?" | Read the published playbook and compare |
| Production observer | Decide which assertions to run per page and state; word tickets with the playbook section and the exact expected value |
| Matt and Yash | Approve requirements, resolve conflicts, own missing assets, review evidence |
| Campus staff requester | Know what a request must include for it to be executable |
| MacKenzie and Joe | See that their brand and product decisions are recorded once and enforced everywhere |

## 5. Deliverable A: the website playbook

### 5.1 Campus lifecycle states

Derived from the real sources, reconciled into one list, with the mapping from each source's raw value. Known today: Open, Enrolling, Announced, Pre-announcement. Expected after reconciliation: Enrolled (open with a waitlist), Paused, Closed, and possibly a Launching state with a named month and year. Each state names the source that decides it (HubSpot Programs lifecycle, the Operations sheet, the growth map API) and the precedence when they disagree.

### 5.2 Page model

The campus page template as it exists on the demonstrated-correct pages, derived from the live Elementor structure through the MCP. Sections identified so far: header, hero (title, subtitle, CTA row), intro (heading, body copy, intro card image or video), founding families or proof video row, events, contact and resources (contact, resources, packet, calendar, booking, map), team, video gallery, gallery, lower section, accreditation, footer. Off-page surfaces: homepage and Locations map pin, Locations card, page title and meta description, schema, social preview, sitemap entry.

### 5.3 Requirements matrix

For each state and each section: required, optional, or forbidden; the approved content or the source it must match; the owner when it is missing; the check that enforces it; the exemplar page. Recorded in `spec/campus-page-requirements.json` and rendered in `playbook/campus-page/<state>.md`.

### 5.4 Site-wide rules

Brand copy (MacKenzie's recorded choices, precedence over all other guidance; references `alpha-branding-skill`), header and footer, layout and rendering on desktop and mobile, SEO and schema, accessibility, performance basics, LLM readiness. Recorded in `spec/site-rules.json` and `playbook/site/*.md`.

### 5.5 Registries

Approved media per campus and who produces it; visually approved exemplar pages; owners per requirement family; source-of-truth pointers (system, object, field) for every fact the site displays.

### 5.6 Acceptance for Deliverable A

- Every campus page can be classified into one state from the sources, and the classification is recorded.
- Every section of the page model has a row for every state.
- Every row names a source.
- The observer's existing assertions are mapped to rows; assertions without a row are either added to the spec or marked advisory.
- Yash and Matt have visually approved the exemplar pages.

## 6. Deliverable B: the APEX ticket protocol

### 6.1 Intake validation

Per ticket class (staff card, copy, media, facts, links and CTAs, events, packets, status changes, observer defect), the fields a ticket must carry before work starts: page URL, section, current value, target value or the source that yields it, approving owner, and any asset. A validator script checks a ticket and produces the exact Missing Info text when it fails.

### 6.2 Claiming and status

Who may claim, how status moves, and the rule that anyone who changes a page updates the ticket the same day, including partial work.

### 6.3 Execution recipes

One recipe per ticket class: the exact reads, the exact writes through the MCP, the refusal conditions, and the rollback path.

### 6.4 Testing in three rings

1. The ticketed change, on the canonical URL, after cache clearing.
2. The whole page: text content, structure (header, hero, intro, CTAs, staff, events, footer present and styled), links resolve, no cross-campus or sister-brand leakage, desktop and mobile screenshots inspected, and the observer's assertions for that page pass.
3. Shared templates: after any site-wide action (cache clear, CSS regeneration, header or footer edit), two untouched pages are re-verified.

### 6.5 Evidence

The fields written to the ticket and to the workspace task record: page, object, before and after values and hashes, snapshot reference, screenshots, verification results per ring, spec version, actor, time.

### 6.6 Communication

When to post to Slack and to whom, the message templates, when to stop and ask, and how Missing Info is worded so the owner can act without reading the whole ticket.

### 6.7 Rollback

When rollback is mandatory (any ring-2 or ring-3 failure), how it is done through the MCP snapshot, and what is written to the ticket afterward.

### 6.8 Acceptance for Deliverable B

- The validator rejects the September 15 launch-copy tickets for Atlanta, La Jolla, and Santa Monica with the correct Missing Info text, and accepts the other thirteen.
- A dry run of the protocol on one ticket, performed by two different agents, produces the same evidence shape and the same close or send-back decision.
- The Atlanta header regression of September 15 is caught by ring 3 in a replay.

## 7. Distribution

- Repository entry files for repo-reading agents: `README.md`, `AGENTS.md`, `CLAUDE.md`.
- A published read-only site generated from `playbook/` and `protocols/`, with a plain-text index for URL-only agents. Host to be decided (GitHub Pages on the private repo requires org settings; an internal docs host is the fallback).
- APEX ticket templates link to the playbook section; observer tickets embed the spec row ID and the expected value.
- The marketing workspace's workflows reference the protocol instead of restating it.

## 8. Governance

- Pull requests only. Code owners: Matt Barge, Yash Chitneni.
- Source precedence: named leadership decision; source-of-truth system; visually approved exemplar; repeated complaint. Lower sources cannot override higher ones.
- Defects become spec changes with a failing check before the fix, and a passing check after.
- Spec files are schema-validated in CI. Prose that disagrees with the spec fails CI once the renderer exists.
- Versioned with tags. Evidence cites the version.

## 9. Milestones

| Milestone | Output | Depends on |
| --- | --- | --- |
| M0 | Repo, overview, PRD (this document) | none |
| M1 | Site inventory: section model derived from live pages through the MCP; list of pages that deviate from the model | MCP read access (exists) |
| M2 | Lifecycle states reconciled across HubSpot, Operations, map API; every campus classified | HubSpot and Operations read access |
| M3 | Requirements matrix for the Open state, with exemplar pages approved | M1, M2, Yash and Matt review |
| M4 | Ticket protocol and validator; validator run over the current APEX queue | M3 |
| M5 | Remaining states; site-wide rules; registries complete | M3 |
| M6 | Observer and MCP batch runner read the spec; published site live | M4, M5 |

## 10. Open questions

1. Which system decides a campus's lifecycle state when HubSpot, Operations, and the map API disagree?
2. Who approves exemplar pages, and how often are they re-approved?
3. Where is the published site hosted for URL-only agents?
4. Should observer tickets be auto-closed by the observer rerun, by the agent's evidence, or both?
5. Do sister-brand sites get their own playbooks or sections here?

## 11. Risks

- The site changes while the playbook is written. Mitigation: derive from live pages by tool, not by hand, and re-derive on a schedule.
- Requirements without sources creep in. Mitigation: CI rejects spec rows without a source.
- The playbook is written but not read. Mitigation: APEX tickets and observer tickets link to it; the validator refuses tickets that do not cite it.
- URL-only agents fall behind the repo. Mitigation: publish on every merge.
