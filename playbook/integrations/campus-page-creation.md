# Creating an Alpha School campus page

Source: Cristi Constantin's [Create an alpha.school/[campus] page for a HubSpot program](https://docs.google.com/document/d/1sVsLqyF0os_zOUjdAy8OcOULyASQttwAj5cBlX7uRY4/edit), modified July 1, 2026. Compared October 7 with active campus workflow `ORgdHC71YJ5RawBy`, version `94b04de5-8983-4daa-804e-4e8d53bf5387`, and shared reader `6HvmvgkzPkFikc40`. See [inventory](../../registry/n8n-workflows.json) for export hashes. No page was created to test these instructions.

This guide covers `alpha.school`, not Alpha High's separate site. The source describes mechanics; it does not approve a campus launch, lifecycle change, publication, navigation change, workflow edit or a production run. Use the existing APEX ticket and production/staging protocol.

## Prepare the source

Use an existing HubSpot Programs record and identify it by exact ID. Cristi's prerequisites are Visibility **Visible**, Type **Open or Announced**, School Chain **Alpha School**, and Online **FALSE**. The current reader enforces visible/non-online/Announced-or-Open by default, but the inspected publisher does not separately enforce the School Chain or an enabled campus allowlist. Confirm brand and destination before proceeding.

Read and complete the approved Program fields, preserving protected Program names:

- Display Name, Display Region, Website Campus Intro, start/end grade, Program Interest, tuition and admission link.
- School Address, street-level address, city, state, postal code, latitude/longitude, email and contact number.
- Existing `wordpress_post_id` and Website URL. The guide says to set Website to the final campus URL after publication; do not blank an existing approved URL as an onboarding step.

Verify the canonical HubDB Program-interest mapping using the [shared-reader contract](program-data-reliability.md). A second unmarked alias can duplicate a Program after the read even when HubSpot records are unique.

## Create and prove the backing page

1. Check for an existing page, WordPress Post ID, prior clone response, APEX ticket and unresolved partial execution. **Never reset an existing positive Post ID to `-1` to force a retry.**
2. Prepare the approved, bounded run with the n8n owner/authorized actor, source snapshot, destination and rollback evidence. The current publisher is a batch: its DEV filter is disabled. A normal run can update existing campuses as well as create the requested one.
3. For a genuinely new page, Cristi's documented creation signal is **WordPress Post ID = `-1`** (HubSpot Actions → View all properties). This queues it for the next eligible scheduled run too; coordinate timing before saving the value.
4. The current `Check WP Post ID` switch sends positive IDs to update and `-1` to `Clone SEO Template page`. The clone POST targets `https://alpha.school/wp-json/custom/v1/clone-elementor-page` with template post `6140`.
5. The workflow records the returned ID in the Program via `PATCH /crm/v3/objects/p_programs/{id}` and continues preparing and updating Elementor. Verify the **positive returned ID in HubSpot, correct WordPress site/object, and downstream node success**. A clone or Post-ID write may have succeeded even if a later content update fails.
6. Cristi describes a draft result. The export confirms the clone call but does not specify a status parameter or prove the endpoint's current default. **Read the created page's actual status** before continuing. Do not assume “draft” from workflow success.

The export does not show an additional Announced-only creation gate. Both Open and Announced can reach the `-1` switch through the default reader. This is observed behavior, not a policy change authorizing launches or new campus types.

## Finish and publish under the ticket

Open `https://alpha.school/wp-admin/post.php?post=ID&action=elementor` using the verified ID. The historical guide calls for setting the final slug, changing Draft to Published, adding navigation, then updating the Program Website URL. Apply those steps only within the approved page/ticket scope; new pages and components follow staging first.

Complete the unsynchronized material: approved intro media, staff cards/photos, packet/calendar links, and navigation. Verify admission/inquiry destinations and lifecycle language against the playbook. Preserve the CSS IDs expected by the active writer. Fixed-copy sheet edits and Program intro changes follow their source path; the Dynamic-copy sheet branch is currently disabled.

After publishing, read back the canonical page, HubSpot Website and Post ID. Verify body/status, SEO/Open Graph/X, schema, links and events scope on desktop/mobile, apply the cache runbook, and check the next scheduled publication preserves the result. Check Locations cards and the separate map delivery path independently. Store source IDs, execution ID/version, before/after evidence, final URL and screenshots on APEX.

If a run fails, inspect clone and HubSpot write receipts before retrying. Do not clone a second page, re-run the full batch or overwrite a newer page merely because the overall execution is red.
