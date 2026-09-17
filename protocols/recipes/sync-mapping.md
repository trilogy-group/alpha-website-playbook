# Recipe: Synchronization Mapping and Delivery

Classes: `sync-mapping` and `sync-delivery`.

## Mapping failure

Use `sync-mapping` when the source is correct, the current delivery rule ran as designed, and the derived page value is still wrong.

Required evidence:

- Workflow ID and active version
- Source object, field, value and read time
- Current transformation
- Expected transformation and its requirement
- Destination object, CSS ID or post field
- Affected campuses or pages
- Named n8n owner and approver

Procedure:

1. Export and hash the active workflow.
2. Reproduce the mapping on a fixture or test workflow.
3. Confirm the proposed rule for every known source variant.
4. Test in staging against representative backlog structures.
5. Preserve unrelated mappings and all expected CSS IDs.
6. Approve and deploy through the n8n owner.
7. Run one named canary Program.
8. Verify source, node outputs, WordPress object, canonical page and next scheduled run.
9. Update `spec/content-pipelines.json`, the field map, workflow export reference and observer rules.

Do not patch all affected WordPress pages as a substitute for fixing the mapping.

## Delivery failure

Use `sync-delivery` when the source and transformation are correct but the expected WordPress or public state is stale after the documented run window.

Procedure:

1. Confirm the workflow was active and received the exact source object.
2. Inspect filtering, allowlist, destination ID, authentication, rate limits and WordPress response.
3. Read the WordPress target before retrying.
4. If no write occurred, the owner may replay the bounded target.
5. If a partial or unknown write may have occurred, reconcile before replay.
6. Recover CSS and caches only after stored WordPress state is correct.
7. Verify the canonical result and next normal run.

## Stop conditions

- Active workflow export is unavailable.
- The affected object set is unknown.
- Source variants have not been tested.
- The target CSS ID is absent or duplicated.
- A replay could overwrite newer human or source work.
- The n8n owner is not available to approve workflow changes.

## Rollback and incident handling

Deactivate a repeatedly harmful workflow through its owner, preserve the active export and run IDs, reconcile affected pages, restore a known-good version, and canary before reactivation. Follow `protocols/rollback-and-incidents.md`.
