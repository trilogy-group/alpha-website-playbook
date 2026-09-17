# Maintenance and Governance

Last updated: September 17, 2026

## Rule changes

Every new or changed requirement must include:

- Stable requirement ID
- Human-readable rule
- Machine-readable row when applicable
- Source and decision date
- Owner
- Applicability
- Check or verification method
- Ticket recipe when executable
- Migration or rollback impact when behavior changes

Changes use pull requests. A lower-authority source cannot silently override a named decision or authoritative system.

## Review cadence

| Cadence | Review |
| --- | --- |
| Every merge | JSON, recipe links, prose references, versions, owners, duplicate IDs and tests |
| Daily or scheduled run | Provider health, public routes, event freshness, critical discovery files and active ticket eligibility |
| Weekly | Failed and unverified tickets, stale executions, cache incidents, current pilot flags and live defect deduplication |
| Monthly | Campus role snapshot, page and staff inventory, forms, redirects, navigation, media, owner registry and scheduled-agent capability matrix |
| Quarterly | Plugins, WordPress and PHP, Elementor, n8n exports, HubSpot schemas, global scripts, analytics, consent, legal pages, browser policy and performance baselines |
| After an incident | Failed rule, recipe, fixture, owner, runbook, observer check and re-enable evidence |
| Before a campus lifecycle transition | Program facts, page requirements, CTAs, staff, media, maps, forms, SEO, schema and launch evidence |

## Freshness rules

- Campus-role fallback snapshots are stale after seven days.
- Every registry row carries an `asOf` or `lastVerified` date.
- A workflow mapping is stale when its active export hash or version differs from the inventory.
- A staging fixture is stale when production structure or relevant plugin versions changed.
- An actor capability is stale when APEX routing, feature flags, tool contracts or canary evidence changed.
- An owner row is stale after an announced role change or its scheduled review date.

Stale does not mean wrong. It means the row cannot authorize unattended work until refreshed.

## Capability promotion

An operation moves from implemented to allowed only with:

1. Implementation reference
2. Actor integration
3. Staging success and failure cases
4. Production canary where applicable
5. Ticket class and recipe
6. Owner and rollback
7. Public and visual verification
8. Updated capability registry

Removing or disabling a capability follows the same pull-request and evidence path. In-flight APEX checkpoints are resolved before the path is retired.

## Inventory ownership

The owner of a system owns the accuracy of its inventory. Website operations owns the repository mechanics and follows up on stale rows. An unnamed owner is recorded in `registry/owners.json` and causes related mutations to fail closed.

## Audit and drift records

Store dated findings in `docs/findings-YYYY-MM-DD-<topic>.md`. Store reproducible machine inventories in `spec/inventory/` or `registry/` with their collection date and source. Do not overwrite historical evidence when the new result explains a change over time.

## Validation

Run:

```bash
npm test
npm run validate
```

CI runs the test command on pull requests and `main`. Known owner and inventory gaps are warnings. Broken JSON, missing recipes, invalid source rows, invalid actor states, missing page-family files, stale entry markers, and protocol-version mismatches are errors.

## Documentation acceptance

A new runbook is not complete because its headings exist. It must be usable by a fresh agent in a representative dry run. Record the ticket, decisions, files consulted, route selected, stop or execution result, evidence shape, and any ambiguity found.
