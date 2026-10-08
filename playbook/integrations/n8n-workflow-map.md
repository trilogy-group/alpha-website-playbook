# n8n workflow map

Observed October 7, 2026 from read-only API exports on [trilogyinc.app.n8n.cloud](https://trilogyinc.app.n8n.cloud). Machine-readable evidence: [workflow inventory](../../registry/n8n-workflows.json). Seventeen selected workflows and dependencies were inspected out of 37 visible to the credential; this is not a complete Alpha automation inventory. No workflow was executed or changed for this documentation update.

## Site and ownership boundaries

The campus and Locations writers below target **alpha.school**. Cristi's [creation guide](https://docs.google.com/document/d/1sVsLqyF0os_zOUjdAy8OcOULyASQttwAj5cBlX7uRY4/edit), modified July 1, also targets that site. Neither establishes an `alphahigh.school` publishing workflow. Alpha High Program `26445615147` does participate in shared Program/Rio data, including the October 7 Rio description-length failure. Trace its website writer separately before editing Alpha High.

The interactive map at `map.app.alpha.school` is another delivery system (`trilogy-group/educrm-city-communities`); changing Locations cards does not deploy the map. Public WordPress events use the events plugin, not the Rio events flow. See [content pipelines](../site/content-pipelines.md).

Current `n8n-sync-owner` remains unconfirmed. Cristi's access confirmation and historical authorship are not a new ownership assignment. Use protocol 1d to resolve the owner; API read access does not authorize workflow edits, credential changes or manual production runs.

## Source to destination

| Workflow | Reads | Writes / effect |
| --- | --- | --- |
| [Shared Programs/events reader](https://trilogyinc.app.n8n.cloud/workflow/6HvmvgkzPkFikc40) | HubSpot Programs, Marketing Events, Program properties and HubDB alias table `119932418` | Aggregated Programs/events and a four-hour n8n data-table cache; no direct website writes |
| [Update school pages](https://trilogyinc.app.n8n.cloud/workflow/ORgdHC71YJ5RawBy) | Shared reader; onboarding workbook **Website Copy Fixed**; existing Elementor pages | Clones template `6140` when Post ID is `-1`; writes new Post ID to HubSpot; updates campus Elementor, page titles, SEO, Open Graph, X and JSON-LD |
| [Update Locations](https://trilogyinc.app.n8n.cloud/workflow/RqP1lPvDKvHDxTus) | Shared reader; card template, order and images held in workflow | `alpha.school` page `6703`, cards container `86afe30`; includes inquiry-only Lexington handling |
| [Rio Locations Data Push](https://trilogyinc.app.n8n.cloud/workflow/giviJTDi7Q3uM4HM) | Shared reader and [Prepare Photo Set](https://trilogyinc.app.n8n.cloud/workflow/6Lf8sZVWLAivmJ1l23udy) | Rio listing import; final text validation can fail after valid rows were submitted |
| [Rio create/update events](https://trilogyinc.app.n8n.cloud/workflow/tq6IV3TeqlBaoWlg_dLkj) | Shared Programs/events data | Rio/Google Business Profile event publishing; separate from WordPress event import |
| [Email – Update KB Campus Info](https://trilogyinc.app.n8n.cloud/workflow/soVfr5lKTr5spDr3) | Shared reader plus HubSpot academic sessions, deals, contacts and associations | GitHub repository dispatch to `trilogy-group/educrm-livekit-founder-agent`; run success does not prove downstream KB deployment |
| [Update Voiceflow chatbot KB](https://trilogyinc.app.n8n.cloud/workflow/gsQBTQQICNDCkJB7) | Google Docs for CTA instructions and FAQ | Voiceflow knowledge-base document uploads; no direct shared-reader call in this export |
| [Redirect URL for past marketing events V2](https://trilogyinc.app.n8n.cloud/workflow/b65cZotoEHvoWlNw) | HubSpot Marketing Events and existing CMS redirects | Creates redirects for eligible past events; can delete matching redirects for future events. Legacy `PvvXhs6AYYDmA03T` is inactive |
| [APEX staff source — read-only](https://trilogyinc.app.n8n.cloud/workflow/c8Iz4SLpMlswe0RQ) | Authenticated named-staff lookup against People Bio | Webhook response; not a staff-page writer |
| [APEX Drive portrait metadata — read-only](https://trilogyinc.app.n8n.cloud/workflow/v6kUqPRA5QaNs8ur) | Exact supplied Drive file metadata | **Inactive**; its presence is not evidence of an available portrait service |
| [Error workflow](https://trilogyinc.app.n8n.cloud/workflow/mFdpWfLlufcylSjE) | Failed execution data | Gmail notification; configured on the main reader/publishers above |
| [Email error workflow](https://trilogyinc.app.n8n.cloud/workflow/MCqoBXpnbYzbMbYa) | Failed execution and email ID where available | Airtable error log and Gmail notification; distinct from the general website error handler |

The reader also has a non-website Reddit consumer. Consult `registry/sources.json → n8n.sharedProgramReader.dependencyInventory` before changing its output contract. That earlier incident inventory covered 36 visible workflows; the later access snapshot counted 37. Neither count is a business-data invariant.

## Schedule and version evidence

Inventory entries retain raw schedule rules, saved `versionId`, `activeVersionId`, export hash and observation time. When available, **active-version nodes** are the basis for behavior, not just the saved editor definition. Workflow-level settings come from the API workflow record; instance defaults were not verified here.

- Campus pages: schedule rule has `triggerAtMinute: 15`; no workflow timezone. Previously documented as daily 00:15 Central. Confirm the inherited instance timezone and next execution in n8n before promising a wall-clock ETA.
- Locations: `triggerAtMinute: 2`; no workflow timezone. This refines the old “midnight Central” shorthand, but does not independently prove the timezone.
- Rio Locations: `triggerAtHour: 10`; Rio events: hour `2`, minute `25`; KB Campus Info: hour `5`. Each inherits timezone in the inspected record.
- Voiceflow: **active schedule every six hours**, while the saved schedule says 02:15. The workflow record sets `America/Chicago`. Do not activate the saved version as part of documentation or diagnosis.
- Redirect V2: saved and active version IDs differ, but inspected nodes and connections match. A version mismatch alone does not prove a functional difference.
- A subworkflow or webhook can be active without a time schedule. Active does not prove successful recent executions.

## Reader cache and fresh verification

The reader calls `Get Cache Data` (`AxGTGInFH5aOlQgr`), `Get Cache Lock` (`QCtBaW8ZUDH2rg0m`) and `Set Cache Data` (`46faGjSCditoShk3`). These helpers use n8n data tables; the last also removes expired cache data. The reader requests a **240-minute TTL**. Its cache key includes address-splitting, visibility and explicitly included Program-ID inputs.

The campus-page caller currently passes `invalidate_cache: true`. Do not assume every consumer does. For a repair, inspect the executed branch and input values, fresh HubSpot/HubDB node timestamps, selected mapping rows, final unique IDs and cache-write result. Retrying a failed execution can reuse old outputs. Use the [Program-data runbook](program-data-reliability.md) for bounded fresh verification, rather than triggering all downstream publishers.

## Current campus-publishing caveats

1. Default reader eligibility is `visibility=Visible`, `online != TRUE`, and `type` in `Announced`/`Open`. `visibility=all` and explicit-ID inputs alter this selection. Do not remove the filters merely to match the all-Program total.
2. **No enabled campus allowlist was found in the current campus publisher.** `Filter for DEV purposes` is disabled. The create/update branch is selected by `wordpress_post_id`: positive updates an existing page, `-1` clones. Do not assume a manual run is limited to the ticket's campus or that this code separately enforces School Chain = Alpha School.
3. **Website Copy Dynamic is disabled**, along with its related filter/extract/merge nodes. The Fixed tab is enabled. An edit to the Dynamic tab alone is not a durable current publishing path. Per-campus `website_campus_intro` still supplies `content_body_4`.
4. The active “Run Once for All Items” Elementor code skips null, undefined and empty strings/arrays/objects. Clearing `admission_link` can leave an existing button destination untouched. Verify removal in the actual destination; don't promise deletion from a blank source field alone.
5. Nonempty updates must find their required Elementor CSS IDs. In the active code, `address` is the explicit optional-ID exception. The disabled per-item code is not the current contract. Never rename required IDs to suppress a writer casually.
6. Lexington Program `51223157555` has approved proposed/not-enrolling SEO wording in `Prepare website data - various attributes`. `Complete website data` copies that description to Open Graph and X. Since 2026-10-08 8:54 AM PT the same node also has a Lexington title and header exception (counsel, 2026-10-02): `seo_title` is "Alpha Lexington | Proposed Campus" (a fallback: the exact title hand-set on 2026-10-02 was not recorded; Matt Barge's reply that day confirms only the "Alpha Lexington" headline), which `Complete website data` copies to Open Graph and X, and the Elementor `title` (H1) is the campus name only, with no "K-8 Private School in Boston, MA" line. Pre-change export: `n8n-exports/2026-10-08/ORgdHC71YJ5RawBy.before-lexington-title.private.json` (private, not in this repo). The Locations code has a named inquiry-only entry pointing to `https://alpha.school/boston-suburbs/`. These are observed exceptions, not approval to create new ones or proof of the live page on the inspection date.
7. Since 2026-10-08 9:58 AM PT (version `1511081c`) the same node also locks the Lexington intro (`content_title_html`, `content_body_1_html` to `content_body_3_html`) to counsel's approved text, because the Google Sheet "Website Copy Fixed" template overwrote it on 2026-10-07. A "Website Copy Dynamic" row keyed by `HubSpot Program ID` is the cleaner long-term source, but on 2026-10-08 that tab was not in the spreadsheet and its n8n nodes were disabled, so restoring it means recreating the tab and re-enabling the nodes, then removing this lock. Pre-change export: `n8n-exports/2026-10-08/ORgdHC71YJ5RawBy.before-lexington-intro.private.json` (private).

## Access, exports and maintenance

Local access instructions live in Marketing Support's `docs/N8N Access and Workflow Documentation.md` and reusable context's `accounts/credential-access.md`. Both document `N8N_BASE_URL` and `N8N_API_KEY` in ignored `secrets/reusable.env`; API auth uses `X-N8N-API-KEY`. No secret values belong in this playbook.

Marketing Support's `scripts/n8n/export-workflows.mjs` fetches explicitly selected workflows by GET and refuses an unignored output directory. Raw JSON may contain inline secrets, webhook material, pinned data and contact/student data: do not commit it. The inventory retains only reviewed metadata, credential **types**, references, and operating observations.

After a workflow change, re-export privately, compare the active version and disabled flags, update inventory facts and relevant field mappings, run playbook validation/tests, and route the PR through a code owner. Capture separate execution and public-page evidence before calling a production fix complete. Documentation does not install monitoring or correct runtime behavior.

Unresolved: replacement technical/admin/rotation owners; inherited instance timezone; current canary/public verification for each publisher; Alpha High's own website-publishing connection; Rio description-template correction. These are explicit gaps, not inferred assignments.
