# October 7, 2026: duplicate Programs after the HubDB join

Scope: three inspected October 7 failures and the subsequent repair. This does not establish the cause of every historical failure since September 13. Times below are UTC with Pacific equivalents; counts are observations, not hardcoded future expectations.

## Diagnosis and repair

Shared workflow: [Read programs and their marketing events](https://trilogyinc.app.n8n.cloud/workflow/6HvmvgkzPkFikc40), inspected version `081ac70c-589d-4613-8739-4c09ad2ffdb4`.

- Failed executions `262615`, `262477` and `262432` each read 54 eligible Programs, all unique, on one page. The read already used HubSpot Search, limit 200 and `{{$response.body.paging?.next?.after}}` cursor pagination.
- Independent all-Program reads returned 113 unique IDs by object listing (100 + 13) and sorted search (50 + 50 + 13), with identical ID sets.
- HubDB table `119932418`, `FormProgramInterestToInterestAndCampusMapping`, expanded 54 Programs into 56 joined rows. Austin and South Bay each had two aliases with no primary, so both aliases survived the existing selector.

Matt approved only these changes; the alias rows were retained:

| Program ID | Mapping made primary | HubDB row | Retained alternate | Events preserved |
| --- | --- | --- | --- | --- |
| `26459919512` (Alpha Austin, interest `Alpha`) | `austin_k8` | `190765620866` | `austin`, row `223354853635`, flag 0 | 6, arrays unchanged |
| `49011192957` (Alpha South Bay LA) | `south_bay_la` | `190765620903` | `south_bay`, row `223350653021`, flag 0 | 5, arrays unchanged |

The two `is_primary` values changed from 0 to 1 at **14:36:44.814Z / 7:36 AM PT**. Draft and published tables matched before editing; backup, expected-diff comparison, concurrent-change check and published readback proved only those two fields changed. Workflow logic, Program identities and downstream schedules were unchanged; downstream publishers were not manually triggered.

Retry `262814` reused stale upstream outputs despite `loadWorkflow:true` and failed again. A fresh source-only invocation with cache invalidation produced [successful reader execution 262828](https://trilogyinc.app.n8n.cloud/workflow/6HvmvgkzPkFikc40/executions/262828), **14:40:59.065Z–14:42:02.443Z / completed 7:42 AM PT**. Fresh source nodes read the corrected flags; 54 Programs joined to 54 unique IDs, all other 52 mappings and both affected event arrays were preserved, and the corrected cache was written. Temporary verification helper `h3mqcqTGRJlSLxHp` was deactivated and archived.

## Separate downstream failure

[Rio SEO Locations execution 262856](https://trilogyinc.app.n8n.cloud/workflow/giviJTDi7Q3uM4HM/executions/262856) failed at **15:01:32.255Z / 8:01 AM PT** with “Data quality checks failed!” Its reader child `262858` succeeded using the corrected cache and returned 54 Programs. Rio selected 50 listings: 40 passed and were accepted for import; 10 failed Google service-description limits, with final lengths 301–330 against the 300-character limit.

Failed listings: Boca Raton, San Francisco, Austin High, Raleigh, Palo Alto, Dorado, Boston, The Woodlands, Scottsdale and Plano. The template combines intro copy, address and grade-specific info-session wording. Validation occurs after expansion. There is also a hardcoded New York “open and enrolling” branch that needs status review.

HTTP 200 confirmed import **started**, ID `20261007150131396`; final import completion was not verified. This is partial success, not evidence that all 50 failed or that the duplicate-ID repair failed. Template correction remains outstanding; do not disable the validator or replay the full batch without checking prior writes. As of 8:07 AM PT, this was the only observed failed workflow since the reader recovered, not a promise about future alert volume.

## Remaining work and evidence boundary

- Other ambiguous mapping groups (Alpha World, Alpha Western Massachusetts, Alpha Seattle) were outside the repaired eligible set and remain separate cleanup items requiring canonical-alias decisions.
- The consumer inventory covered 36 accessible workflows. Six active workflows had enabled reader calls; an email-queue call was disabled and two LLM checks were inactive. It is not a complete inventory of every integration at Alpha.
- Each publisher needs its own scheduled-run and destination evidence. The successful reader run did not prove school pages, Locations, KB or Rio publishing completed.
- Current n8n ownership must be confirmed. Sources: Matt's supplied October 5 Cristi statement (“no longer part of Alpha School website / n8n automations”) and Matt's direct statement that Dmitry no longer works for Alpha. Cristi's later access confirmation does not assign a replacement owner. Preserve historical authorship without routing work to former owners.

Sanitized investigation records are in the `marketingsupport` workspace under `work-assets/apex-website-tickets/program-reader-2026-10-07/`: `diagnosis-and-proposed-fix.json`, `pagination-check.json`, `impact-check.json`, `apply-receipts.jsonl`, `after-execution-check.json`, `after-mapping-and-events-check.json` and `rio-8am-followup.json`. Task records: `website-update-qc-2026-10-07-program-reader-duplicate-ids` (source repair verified) and `website-update-qc-2026-10-07-rio-service-description-length` (open follow-up). Full exports and credentials remain outside this repository.

Prevention contract: [program-data-reliability.json](../spec/program-data-reliability.json). Recovery procedure: [shared Program data runbook](../playbook/integrations/program-data-reliability.md).

## Documentation acceptance: read-only replay

On October 7, the new runbook and contract were checked against the two task records and saved before/after evidence above without invoking any live publisher. The replay placed the first duplicate at the mapping join, accepted the fresh reader/event-preservation evidence, and classified the 8:01 Rio alert as a separate validation failure with an accepted partial import. It did not treat the retry or the import-start receipt as completion evidence.

The rebuilt policy was also exercised through `resolveDecisionOwner`: a `n8n-sync-owner` request retains that technical role, returns `owner-unresolved` with `unregistered-role-owner`, and invokes protocol 1d for owner resolution. The observer-filer regression asserts the resulting ticket is `BLOCKED` while preserving the technical role. No replacement n8n owner was inferred. The check bundle's observer rows are unchanged; its hash changes because it references the corrected policy. Proposed mapping preflight, pagination regression and alert grouping remain implementation work.
