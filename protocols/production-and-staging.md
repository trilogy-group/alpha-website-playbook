# Production and Staging Procedure

Version 1.0, September 17, 2026. Applies to every `alpha.school` mutation, including human work.

## Purpose

Choose the environment from the operation's risk and evidence, not from urgency. Staging is for proving a new path. Production is for repeating an already tested, bounded path against an eligible ticket.

Environment and identity inventory: `docs/environments-and-identities.md` and `registry/environments.json`.

## Decision table

| Work | Environment |
| --- | --- |
| Read-only canonical resolution, source comparison, or public verification | Production is allowed |
| Previously canaried field or staff operation on a recognized component, with complete ticket and rollback | Production may be allowed |
| New plugin or Alpha MCP version | Staging first |
| New APEX-to-Alpha-MCP operation route | Staging first |
| Unknown Elementor structure or new component type | Staging first, then owner review |
| Create or clone a carousel, row, section, page, or template | Staging project work; not a routine Alpha MCP ticket |
| Header, footer, navigation, global template, global script, popup, form, analytics, consent, or redirect-system change | Staging first |
| n8n mapping or workflow logic change | Workflow test plus staging delivery verification |
| Application, payment, or lead-routing behavior | Staging or approved test system first |
| Emergency correction using a path without current canary evidence | Owner decision required; prefer staging or supervised human recovery |

## Production preflight

All checks must pass:

1. The APEX ticket satisfies `spec/ticket-contract.json`.
2. The ticket class points to an existing recipe.
3. The source authority is known and contains the approved value.
4. The current actor is Allowed for this operation in `spec/actor-capabilities.json`.
5. The operation has current staging and production-canary evidence.
6. `resolve_page` with `mutationIntent: live` returns the expected canonical URL, published object ID, and environment.
7. No competing draft or obsolete object is being used as the mutation target.
8. The APEX claim, ticket revision, execution, and site or page lease are current.
9. The present semantic hash matches preparation.
10. A complete Elementor snapshot or supported post-field restore artifact is stored in APEX.
11. The exact proposed hash is approved or qualifies under a documented auto-authorization rule.
12. CSS, cache, public verification, desktop, and mobile checks are defined.

Any failure stops the write.

## Claim and lease

APEX is authoritative. Supported logical endpoints are:

| Action | Endpoint |
| --- | --- |
| Claim | `POST /api/agent/tasks/{id}/claim` |
| Read or write checkpoint | `GET` or `POST /api/agent/tasks/{id}/execution` |
| Heartbeat | `POST /api/agent/tasks/{id}/execution` with `operation=heartbeat` |
| Release | `POST /api/agent/tasks/{id}/release` |
| Evidence | `POST /api/agent/tasks/{id}/evidence` |
| Guarded cache request | `POST /api/agent/tasks/{id}/refresh-cache` |

The helper in the Alpha MCP repository must be pointed at the actual claim route:

```bash
APEX_CLAIM_ENDPOINT_TEMPLATE='/api/agent/tasks/{ticketId}/claim' \
node <alpha-mcp-repo>/bin/alpha-mcp-apex-claim.mjs <ticket-id>
```

The helper reads `APEX_API_BASE` and `APEX_API_TOKEN` from the host environment. Never paste their values into the ticket or repository.

Expected claim outcomes:

- Success: record execution ID, revision, lease ID, expiration, current checkpoint, and allowed next action.
- `409 lease_conflict`: do not retry a write. Record the current holder or expiration and wait or route.
- Changed revision: reclassify and prepare from the new request.
- Existing resumable checkpoint: resume the exact operation.
- Existing non-resumable or exhausted checkpoint: route to website owner review.

Renew before expiration while work is active. If renewal reports `lease_lost`, stop immediately and perform no cache or mutation action. Re-read the public page and saved execution before deciding whether recovery is needed.

## Staging preflight

Before a mutation test:

1. Record the production clone date and the fixtures required by the ticket class.
2. Confirm indexing, outbound email, forms, webhooks, analytics, HubSpot writes, event writes, and other external side effects are disabled or isolated.
3. Confirm password protection and how it will be restored.
4. Prove one complete environment backup and restore path.
5. Record WordPress, PHP, Elementor, Elementor Pro, active theme, cache, Abilities API, MCP adapter, Alpha MCP, and relevant security-plugin versions.
6. Use staging-only identities and receipt keys.
7. Capture before hashes and snapshots.
8. Test success, stale hash, wrong object, expired authorization, idempotent replay, partial save, rollback, CSS recovery, cache recovery, and public verification states.
9. Restore content and staging protection after the test.

Staging success proves behavior only for the recorded versions and structures. It does not itself authorize production.

## Canary

A production canary package contains:

- APEX ticket and exact revision
- Canonical URL and resolved object ID
- Current raw and semantic hashes
- Prepared diff and proposed semantic hash
- Snapshot and restore hash
- Actor, plugin version, endpoint, and receipt key
- CSS, WP Engine, Cloudflare, and verification plan
- Desktop and mobile checks
- Abort criteria and rollback operator

The canary must be a low-risk, narrowly scoped operation. Complete one canary and its observation window before enabling the operation for a broader scheduled scope.

## Draft-only work

An unpublished preview is not the production target. Draft work requires:

- An APEX ticket that explicitly says draft-only
- `resolve_page` with `mutationIntent: draft_only`
- The exact draft object ID
- A review URL appropriate to the reviewer
- No claim that the public page was updated

A Vercel review copy may help a stakeholder review content, but it is not the authoritative WordPress draft and cannot complete a WordPress publishing ticket.

## Batch policy

- One execution mutates one WordPress object.
- Up to ten separately approved and evidenced tickets may share a cache batch.
- Never share an Elementor document write between unrelated tickets.
- Keep verified siblings complete when one item fails.
- Roll back a successful sibling only when a shared document write affected it or its public postcondition no longer holds.
- Respect the Alpha MCP five-minute whole-site WP Engine cooldown and two-flush scheduled-run limit.

## Production completion

Production completion requires:

- Applied receipt matches the approved preparation
- Readback matches the approved semantic hash
- Required CSS and cache actions completed or were documented as unnecessary
- Query-free canonical URL returns the expected object and content
- Exact present, absent, media, and link checks pass
- Desktop and mobile review passes
- Ring 3 passes after any global or site-wide action
- APEX evidence is complete
- Lease is released

`unverified` remains open. Staging evidence cannot substitute for production public evidence.
