# HubSpot and n8n Runbook

Last verified: September 23, 2026
Primary campus workflow: `ORgdHC71YJ5RawBy` on `trilogyinc.app.n8n.cloud`

## Boundary

HubSpot Programs is authoritative for campus lifecycle and website-driven campus facts. n8n delivers those values to specific Elementor targets. APEX owns the request, approval, and evidence. WordPress is downstream for synchronized values.

Website operators may update approved website-driven Program values through the APEX campus editor or as an authorized person in HubSpot. The September 17 instruction from Yash says the Program names at the top are the exception and cannot be changed by website operators. The broader permission question with Rachel remains open, so unusual or high-impact Program changes still require owner confirmation.

## Program and Organization identity boundary

A HubSpot Program is not a website-only routing label. Farhan Afzal Raja confirmed on September 23, 2026 that Programs are defined by Organizations and map one-to-one through SIS, TimeBack, and downstream applications. A website or event request therefore cannot create, rename, split, or infer a Program.

- Create a separate campus High School Program only after the organization owner has approved a separate Organization and the HubSpot Program administrator has created and mapped it through the downstream systems.
- Do not create a Program merely so an event can be pushed to `alpha.school`, `alphahigh.school`, or a separate event feed.
- Do not reuse a similarly named Program, manufacture a program-interest value, or map an event to a K-8 Program as a substitute for the missing decision.
- When an event request names a High School audience but no exact approved Program exists, hold the routing decision and send it to `hubspot-program-admin`, with `expansion-new-programs` as the new-organization approver. The events owner may select an existing Program and destination only when that choice is explicit.
- Read the live Program and Organization records before acting. A dated inventory is evidence, not authority.

Point-in-time example, not a permanent inventory: on September 23, 2026 HubSpot had `Alpha High School` (Visible) and `Alpha High Santa Barbara` (Hidden); Santa Monica had only `Alpha Santa Monica`, with no separate `Alpha High Santa Monica` Program.

## Website-driven Program fields

| Source field family | Public result | n8n destination |
| --- | --- | --- |
| `type` | Campus lifecycle and expected status language | Used for state diagnosis; deriving the intro sentence directly remains proposed |
| `contact_number` | Public phone and schema telephone | `phone` target and JSON-LD |
| `school_address` | Address, map, and schema | `address` target, map settings, JSON-LD |
| Grade start and end fields | Grade-range title and SEO | `address` title, page title, SEO fields |
| School name, city, state | Page identity and metadata | `title`, page and social metadata |
| Website copy fields | Intro and supporting campus copy | `content_title`, `content_body_1` through `content_body_4`, `attend_cta_button` |
| `tuition_usd_yearly` | Tuition | `tuition` target |
| Email | Public contact email and schema | `email` target and JSON-LD |
| `cognia_accredited` | Accreditation badge state | `cognia_yes` and candidate targets |
| `form_program_interest_label` | Campus event feed | `hubspot_events` shortcode |
| `admission_link` | Apply CTA | `resource_4` link |
| `call_scheduling_link` | Booking CTA where mapped | Campus CTA target defined by the field map |
| `community_url` | Community destination or map value where configured | Surface-specific delivery |

The exact field writer and derivation live in `spec/campus-page-field-map.json`. That file wins over this summary when it is more specific.

## Before changing a Program value

1. Validate the APEX ticket and identify the exact public element.
2. Read the HubSpot Program by exact object ID, not campus-name search alone.
3. Record the source field, value, and read time.
4. Read the current public canonical value.
5. Confirm the field is in the website-operator allowlist and is not the protected Program name.
6. Confirm the requester or named owner approves the new value.
7. Identify every downstream surface the field can affect.
8. Check for an existing APEX ticket, n8n override, disabled CSS ID, or competing Program writing the same page.

Greenwich is a known example where two Program records can relate to one page. Do not assume one Program per page when the registry identifies a conflict.

## Preferred edit path

Use the APEX campus editor when it exposes the exact supported field. It preserves the website request context and uses the existing two-way HubSpot synchronization. If the editor does not support the field, an authorized person may use HubSpot when policy allows it.

After the edit:

1. Read HubSpot again and record the object ID, field, value, and time.
2. Wait for or verify the APEX readback, normally within about 30 minutes.
3. Record whether the campus-page n8n flow should run on schedule or be run manually by its owner.
4. Do not patch the Elementor target while waiting.

## n8n execution

Only the named n8n owner changes workflow logic. A website operator may request or observe a run.

For a manual run, the owner must record:

- Workflow ID and active version
- Trigger time and run ID
- Exact HubSpot Program object ID
- Source values at run time
- WordPress destination object ID
- Whether the campus is in the workflow allowlist
- Starting `wordpress_post_id` value
- Node that selected the Program
- Node that transformed each ticketed field
- WordPress response and resulting post ID
- Execution status and any partial or retried nodes

Do not report success from the green workflow banner alone. A new page is proven only when `wordpress_post_id` becomes a real positive object ID and the intended canonical page can be resolved.

## Execution-log inspection

Inspect in this order:

1. Trigger received the expected Program.
2. Program filtering and allowlist did not exclude it.
3. Field values were present at source read time.
4. Transform nodes produced the expected display values.
5. Every expected Elementor CSS ID resolved exactly once.
6. WordPress returned the expected environment and object.
7. The workflow did not continue after a failed or partial write.
8. Readback contains the expected stored values.
9. Canonical public verification passes after caches.

Attach the run ID and relevant node evidence to APEX. Do not attach secrets or full contact records.

## Failure classification

| Condition | Class | Owner |
| --- | --- | --- |
| HubSpot source is wrong or blank | `hubspot-data` | HubSpot Program owner or approved website operator |
| Source is right but transformation is wrong | `sync-mapping` | n8n sync owner |
| Source and transformation are right but WordPress is stale | `sync-delivery` | n8n sync owner, then WordPress owner if the write failed |
| Stored WordPress value is right but public output is stale | Cache or presentation | Website operations or platform owner |
| Page is missing a target CSS ID | Layout or template | Elementor owner plus n8n owner |
| Imported event is wrong | Event pipeline | Event or events-plugin owner, not the campus-page editor |

## Retry and partial-save rules

- Retry a failed read or rate-limited request only after confirming the source and target have not changed.
- Do not replay a full workflow blindly after any WordPress node may have succeeded.
- Read the target object and the workflow execution outputs before retrying.
- If a subset of fields saved, keep the ticket open and classify the incomplete fields separately.
- If a workflow can write several pages, verify every affected object named in its execution, not only the ticketed page.
- A retry that would overwrite a newer human change requires owner review.

## Safe disable and recovery

When a workflow is causing repeated wrong writes:

1. Stop or deactivate the workflow through the n8n owner.
2. Record the active version, time, reason, affected Programs, and affected WordPress objects.
3. Preserve the workflow export and failed execution IDs.
4. Reconcile each affected page against HubSpot and the playbook.
5. Correct source or mapping in a test copy when possible.
6. Verify one staging or bounded test case.
7. Reactivate with a named canary Program.
8. Verify its stored and public output before allowing the next scheduled batch.

Do not rename CSS IDs as a permanent way to disable a workflow. A temporary `-disabled` override must have an APEX ticket, owner, value, reason, and restoration condition.

## Version and drift control

For each material workflow, the playbook inventory must retain:

- Workflow ID and name
- Active or inactive state
- Owner
- Schedule or trigger
- Export hash or version reference
- Source and destination schema
- CSS IDs or post types written
- Last staging or canary evidence
- Last reviewed date

A changed export hash, field list, CSS ID list, schedule, or owner is drift and requires review before unattended execution relies on it.

## Worked campus-fact example

1. APEX requests a new campus address and identifies the canonical campus URL.
2. Source diagnosis maps the address to HubSpot `school_address` and the n8n `address` target.
3. An approved website operator changes the exact HubSpot Program through the APEX campus editor.
4. HubSpot readback proves the new address and object ID.
5. The APEX readback confirms synchronization.
6. The n8n owner runs or observes workflow `ORgdHC71YJ5RawBy` for that Program.
7. Execution evidence proves the address transformation and target WordPress object.
8. WordPress readback shows the new Elementor and schema values.
9. Elementor CSS is regenerated if required; WP Engine and Cloudflare are handled through the cache runbook.
10. The query-free canonical URL is checked for the new address, absence of the old address, correct schema, desktop and mobile rendering.
11. The next normal n8n run must preserve the result before the ticket is considered durable.

## Owners and unresolved items

- n8n campus workflow: Cristi Constantin, with Dmitry Bakaev as partner in the current registry
- HubSpot Program administration: Farhan Raja
- HubSpot governance: Hailey McSpadden and Dmitry Bakaev according to the responsibility registry
- Website operations: Matt Barge and Yash Chitneni
- Protected Program-name process: owner path documented, but exact request procedure still needs confirmation
- Exact APEX campus-editor field list: must be exported and added to the source registry
- Exact n8n manual-run UI and alert destinations: must be confirmed by the n8n owner
