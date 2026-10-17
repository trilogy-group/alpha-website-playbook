# Shared Program data: diagnosis, prevention and recovery

Evidence date: October 7, 2026. Contract: [program-data-reliability.json](../../spec/program-data-reliability.json). System IDs and verified dependencies: [sources.json](../../registry/sources.json), `n8n.sharedProgramReader`. [Incident evidence](../../docs/findings-2026-10-07-program-reader-duplicates.md).

Use this when “There is at least one duplicate Program ID” or a downstream data-quality alert blocks campus publishing. These are operating checks, not a newly installed monitor. The existing production duplicate check and Rio length gates remain in place. Proposed automated prevention is listed separately in the contract.

## 1. Locate the first bad stage

Record the root workflow, child reader execution, workflow version, failing node, exact error and UTC timestamp. Inspect an actual failed execution before accepting a diagnosis from an email or a record-count milestone.

| Stage | Check | Meaning of a failure |
| --- | --- | --- |
| HubSpot read | Query scope, each page/cursor, IDs, total and unique count | Read coverage or pagination defect, if reproduced here |
| HubDB mapping selection | Rows per `hubspot_program_interest`, primary flags and aliases | Ambiguous or missing mapping |
| Joined output | Counts and exact ID sets before/after; one row per eligible Program | Mapping/join defect even when HubSpot objects are unique |
| Consumer transform | Final expanded fields and consumer-specific validators | Downstream validation issue |
| Write and public output | Receipts, readback, import completion, cache and canonical URL | Delivery or presentation issue |

Follow the returned pagination cursor until exhausted. A pagination test must span multiple pages and compare ID sets against an independent read of the same scope. Record each cursor and page; repeated cursors, overlaps, or missing IDs fail. A unique sort may make a search test reproducible; it cannot fix a duplicate introduced by a later join. Account for source changes during comparisons.

Do not remove the shared reader's intentional visibility, lifecycle or online filters to make the production count equal all Programs in HubSpot. The October 7 totals (113 source objects, 54 eligible Programs) are dated observations, not future expected constants.

## 2. Require one canonical mapping when aliases exist

HubDB table `119932418` joins `hubspot_program_interest` to `program.properties.program_interest`. The observed reader keeps all rows when a group's primary sum is zero; otherwise it keeps `is_primary=1` rows. Two unmarked aliases can therefore duplicate one Program after a perfectly valid read.

Before adding an alias, publishing a mapping edit, or making a previously excluded Program eligible:

- Check every alias group in the proposed table. Multiple aliases require exactly one approved primary; a single mapping may remain unmarked under current logic.
- Resolve the canonical alias from approved routing and event associations. Record Program ID, group key, row IDs, chosen alias and approval. Austin's choice is not a default for another campus.
- Retain alternate aliases. Do not delete them, deduplicate by keeping the first row, or alter applicant records or Program identity.
- Replay the selection and join: every eligible input ID must survive exactly once. Compare selected mappings and complete event associations, including unaffected Programs, against the intended diff.

An ambiguous group outside today's eligible set is a separate cleanup finding, not proof that the whole table is healthy. A data correction routes to the authorized HubSpot source owner; changing selection logic routes to the n8n owner. Access alone does not establish ownership or approval.

## 3. Publish the smallest approved source change

Follow the existing ticket, actor and approval rules in [hubspot-and-n8n.md](hubspot-and-n8n.md); this procedure grants no additional write authority.

1. Save a private before snapshot of published and draft data. Compare them: publishing a HubDB table can also publish other people's draft edits.
2. Review the exact row/field diff and a field-level rollback plan. If unrelated drafts or concurrent edits exist, coordinate rather than publishing them incidentally.
3. Apply only the approved draft fields. Compare the whole proposed table with the expected result and recheck the published source immediately before publication.
4. Publish, read back and record the exact diff and timestamp. A rollback restores only the changed fields after checking for newer work; never replace the entire table with an old export blindly.

Keep credentials and full exports in approved private storage. Ticket and playbook evidence uses sanitized IDs, counts, timestamps and execution links.

## 4. Prove a fresh read, then check consumers

Use a supported fresh reader invocation with cache invalidation under the existing execution approval. Do not manually run a downstream publisher simply to test the reader. Restoring the reader can let existing scheduled writers resume; review the dependency inventory first and leave schedules unchanged unless explicitly authorized.

An n8n retry with `loadWorkflow: true` can reuse old upstream outputs and rerun only the failed node. A new execution ID is not evidence of fresh data. Verify source-node timestamps are at or after the new execution start, corrected source values were actually read, all input IDs survive once, event associations are preserved, and the corrected cache was written. Cache invalidation is insufficient if the retry never executes the reader.

If an approved temporary test helper is necessary, bound it to the reader and clean up its activation/schedule afterwards. Record cleanup; do not leave an unattended test workflow behind.

Report separately:

- **Source repaired:** exact published source diff verified.
- **Reader recovered:** fresh source run and existing duplicate guard pass.
- **Consumer recovered:** each affected scheduled job passes its own validation and destination verification. A reader-only ticket can close on its own evidence; linked publishing tickets stay open until their next normal run and required public checks pass.

For any failed writer, inspect completed nodes and write receipts before retrying. Rio can accept valid rows while rejecting others; HTTP 200 stating “import started” does not confirm completion. Avoid blindly resubmitting rows already accepted.

## 5. Validate final copy and interpret alerts correctly

Rio checks the final expanded descriptions, not just the reusable template. After grade/address/campus substitutions and normalization, check all selected listings against the limits in `rendered-rio-description-limits` in the contract. Keep the validators. Shorten copy with the required approval and preserve proposed, enrolling or waitlist meaning; never silently cut away the qualifier to fit a limit. Review hardcoded campus exceptions too.

One new alert does not prove the original defect returned. Link it to its execution, reader result and failed node. Group repeated failures of the same cause in the incident record; track a new cause separately. State the observation window when describing error volume. Do not promise all alerts stopped because one reader run passed, suppress validators, or disable error reporting to quiet the inbox.

## Ownership and follow-up

Resolve current roles through `registry/people.json` and `registry/owners.json`. Cristi's historical authorship does not establish current n8n ownership; his October 5 statement disclaims it, and Matt reports Dmitry is no longer at Alpha. The replacement n8n owner is unconfirmed. Apply protocol 1d to resolve that gap without assigning technical ownership to Matt/Yash by default. Existing explicit task approvals remain scoped to their approved action.

To automate prevention, implement and review the contract's prepublication mapping check, multi-page regression and alert grouping. This documentation does not deploy those safeguards, fix the outstanding Rio template, or guarantee that all scheduled consumers have recovered. The campus listing monitor in `docs/campus-listing-sop.md` is a separate read-only check of HubSpot Programs. It does not implement the follow-up automation in this contract and it does not change n8n.
