# Recipe: HubSpot-Owned Website Data

Classes: `hubspot-data` and `sheet-data` after source diagnosis.

## Inputs

- Canonical page or public surface
- Exact HubSpot Program or event object ID
- Source field
- Current source value and read time
- Approved expected value and owner
- Derivation and delivery workflow
- Downstream surfaces
- Done condition

## Rule

Change the authoritative source. Do not patch an n8n-controlled Elementor target as the durable fix.

Program identity and existence are not website-driven Program fields. A new or split Program requires an approved Organization because the Program maps one-to-one into SIS, TimeBack, and downstream systems. A website or event ticket cannot authorize that creation.

## Program-field procedure

1. Confirm the field and object through `spec/source-authority.json` and `spec/campus-page-field-map.json`.
2. Confirm the exact Program already exists and belongs to the approved Organization. If the request needs a new or separate Program, stop and route it to `hubspot-program-admin`, with `expansion-new-programs` approving the new Organization.
3. Confirm the requester or named owner can supply or approve the new value.
4. Use the APEX campus Program editor when it supports the field, or an authorized person in HubSpot.
5. Do not change Program names at the top through the website-operator path.
6. Read HubSpot back and record object, field, value and time.
7. Verify APEX readback when applicable.
8. Wait for the normal n8n run or request a manual run from the n8n owner.
9. Record workflow ID, run ID, version, target object and node evidence.
10. Verify WordPress storage, canonical page, related Locations or map surface, schema and metadata as applicable.
11. Confirm the next normal synchronization preserves the result.

## Sheet-owned procedure

When the field map names an Operations or onboarding sheet:

1. Read the exact tab, row, key and value.
2. Confirm the sheet is authoritative for this field and HubSpot does not override it.
3. Have the named sheet owner make or approve the change.
4. Observe the delivery workflow and verify every downstream surface.

The Operations-sheet owner remains an inventory gap. Unattended sheet changes fail closed.

## Failure routing

- Wrong source value: source owner
- Correct source, wrong transformation: `sync-mapping`
- Correct source and transformation, stale WordPress: `sync-delivery`
- Correct WordPress, stale public page: cache or presentation owner

## Verification

A source save or green workflow run is not completion. Require canonical public verification and next-run survival for automation-written elements.

## Rollback

Do not restore an old Elementor snapshot over a correct newer source value. Source rollback requires the source owner and downstream replay. Use WordPress snapshot recovery only for an unintended WordPress write caused by the execution.
