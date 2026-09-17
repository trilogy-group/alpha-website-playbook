# PRD: Alpha Website Playbook Strengthening

Version: 0.1  
Date: September 17, 2026  
Status: Proposed  
Product owner: Matt Barge  
Repository: `trilogy-group/alpha-website-playbook`  
Related overview: `docs/alpha-website-playbook-strengthening-overview.md`

## 1. Plan definition

This plan closes the gaps found in the September 17 audit of the existing Alpha Website Playbook. It does not create a separate feature, product, or workflow. The strengthened playbook must give a fresh agent enough verified context to take an APEX website ticket from intake through public verification without relying on undocumented knowledge.

The remediation work consists of additions and corrections to the playbook's documentation, specifications, inventories, tested recipes, validation tools, and maintenance controls. It does not replace the systems that own or deliver website data.

## 2. Problem statement

Alpha website content is produced by several systems and edited by several actors. A public value may originate in APEX, HubSpot, Airtable, a campus registry, an approved asset, or WordPress. It may then be delivered through n8n, Elementor, a custom plugin, a global template, or a browser-based process. WP Engine and Cloudflare can delay what the public sees.

The current playbook documents important parts of this environment but does not yet let a new agent safely complete the entire job. Major problems include:

- The documented entry point references a missing start-here file.
- The source of truth and delivery path are not defined for every website field family.
- The scheduled agent supports fewer Alpha MCP operations than the playbook's ticket taxonomy implies.
- Several ticket classes do not have matching execution recipes.
- Campus lifecycle and non-campus page requirements are incomplete.
- HubSpot and n8n have pipeline descriptions but not complete operator runbooks.
- Production, staging, collision, rollback, caching, forms, admissions, SEO, and LLM publishing procedures are incomplete.
- Documentation and machine-readable specifications can drift without CI detecting it.

## 3. Goals

1. Make the correct execution path discoverable from any APEX website ticket.
2. Prevent edits to the wrong object, environment, or source system.
3. Give humans and scheduled agents the same eligibility, safety, verification, and evidence rules.
4. Cover the full public website, not only campus pages.
5. Make HubSpot, n8n, WordPress, Elementor, Alpha MCP, caching, forms, and publishing mechanics operationally understandable.
6. Make unsupported or ambiguous tickets fail closed with a useful routing message.
7. Keep prose, specifications, inventories, and tool capabilities synchronized over time.

## 4. Non-goals

- Redesigning `alpha.school`
- Replacing APEX as the request, lease, approval, and evidence system
- Replacing HubSpot, n8n, WordPress, Elementor, Airtable, or Alpha MCP
- Building a second workflow or audit database
- Automatically fixing every defect found during the audit
- Inventing missing content, assets, field ownership, or approval
- Covering Nova, NextGen, Waypoint, or other sister-brand websites in version 1

## 5. Users

### 5.1 Scheduled APEX agent

Needs deterministic eligibility checks, supported tools, lease handling, idempotency, expected hashes, bounded retries, public verification, and stop conditions.

### 5.2 Human website operator

Needs fast handling for urgent work without bypassing the canonical-object, source, collision, evidence, and verification controls.

### 5.3 Marketing support

Needs to classify requests, collect required inputs, identify the correct system and owner, and explain status to requesters.

### 5.4 Website engineer or administrator

Needs environment, plugin, template, endpoint, deployment, rollback, cache, integration, and ownership information.

### 5.5 Observer and QA automation

Needs machine-readable requirements, page applicability, expected values, severity, and evidence rules that match the human playbook.

## 6. Core operating principles

1. APEX is the system of record for tickets, leases, approvals, status, and completion evidence.
2. The authoritative source is changed before a downstream rendering layer.
3. The canonical public URL and backing WordPress object are resolved before mutation.
4. Non-canonical and draft objects cannot be production mutation targets unless the ticket explicitly requests draft-only work.
5. Every write has a known actor, environment, expected hash, snapshot or rollback path, and idempotency key where supported.
6. A successful save is not completion. Only the public canonical result can produce `verified_pass`.
7. Missing information and unsupported structures stop execution and route to a named owner.
8. The scheduled agent cannot silently fall back to browser editing or a less safe endpoint.
9. Live defects found while documenting are handled as separate APEX tickets.

## 7. Functional requirements

### FR-1: Start-here guide

The repository must provide one valid entry point for a fresh agent.

It must include:

- Reading order
- Five-minute architecture summary
- Ticket classification procedure
- Source-of-truth decision tree
- Actor and tool selection procedure
- Production versus staging decision tree
- Stop and escalation conditions
- Links to recipes, runbooks, specifications, registries, and owners

Acceptance criteria:

- All repository entry files link to an existing guide.
- A link checker reports no broken internal references.
- A new agent can locate the correct recipe for each supported ticket class in no more than three navigation steps.

### FR-2: Website architecture map

The playbook must document each system that can create, transform, store, deliver, cache, or verify public content.

Required systems include:

- APEX
- HubSpot Programs and forms
- n8n workflows
- WordPress and Elementor
- Alpha MCP and other authenticated WordPress writers
- Airtable and Alpha Answers
- HubSpot event imports
- Growth map and Locations
- Community routing
- WP Engine and Cloudflare
- Finalsite and application flows
- Analytics, consent, Voiceflow, and global scripts

Every integration row must identify source, destination, direction, schedule or trigger, object and field mapping, failure owner, inspection method, and verification method.

### FR-3: Source-of-truth registry

The repository must maintain a field-family registry with:

- Displayed value or field family
- Authoritative system
- Source object and field
- Delivery mechanism
- Destination object or component
- Allowed editors
- Refresh schedule
- Conflict precedence
- Verification method
- Owner when missing or wrong

The registry must cover campus facts, lifecycle, staff, events, community links, map locations, packets, calendars, booking links, application routes, Alpha Answers, page copy, SEO, media, and global navigation.

### FR-4: Actor-by-capability matrix

The playbook must state what each actor can read, prepare, apply, verify, and roll back.

Actors must include:

- Scheduled APEX agent
- Human Alpha MCP operator
- Marketing Ops Bot or approved execution host
- WordPress browser operator
- HubSpot operator
- n8n operator
- Legacy Elementor integration
- Observer

Operations must include staff add, staff copy update, staff removal, staff photo, general copy, link and CTA, media, page status, SEO, redirects, campus facts, source data, synchronization mapping, forms, events, global templates, cache purge, and verification.

The matrix must distinguish implemented, tested, allowed, human-only, and unsupported. It must not infer scheduled-agent support from a tool existing in Alpha MCP.

### FR-5: APEX ticket lifecycle

The ticket procedure must define:

- Intake and ticket normalization
- Duplicate search
- Required information by ticket class
- Eligibility decision
- Claim and lease acquisition
- Lease renewal and release
- Collision detection
- Status transitions
- Preparation and approval
- Application
- Verification
- Evidence upload
- Partial completion
- Missing information
- Failure, retry, and escalation
- Closure and requester communication

It must include exact commands, payload examples, expected responses, and failure examples where an interface supports them.

### FR-6: Environment and mutation policy

The playbook must define:

- Production and staging domains
- WordPress environment identity
- Credential type and owner
- Which work must be tested in staging
- Which allowlisted operations may run directly in production
- Canary requirements
- Prohibited production operations
- Emergency human procedure
- How draft-only work is identified and verified

The policy must resolve whether Alpha MCP operator mode may write to production without an APEX-signed token. Until resolved, automated production writes require a valid APEX ticket and lease.

### FR-7: Canonical resolution and collision control

Every mutation recipe must require:

- Canonical public URL
- Resolved WordPress object ID and status
- Environment identity
- Semantic hash of the expected current component or document
- Ticket ID and lease
- Idempotency key where supported

Hashing must use canonicalized parsed Elementor data so harmless serialization differences do not create false conflicts.

### FR-8: Ticket recipe library

Provide one recipe for every supported ticket class:

- Staff add, update, photo, reorder, and removal
- General copy
- Link and CTA
- Media upload and replacement
- Campus facts and lifecycle
- Launch copy
- SEO and social metadata
- Redirects
- HubSpot-owned data
- n8n mapping or delivery
- Events
- Community links
- Maps and Locations
- Forms and application routing
- Global header, footer, navigation, and templates
- Cache and public verification
- Unsupported or ambiguous work

Every recipe must contain prerequisites, authoritative source, supported actors, preparation, approval, apply, cache, verification, rollback, evidence, and stop conditions.

### FR-9: HubSpot and n8n runbooks

The HubSpot and n8n documentation must specify:

- Supported APEX Program-editor fields
- Fields that cannot be changed by website operators
- Exact workflow IDs and owners
- Trigger and schedule behavior
- Manual-run procedure
- Execution-log inspection
- Expected readback and delivery latency
- Retry policy
- Partial-save behavior
- Alerting and escalation
- Safe disable and recovery
- Workflow export, versioning, and drift checks
- A worked example from APEX through HubSpot, n8n, WordPress, cache, and canonical verification

The runbook must state that website-rendering fields are changed in their authoritative source, not patched in Elementor to create a temporary result.

### FR-10: Cache and public verification runbook

The playbook must define the required order and conditions for:

1. Elementor CSS regeneration
2. WP Engine clear-all cache
3. Cloudflare purge by URL
4. Bounded retry
5. Canonical URL verification
6. Header inspection
7. Evidence recording

It must include batching policy, cooldowns, blast-radius warnings, cache failure states, and the rule for handling one failed ticket in a batch. Verified sibling tickets remain complete unless a shared document write invalidated them.

### FR-11: Campus lifecycle requirements

The requirements matrix must cover every material campus section for:

- Pre-Announcement
- Announced
- Enrolling or Launching
- Open
- Waitlist or Enrolled, if approved
- Paused or Closed, if approved

Each state and section must define required, optional, or forbidden content; authoritative source; owner; check; and exemplar. Fixtures should cover structures present in the active backlog. Unknown Elementor structures must fail closed and be added only when required by a real ticket.

### FR-12: Page-family models

The playbook must define purpose, structure, source fields, global dependencies, publishing requirements, tests, and owners for:

- Homepage
- Locations
- Campus pages
- Admissions
- Application and payment pages
- Forms and confirmation pages
- Alpha Answers
- Articles and press
- Event pages
- Legal pages
- Campaign landing pages
- Global templates and navigation
- Review pages, sandboxes, and unpublished drafts

### FR-13: Infrastructure inventory

Maintain a verified inventory of:

- WordPress environments and domains
- Application-password identities and permissions
- Installed plugins, versions, owners, deploy path, and rollback
- WordPress REST and Abilities namespaces that permit writes
- Front page ID `3657`
- Header template ID `76`
- Footer template ID `77`
- Campus SEO template ID `6140`
- Global custom code and snippets
- Redirects
- Navigation menus
- Forms and popups
- Analytics and consent integrations

The inventory must identify overlapping writers and state which are approved, deprecated, or forbidden for each operation.

### FR-14: Forms and admissions runbook

Document:

- HubSpot portal `40051392`
- Form IDs and owners
- `submission_campus` routing
- Finalsite redirect behavior
- Application and payment or paygate flow
- Confirmation pages
- UTM propagation
- Contact creation and downstream routing
- Safe test identities and QA procedure
- Production test cleanup
- Failure and escalation ownership

### FR-15: SEO and LLM publishing runbook

Document:

- Canonical and sitemap policies
- Sitemap inclusion and exclusion
- Robots and noindex rules
- Redirect ownership between Yoast and the Redirection plugin
- Schema ownership and validation
- Markdown page generation
- `llms.txt` and `llms-full.txt` generation, filtering, caching, ownership, and QA
- Alpha Answers schema, canonical entry behavior, and import validation

Redirected, noindex, review, and sandbox pages must not enter LLM exports unless an explicit rule permits them.

### FR-16: Quality standards

Define testable requirements for:

- Accessibility
- Desktop and mobile rendering
- Supported browsers
- Performance and Core Web Vitals
- Broken links
- Cross-campus and sister-brand leakage
- Media naming, licensing, compression, dimensions, crops, focal points, and alt text
- Legal review and approval
- Public verification evidence

### FR-17: Rollback and incident response

The playbook must explain:

- Where Elementor snapshots are stored
- How snapshots are retrieved and restored
- When rollback is mandatory
- How partial writes are detected
- How global regressions are contained
- When automated execution is disabled
- How leases and ticket state are reconciled after failure
- How an incident is communicated and reviewed

WordPress revisions cannot be presented as sufficient rollback for Elementor documents.

### FR-18: Repository validation and governance

Provide one local validation command and matching CI that checks:

- JSON syntax and schemas
- Required source and owner fields
- Internal links
- Protocol and specification versions
- Recipe references from ticket classes
- Prose-to-spec consistency where machine-checkable
- Inventory freshness
- Duplicate IDs
- Owner completeness

Changes must use pull requests and cite the source of each new requirement. The repository must define who approves operational, brand, integration, legal, and infrastructure changes.

### FR-19: Evidence and observability

Each completed ticket must record:

- Ticket and lease IDs
- Actor and execution path
- Environment
- Canonical URL and object ID
- Before and after values
- Raw and semantic hashes when applicable
- Snapshot reference
- Cache actions
- Verification timestamp and result
- Screenshots or machine evidence
- Playbook version

The observer must distinguish `verified_pass`, `verified_failure`, and `unverified`.

## 8. Non-functional requirements

### Reliability

- Unknown page structures, missing source data, hash conflicts, expired leases, and unavailable verification must stop writes.
- Retries must be bounded and idempotent.
- Successful items in a batch must not be rolled back because an unrelated sibling ticket failed.

### Security

- Credentials must never be stored in this repository.
- Production and staging credentials must be distinct.
- WordPress identities must preserve actor attribution where practical.
- Tool output and evidence must redact credentials and sensitive contact data.

### Maintainability

- Every inventory has an owner and review cadence.
- Every integration runbook identifies how drift is detected.
- New ticket classes cannot be marked executable until a matching tested recipe exists.

### Usability

- Instructions use copyable examples and plain language.
- A fresh agent can reach the relevant recipe from the start-here guide without searching private conversation history.
- Human and machine-readable documents use the same stable requirement IDs.

## 9. Required information architecture

```text
README.md
playbook/00-how-to-use.md
docs/
  website-architecture.md
  environments-and-identities.md
  actor-capability-matrix.md
  ownership.md
playbook/
  campus-page/
  page-families/
  integrations/
  quality/
protocols/
  apex-website-ticket-protocol.md
  production-and-staging.md
  rollback-and-incidents.md
  recipes/
registry/
  sources.json
  owners.json
  environments.json
  plugins.json
  templates.json
  forms.json
  redirects.json
spec/
  ticket-classes.json
  source-authority.json
  actor-capabilities.json
  page-family-requirements.json
tests/
  validation entry point and fixtures
```

Existing files should be extended or renamed only through a reviewed migration. This structure describes the required information, not an instruction to duplicate material that already exists.

## 10. Delivery plan

### Phase 1: Safe entry and routing

Deliver:

- Working start-here guide
- Website architecture map
- Source-of-truth registry
- Actor-capability matrix
- Production and staging policy
- APEX claim, lease, collision, and evidence procedure
- Reconciled document versions and links

Exit criteria:

- A fresh agent correctly classifies and routes ten representative tickets.
- The scheduled agent's supported operations are clearly distinguishable from the full Alpha MCP tool inventory.
- The production operator-mode policy has an approved decision.

### Phase 2: Common-ticket execution

Deliver:

- Complete Open and active launch-state campus requirements
- Missing recipes for copy, links, media, HubSpot data, sync mappings, SEO, and status
- Canonical resolution, semantic hash, snapshot, and rollback examples
- Fixtures from campus structures represented in the current backlog

Exit criteria:

- Two different agents produce the same decision and evidence for the same sample tickets.
- Every ticket type marked executable links to a tested recipe.

### Phase 3: Integration and infrastructure runbooks

Deliver:

- HubSpot and n8n operator runbooks
- Cache and verification runbook
- WordPress, Elementor, Alpha MCP, plugin, endpoint, template, and identity inventories
- Forms and admissions runbook
- Ownership and escalation matrix

Exit criteria:

- A worked HubSpot-owned change can be followed from APEX to the canonical public URL.
- Operators can diagnose source, mapping, delivery, cache, and verification failures separately.

### Phase 4: Whole-site coverage

Deliver:

- Remaining campus lifecycle states
- Homepage, Locations, admissions, application, form, Alpha Answers, article, event, legal, campaign, global-template, and sandbox page-family models
- SEO and LLM publishing runbook
- Quality standards

Exit criteria:

- Every published or intentionally unpublished WordPress page belongs to a documented family or an explicit exception registry.
- Sitemap, noindex, redirect, Markdown, and LLM export behavior can be explained from the playbook.

### Phase 5: Validation and maintenance

Deliver:

- Single validation command
- CI for schemas, links, references, versions, and owners
- Observer-to-requirement coverage
- Review cadence and drift reports
- Onboarding evaluation for fresh agents

Exit criteria:

- A pull request cannot introduce broken references, missing required owners, invalid specs, or executable ticket classes without recipes.
- A scheduled review identifies stale inventories and integration changes.

## 11. Acceptance test

The audit remediation is accepted when a fresh agent, given only repository access and ten representative APEX tickets, can:

1. Find the correct operating entry point.
2. Identify the canonical URL and backing object.
3. Identify the authoritative source and delivery path.
4. Determine whether its actor supports the requested operation.
5. Identify the correct environment and safety controls.
6. Claim the ticket and lease or explain why it cannot.
7. Prepare and apply a supported change using the documented recipe.
8. Detect conflicts and recover or stop correctly.
9. Clear the correct caches without unnecessary repeated global purges.
10. Verify the canonical public result and produce complete evidence.
11. Route unsupported or missing-information work to the correct owner.
12. Avoid touching production when the ticket is not eligible.

The test set must include staff, copy, media, CTA, HubSpot-owned data, n8n delivery, forms, SEO, redirect, global template, and unsupported-structure scenarios.

## 12. Metrics

- Percentage of incoming website tickets that reach eligibility without clarification
- Percentage of eligible supported tickets completed without human intervention
- Clarification messages per completed ticket
- Wrong-object writes
- Source-of-truth violations
- Hash conflicts and duplicate mutations
- Verified failures and unverified closures
- Rollbacks and global regressions
- Median ticket cycle time by class
- Documentation lookup failures reported by fresh agents
- Specification, inventory, and integration drift detected by CI

Initial safety targets:

- Zero wrong-object writes
- Zero crossed-profile or duplicate staff mutations
- Zero completed tickets without canonical verification
- Zero automated fallback to unsupported browser or legacy write paths

## 13. Dependencies

- APEX ticket, lease, and evidence interfaces
- Alpha MCP documentation and production capability inventory
- WordPress production and staging metadata
- HubSpot Programs and form access
- n8n workflow inventory and execution logs
- WP Engine and Cloudflare cache access
- Named owners for Elementor, templates, maps, community routing, admissions, events, legal, and analytics
- Approved page exemplars and media standards

## 14. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Another system overwrites a direct WordPress edit | Require source-of-truth diagnosis and end-to-end verification |
| The playbook promises operations the scheduled agent cannot perform | Maintain and test the actor-capability matrix |
| Documentation becomes stale | Assign owners, review cadences, inventory timestamps, and CI drift checks |
| Elementor serialization creates false conflicts | Hash canonicalized parsed content and retain raw hashes for evidence |
| Global cache or CSS work affects unrelated pages | Batch carefully and run shared-surface verification |
| A fresh agent guesses when a rule is missing | Fail closed and route to a named owner |
| Concurrent operators modify the same page | Require APEX site leases and expected hashes |
| Production credentials spread across clients | Use named identities, environment separation, and documented credential custody |
| The scope expands into every sister brand | Keep version 1 limited to the Alpha public WordPress site |

## 15. Decisions required

1. May a human Alpha MCP operator write to production without an APEX-signed token?
2. Which operations are allowlisted for direct production execution after staging validation?
3. Who owns Elementor templates and plugin deployment?
4. Who owns the growth map, Operations sheet, Community app, admissions forms, clear packets, and legal pages?
5. Which system wins when campus lifecycle sources disagree?
6. Who approves page-family exemplars and media standards?
7. What review cadence applies to plugins, workflows, forms, redirects, and global scripts?
8. Where should the read-only playbook be published for agents that cannot clone the repository?

## 16. Completion definition

This strengthening project is complete when the acceptance test passes, all required page families and integrations have owners, every executable ticket class has a tested recipe, production write policy is resolved, and CI prevents the documentation and specifications from silently drifting apart.

Passing documentation review alone is not completion. A fresh-agent replay against representative tickets is required.
