# Environments and Identities

Last verified: September 17, 2026

This document identifies boundaries and controls. It intentionally contains no passwords, tokens, cookies, private keys, or secret-store values.

## Environments

| Environment | Public or origin address | Purpose | Mutation rule |
| --- | --- | --- | --- |
| Production | `https://alpha.school/` | Visitor-facing Alpha website | Only eligible, approved, supported operations with a valid APEX claim and lease unless an approved human-operator policy explicitly says otherwise |
| WP Engine staging | `https://alpha20245stg.wpenginepowered.com/` | Clone used for plugin, content, cache, collision, partial-save, and rollback testing | Supervised tests only; indexing and external side effects remain disabled; password protection is restored after validation |
| Local repository fixtures | Alpha MCP and playbook repositories | Contract, fixture, and documentation validation | No WordPress mutation |
| Vercel review deployments | Per-review URL | Stakeholder review of intentionally exported or rebuilt drafts | Not a WordPress source of truth and not public completion evidence |

The staging environment was cloned from the production WP Engine install on September 11, 2026. It is not assumed current indefinitely. Record its clone date before relying on it for structure or content tests.

## Identity classes

| Identity | Minimum purpose | Boundary |
| --- | --- | --- |
| Alpha MCP reader | Resolve pages, read summaries, find components, inspect fields, verify public pages | No content, media, status, or cache writes |
| Alpha MCP executor | Prepare and apply an allowlisted content operation | No cache operation unless separately granted |
| Alpha MCP cache operator | Regenerate or clear permitted cache layers | No page or media write |
| Scheduled APEX agent | Uses server-issued execution authorization for an eligible ticket and active lease | Only operations implemented and enabled in the APEX Alpha MCP path |
| Human website operator | Handles reviewed exceptions and urgent tickets | Must preserve named WordPress attribution and the APEX evidence trail |
| HubSpot operator | Changes permitted Program or event fields | Cannot change Program names at the top under the September 17 website-operator agreement |
| n8n operator | Inspects, runs, disables, or changes workflows | Workflow edits require the n8n owner, source mapping evidence, and separate approval |
| WordPress administrator | Plugins, users, templates, recovery | Admin capability is not blanket ticket authorization |

Matt, Yash, the scheduled agent, and any Marketing Ops execution host use separate identities. Production and staging identities and receipt-signing keys remain separate.

## Credential rules

- Store credentials only in the approved local keychain, GitHub environment secrets, WordPress configuration, or designated secret manager.
- Never place a secret in this repository, an APEX ticket, a screenshot, an MCP response, a Slack message, or a shell command committed to history.
- WordPress stores APEX public verification keys only. The APEX signing private key remains in the APEX server environment.
- The WordPress plugin does not receive a general APEX API token during a mutation.
- APEX asset downloads happen through the authorized worker or bridge, which verifies the source hash before upload.
- Rotate a credential after suspected disclosure and treat any in-flight execution that used it as unverified until reviewed.

## Production-write policy

The automated policy is settled: scheduled production mutations require an eligible APEX ticket, current ticket revision, active `web:alpha.school` or normalized page lease, supported Alpha MCP plan, exact authorization, WordPress capability, expected semantic hash, rollback artifact, and public verification plan.

The human operator-mode policy remains a decision. Alpha MCP version 0.3 introduced authenticated operator mode, which can synthesize claims without an APEX execution token while retaining WordPress capabilities, prepare/apply hash binding, snapshots, receipts, and optional ticket attribution. Earlier Alpha MCP requirements state that every write requires an APEX-signed token.

Until Matt and Yash approve one rule in `docs/decisions.md`:

- Human production writes should use an APEX ticket and lease.
- Operator mode may be used in staging.
- Operator mode should not be treated as authorization to bypass APEX in production.
- Emergency browser editing requires an explicit owner decision and the same-day APEX record described below.

## Production versus staging

Direct production execution may be considered only when all are true:

- The operation type has passed its staging matrix and production canary.
- The exact page structure is recognized.
- The change is field-scoped or component-scoped.
- The source, replacement, approval, canonical object, rollback, and verification are complete.
- No plugin, workflow, template, global script, new page, new component, or structure creation is involved.

Use staging first for:

- New or changed plugin versions
- New Alpha MCP abilities or APEX routing
- New Elementor structures
- Global templates, navigation, scripts, forms, and popups
- Workflow mapping or code changes
- New pages or cloned sections
- Redirect-system migrations
- Application, payment, consent, or analytics behavior
- Any operation without current production-canary evidence

## Emergency human work

An urgent request does not remove the controls. The minimum emergency procedure is:

1. Create or locate the APEX ticket.
2. Record the canonical URL, object, source, requested outcome, owner approval, and emergency reason.
3. Claim the ticket or confirm no active page lease.
4. Capture a complete Elementor snapshot or supported post-field backup.
5. Make the narrowest possible change using an approved path.
6. Recover CSS and caches.
7. Verify the canonical page on desktop and mobile.
8. Attach the evidence and release the lease.

If an emergency browser edit was unavoidable, record the WordPress revision author, time, before and after evidence, and reason the normal path could not be used. Browser editing is not an unattended-agent fallback.

## Environment verification before every write

Record:

- WordPress base URL and environment label
- Canonical public URL
- Resolved object ID and status
- Authenticated WordPress actor
- APEX ticket, execution, revision, and lease
- Alpha MCP and plugin version where available
- Current semantic and raw hashes
- Rollback reference

A staging receipt cannot complete a production ticket. A production receipt from an unregistered key or endpoint is invalid.
