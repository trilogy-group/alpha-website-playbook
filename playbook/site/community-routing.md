# Community routing

This page defines how alpha.school routes a parent from a campus surface to the Alpha Community app. It documents the current system. It does not authorize changes to WordPress, the growth map, HubSpot, or the Community app.

Machine form: `spec/community-routing.json`. Verified campus identity crosswalks: `registry/campus-identities.json`. Dated source snapshot: `spec/inventory/campus-community-routing-2026-09-16.json`.

## Scope

Version 1 applies only to the public Alpha School website and the current Alpha Community app at `www.community.alpha.school`. It does not cover Nova, NextGen Academy, Waypoint Academy, or other brands.

The Community app is a separate surface from WordPress and the public growth map. A request such as "add the community button" can therefore involve one or more distinct changes:

1. A WordPress campus-page CTA, owned by website operations.
2. A `communityUrl` or public destination on the HubSpot-backed growth map record, owned by the growth-map path.
3. A Community program record, slug, visibility setting, or router behavior, owned by the Community app path.

One ticket must not silently mutate all three. Classify the requested surface, name the owner, and verify each changed surface independently.

## Source boundaries

| Information | Authority | Rule |
| --- | --- | --- |
| Campus name, address, lifecycle, launch date, grades, admissions links, and other campus facts | HubSpot Programs, with the public growth map as its readable mirror | A Community value never overrides a HubSpot campus fact. |
| Community program ID, slug, visibility, and Community-specific routing behavior | Community program registry | Use only a verified crosswalk joined by HubSpot program ID. |
| WordPress page object and CTA placement | Alpha WordPress MCP and the website playbook | Resolve the canonical page before changing a page CTA. |
| Approval, lease, audit evidence, and ticket state | APEX | No change is approved merely because a mapping exists in this repository. |

Community counts, deposits, staff relationships, member counts, enrollment counts, and similar operational data are not approved public website facts. Do not copy them into WordPress, map content, structured data, or public copy without an explicit approved source decision.

## Current URL contract

The deployed Community app currently selects a campus with:

```text
https://www.community.alpha.school/?campus=<community-slug>
```

The current router also recognizes `invite` and `ref` as referral parameters. Preserve them when a supplied approved link includes them. They do not replace the required `campus` mapping.

`preferred_campus` is a legacy parameter and is absent from the current deployed bundle. Do not generate it for new links. The observer currently checks an older or misspelled parameter contract and does not fully enforce `campus=<slug>`; see "Known gaps" below.

## Identity resolution

Never derive a Community slug from a campus name. Resolve the campus in this order:

1. Read the HubSpot program ID from the HubSpot-backed map record.
2. Find the exact same HubSpot program ID in the Community program registry.
3. Require an active Community record with a recorded slug and `visible_in_community_app: true`.
4. Build the canonical URL from that recorded slug.
5. If the join is missing, ambiguous, invisible, or malformed, stop and route the ticket to the Community app owner. Do not guess.

Only Jacksonville and Short Hills have been verified and committed in the partial identity registry as of September 16, 2026. Other campuses must remain unresolved until their records are checked.

## Lifecycle behavior

The systems use different labels. For routing and comparison only, normalize them as follows:

| HubSpot or map label | Community label |
| --- | --- |
| Pre-Announcement | `pre-announcement` |
| Announced | `announcement` |
| Open | `opened` |

HubSpot remains authoritative when the lifecycle values disagree. Record the discrepancy and send it to the owning system instead of rewriting the other surface from an inferred value.

## Ticket routing

| Requested or observed change | Ticket path | Executor |
| --- | --- | --- |
| Add or repair a Community CTA on a published campus page | Website ticket, `link-cta` recipe | website agent operator, after the destination is verified |
| Add or repair the map record's `communityUrl` or public destination | `observer-map-community` | growth-map owner |
| Add a Community program, change its slug or visibility, or change app routing | Community app ticket | community-app-owner, currently unnamed |
| Campus fact or lifecycle is wrong | Program info or fact-sync path | HubSpot owner, then the existing sync owner as needed |
| Several surfaces are wrong | Separate linked tickets | Each owning surface; do not hide cross-system work in one website edit |

For a WordPress CTA ticket, the destination must be an approved link already on the ticket or an exact verified identity in `registry/campus-identities.json`. A WordPress operator may not create a Community identity as a side effect.

## Read-only refresh process

1. Export or read the public growth map records without changing them.
2. Read the deployed Community app's program registry without changing it.
3. Join records only on the exact HubSpot program ID.
4. Record verified mappings in `registry/campus-identities.json` and a dated inventory in `spec/inventory/`.
5. Run `node tests/validate-community-routing.mjs` offline.
6. Optionally run `node tests/validate-community-routing.mjs --live-map` to compare the committed identities with the public map. This remains read-only.
7. Submit the repository change for code-owner review.

Do not store Community publishable keys, application passwords, tokens, cookies, or authentication data in this repository.

## Known gaps

- The Community app owner is not named. The role `community-app-owner` must be assigned before app-side tickets can be executed.
- Twelve Pre-Announcement map records lacked both `url` and `communityUrl` on September 16, 2026. Jacksonville and Short Hills have verified Community mappings, but their map destinations still require an owned map-source change.
- The existing page-oriented lifecycle registry covers 44 pages and 45 map programs. It excludes every Pre-Announcement program and Alpha High, so it is not a complete campus identity registry.
- The production observer's Community parameter check is incomplete. The current deployed app uses `campus=<slug>`, while the observer implementation at the time of review still described the legacy `preferred_campus` contract and detected only a misspelling of it. Treat parameter coverage as advisory until that observer is updated and tested.
- This document does not decide whether every pre-announcement program should be visible in Community. That requires an owner decision in the source system.
