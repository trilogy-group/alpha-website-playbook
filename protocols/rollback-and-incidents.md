# Rollback, Collision, and Incident Procedure

Version 1.0, September 17, 2026.

## Evidence required before a write

Elementor mutations require a complete pre-change Elementor document snapshot with:

- Snapshot reference
- Raw SHA-256
- Semantic SHA-256
- Object ID
- Canonical URL
- WordPress environment
- Ticket, revision, execution, lease, and actor

Post-field mutations require the exact pre-change post-field snapshot and hash. WordPress revisions may supplement evidence but do not replace the Elementor snapshot.

Store large artifacts through the APEX artifact path. Ticket text should contain references and hashes, not the complete Elementor document.

## When rollback is mandatory

Begin rollback when:

- The applied readback differs from the approved proposed hash.
- The write changed an unticketed field or sibling component.
- The ticketed result cannot pass public verification and the changed state is harmful.
- Ring 2 reveals a page regression caused by the change.
- Ring 3 reveals a shared template, CSS, or global regression caused by the operation.
- A partial save occurred and automatic restoration did not produce the original hashes.
- A source or authorization error is discovered after apply.

Do not automatically roll back a correct, verified change solely because a different ticket in the cache batch failed.

## Exact Elementor restoration

Use Alpha MCP `restore_elementor_snapshot` with the same page, canonical URL, snapshot reference, raw hash, and snapshot data authorized for recovery. Then:

1. Read back the restored document.
2. Confirm both raw and semantic hashes match the captured starting state.
3. Regenerate page-scoped Elementor CSS.
4. Clear the required origin cache within cooldown policy.
5. Purge the canonical edge URL when the approved provider path exists.
6. Verify the original public postcondition.
7. Store restore and verification receipts in APEX.
8. Mark the execution restored and route it to owner review. Do not silently start a new mutation.

If restoration cannot be verified, stop as `manual_recovery_required` and notify website operations and the Elementor owner.

## Post-field restoration

Use `restore_post_fields_snapshot` with the saved exact snapshot and authorization. Confirm the restored title, excerpt, content, SEO fields, status when applicable, and hash. Verify the canonical public page after cache recovery.

## Collision handling

### Lease conflict before prepare

Do not write. Record the conflict, holder or expiration when available, and retry only after a new successful claim.

### Hash conflict during prepare or apply

Do not force the stale preparation. Re-read the page and compare the changed fields:

- If another actor already produced the exact approved result, verify it and record `verified_already_satisfied` without applying.
- If unrelated content changed, prepare again from the new semantic hash and obtain a new approval.
- If ticketed content changed differently, stop for owner review.
- If the source system or automation changed it, re-run source diagnosis before any new preparation.

### Lease lost after apply

Stop new writes and cache operations. Preserve the receipt and checkpoint. A new owner must reconcile the applied state against the exact receipt, request revision, and public page. Recovery may verify the existing apply or authorize exact rollback only.

### Changed request after prepare

The old approval is invalid. Preserve the prior preparation for audit, retire it according to APEX recovery rules, and create a new preparation from the current request.

## Partial save

A partial save is any response or readback where WordPress may have changed but the complete intended document or fields were not proven. Treat timeouts after sending a mutation as unknown, not failed.

1. Do not retry the apply immediately.
2. Read WordPress and query APEX for a provider receipt.
3. If an exact valid applied receipt and matching readback exist, continue to cache and verification.
4. If the original hash still exists, mark the apply not observed and decide whether the same idempotency key may resume.
5. If neither expected state exists, authorize exact snapshot restoration.
6. After the bounded recovery budget, route to owner review.

## Public verification outcomes

| Result | Meaning | Next action |
| --- | --- | --- |
| `verified_pass` | Exact canonical postcondition and required evidence passed | Complete the ticket after final request recheck |
| `verified_failure` | Canonical result is reachable and wrong | Correct within the same valid execution or roll back |
| `unverified` | Network, edge cache, authentication, or evidence cannot establish truth | Keep open, retry within bounds, then route |

Never convert `unverified` to pass because WordPress stored the expected value.

## Incident triggers

Treat the event as an incident when any of these occurs:

- Wrong production object or environment was modified.
- Unticketed pages changed.
- Shared header, footer, navigation, CSS, forms, application routing, analytics, or consent regressed.
- A credential or private key may have been exposed.
- Repeated cache clears or worker retries degrade the public site.
- Several tickets show the same source, workflow, plugin, or rendering failure.
- Restoration cannot be verified.
- An unattended actor used an unsupported browser or legacy write path.

## Containment

1. Disable new scheduled mutations and cache clears while preserving read-only verification.
2. Preserve APEX checkpoints, receipts, snapshots, workflow run IDs, and logs.
3. Release no contested lease until the applied state is understood.
4. Restore the smallest known-good scope.
5. Verify the affected page, two untouched pages, and any global surface involved.
6. Rotate credentials or keys when exposure is possible.
7. Notify website operations and the owner of the failed layer.
8. Keep affected tickets open or in owner review.

## Incident record

Record:

- Start and detection time
- Actor, environment, ticket, execution, lease, object, and canonical URL
- Intended operation
- Actual public effect
- Source, mapping, delivery, storage, presentation, cache, and verification evidence
- Containment and rollback actions
- Pages and systems checked
- Current status and owner
- Follow-up requirement, recipe, fixture, or automated check

After resolution, update the playbook or spec before re-enabling the failed class if the incident exposed a missing rule.

## Past incidents

- **2026-01-12, DNS outage (about 02:39 to 08:06 CST).** alpha.school DNS stopped pointing at WP Engine. The website team does not control DNS, so a ticket went to support.alpha.school; DNS requests now go to the Central SaaS team through their Kayako portal (`playbook/foundation/origin-and-ownership.md`, Q-17). An expired certificate was suspected but not confirmed, and the site was reported resolved the same morning. The root cause was never documented. Sources: Slack [C099GQ9F15X/1768207849.594549](https://go-alpha.slack.com/archives/C099GQ9F15X/p1768207849594549), [C099GQ9F15X/1768213303.703969](https://go-alpha.slack.com/archives/C099GQ9F15X/p1768213303703969), [C099GQ9F15X/1768226761.776499](https://go-alpha.slack.com/archives/C099GQ9F15X/p1768226761776499).
