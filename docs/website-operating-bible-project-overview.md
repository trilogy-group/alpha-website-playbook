# Project Overview: Alpha Website Operating Bible

Date: September 17, 2026  
Status: Proposed  
Primary owner: Matt Barge  
Repository: `trilogy-group/alpha-website-playbook`  
Audit baseline: `main` at `828fb37`

## Executive summary

The Alpha Website Playbook should become the complete operating reference for anyone or any agent working on `alpha.school`. A fresh operator should be able to receive an APEX ticket, identify the system that owns the requested value, select the supported execution path, make the change safely, verify the public result, attach evidence, and close or route the ticket without relying on undocumented history.

The current playbook has a strong foundation. It documents campus-page concepts, several content pipelines, source diagnosis, community routing, and a careful ticket protocol. It is not yet the complete website operating bible. The largest gaps are the missing start-here guide, incomplete source and capability maps, missing execution recipes, incomplete campus lifecycle requirements, and the lack of operational runbooks for HubSpot, n8n, caching, forms, admissions, SEO, LLM publishing, WordPress infrastructure, and non-campus page families.

HubSpot and n8n documentation is a major part of the work, but it is not the whole project. The playbook must explain the entire chain from request to authoritative source to delivery system to public verification.

## Why this project matters

Website tickets often look like simple WordPress edits, but the rendered value may be owned by HubSpot, delivered by n8n, stored in Elementor, altered by a global template, cached by WP Engine or Cloudflare, and observed by another automated system. Editing the visible page without understanding that chain can create a temporary fix that is overwritten later.

A complete playbook prevents five recurring failures:

1. Editing the wrong WordPress object or an unpublished duplicate.
2. Editing WordPress when another system is authoritative.
3. Using a tool or actor that does not support the requested operation.
4. Treating a successful save as proof that the public page is correct.
5. Closing a ticket without enough evidence for another person to reconstruct what happened.

## Intended operating model

```text
APEX ticket
    -> validate request and required inputs
    -> resolve the canonical public page and WordPress object
    -> identify the authoritative source
    -> claim the ticket and site lease
    -> select an approved execution path
    -> prepare and review the proposed change
    -> apply through Alpha MCP, HubSpot, n8n, or another approved system
    -> run or wait for delivery workflows when required
    -> regenerate CSS and clear caches when required
    -> verify the canonical public URL
    -> attach evidence and close, hold, or route the ticket
```

APEX remains the system of record for requests, status, leases, approvals, and completion evidence. The playbook defines the rules. Alpha MCP and other integrations perform supported operations. HubSpot, n8n, Airtable, WordPress, and other systems remain authoritative for the fields they own.

## Who this serves

| User | What the playbook must let them do |
| --- | --- |
| Scheduled APEX agent | Determine eligibility, execute supported tickets, verify results, and stop safely on unsupported work |
| Human website operator | Handle urgent and exceptional tickets using the same controls and evidence standards |
| Alpha MCP client | Discover supported operations, inputs, refusal conditions, and verification requirements |
| Marketing support | Understand where a requested value comes from and route missing information to the correct owner |
| Observer and QA systems | Read the same requirements used by operators and avoid filing contradictory tickets |
| New engineer or agent | Understand the website architecture, environments, integrations, risks, and operating procedures without private background context |

## Current foundation

The existing playbook already contains useful coverage of:

- HubSpot Programs to n8n to Elementor delivery
- APEX Program editor updates and HubSpot readback
- Locations and growth-map delivery
- HubSpot event imports
- Airtable to Alpha Answers imports
- Community routing
- Canonical page resolution and source diagnosis
- Ticket intake, prepare and apply separation, snapshots, cache handling, public verification, and evidence
- Campus registries, owner routing, and several ticket recipes

This work should be extended and reconciled, not replaced.

## Audit scope and findings

The September 17 audit reviewed:

- The live `alpha.school` website
- The Alpha Website Playbook at commit `828fb37`
- The Alpha WordPress MCP implementation and documentation
- The APEX integration path used by the scheduled website agent

At the time of review, the live site included approximately:

- 100 published pages
- 44 registered campus pages
- 56 non-campus pages
- 163 posts
- 88 Alpha Answers resources
- 123 HubSpot event posts

All 44 registered campus URLs returned successfully and included the expected global structure and campus integration markers. The audit found several content and governance defects, but the main project finding was that the website is broader than the current documentation.

## Project scope

### 1. Entry point and reading path

Create a real start-here guide that tells a fresh operator what to read, how to identify the ticket type, which source and tool to use, and where to stop. Repair stale links and version labels.

### 2. Website architecture and source authority

Document every material path that can produce or change public website content. For each field family, identify:

- Authoritative system
- Source object and field
- Delivery workflow
- WordPress destination
- Update frequency
- Supported editor
- Verification method
- Failure owner

### 3. Actor and capability boundaries

Create a capability matrix for the scheduled agent, human operators, Alpha MCP, browser editing, legacy Elementor endpoints, HubSpot, n8n, and other approved paths. Resolve whether production human writes require an APEX token or may use Alpha MCP operator mode.

### 4. Ticket execution

Write a complete APEX operating procedure covering intake, deduplication, eligibility, claiming, leases, preparation, approval, application, verification, evidence, rollback, retries, communication, and closure.

### 5. Execution recipes

Add one tested recipe for every supported ticket class, including staff, copy, links and CTAs, media, campus facts, status, SEO, HubSpot data, synchronization mappings, forms, events, redirects, global templates, and unsupported requests.

### 6. Page-family requirements

Define requirements for campus pages across every lifecycle and for the homepage, Locations, admissions, applications, forms, confirmation pages, Alpha Answers, articles, press, events, legal pages, campaigns, global templates, review pages, and sandboxes.

### 7. Integration runbooks

Add operational runbooks for HubSpot, n8n, WordPress and Elementor, Alpha MCP, WP Engine, Cloudflare, Airtable, event imports, community routing, maps, forms, analytics, consent, and application systems.

### 8. Infrastructure inventories

Maintain the environments, domains, object IDs, plugins, API namespaces, templates, snippets, redirects, navigation, forms, popups, analytics, consent, and owner inventories needed to operate the site.

### 9. SEO and LLM publishing

Document sitemap, canonical, redirects, robots, noindex, Markdown exports, `llms.txt`, `llms-full.txt`, Alpha Answers, schema, and validation rules.

### 10. Quality, governance, and maintenance

Define accessibility, performance, browser support, media, legal, evidence, incident, change-control, validation, and review-cadence requirements. Add automated checks for schemas, prose-to-spec consistency, links, versions, and required owners.

## What is not part of this project

- Redesigning the website
- Replacing APEX, HubSpot, n8n, WordPress, or Alpha MCP
- Changing live website content solely because the audit found a defect
- Expanding version 1 to sister-brand websites
- Allowing an agent to improvise copy, assets, ownership, or approvals

Live defects discovered during documentation work should become separate APEX tickets and follow the normal website process.

## Required deliverables

1. Start-here operating guide
2. Website architecture and source-of-truth map
3. Actor-by-capability matrix
4. Production and staging operating policy
5. Complete APEX ticket standard operating procedure
6. Ticket recipe library
7. Campus lifecycle requirements matrix
8. Page-family requirement library
9. HubSpot and n8n runbooks
10. WordPress, Elementor, Alpha MCP, cache, forms, admissions, SEO, and LLM runbooks
11. Environment, plugin, template, redirect, form, analytics, and owner inventories
12. Repository validation command and CI checks
13. Maintenance and review cadence

## Success criteria

The project is successful when:

- A fresh agent can correctly route and explain ten representative website tickets using only the playbook and named systems.
- Two different operators make the same eligibility and execution-path decision for the same ticket.
- Every supported ticket class has an executable recipe and a tested rollback path.
- No production write can begin without a canonical object, authoritative source, actor, environment, collision control, and expected verification method.
- Every completed ticket includes public canonical verification and reconstructable evidence.
- HubSpot or n8n owned values are changed at the source and verified through the complete delivery chain.
- The scheduled agent refuses unsupported work instead of silently falling back to browser automation or an unsafe endpoint.
- Documentation, machine-readable specifications, and tool capabilities are checked for drift in CI.

## Separate live-site findings

The audit also identified likely website tickets. These do not change the documentation project scope:

- Fourteen Open campuses contain launch-era wording.
- Four Announced campuses do not name an opening month or season and year.
- Austin contains a hidden John Doe campus-leader placeholder.
- Palo Alto contains a hidden `bio` placeholder.
- Three indexable pages lack meta descriptions.
- Several pages may lack semantic H1 elements and require visual confirmation.
- `llms.txt` includes redirected application URLs and a noindex review page.

These findings should be deduplicated against APEX before new tickets are filed.

## Delivery sequence

| Phase | Outcome |
| --- | --- |
| 1. Make it usable | Repair the entry point; add source, capability, environment, claim, and lease guidance |
| 2. Make common tickets executable | Complete campus lifecycle requirements and the missing ticket recipes |
| 3. Make the machinery understandable | Add integration, cache, forms, admissions, infrastructure, and owner runbooks |
| 4. Cover the whole website | Add requirements for every major page family and global surface |
| 5. Keep it trustworthy | Add CI, automated drift checks, observer coverage, ownership, and review cadence |

The detailed requirements and acceptance criteria are defined in `docs/website-operating-bible-prd.md`.
