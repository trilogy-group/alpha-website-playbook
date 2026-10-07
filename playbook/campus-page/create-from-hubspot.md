# Create a campus page from a HubSpot Program

Last verified: October 7, 2026  
Source: Cristi Constantin, [Create an https://alpha.school/[campus] page for a HubSpot program](https://docs.google.com/document/d/1sVsLqyF0os_zOUjdAy8OcOULyASQttwAj5cBlX7uRY4/edit) (shared 2026-10-07). Cross-check `integrations/hubspot-and-n8n.md` and `site/content-pipelines.md` for field mapping and proof rules.

This is the only written recipe Cristi had for new campus pages. Sister-brand sites (including alphahigh.school) are out of scope for this playbook.

## Prerequisites

1. The campus-specific program exists in HubSpot [Programs](https://app.hubspot.com/contacts/40051392/objects/2-43470849/views/52161559/list).
2. Set as many of the following as possible before the first sync:

### Program Configuration

- Visibility: must be Visible
- Type: must be Open or Announced
- School Chain: must be Alpha School
- Online: must be FALSE
- Display Name
- Display Region
- Website Campus Intro
- Start Grade Level
- End Grade Level
- Program Interest
- Tuition
- Admission Link

### Contact

- School Address
- Street-Level Address
- City
- State
- Postal Code
- School Latitude
- School Longitude
- Email
- Contact Number (the website receives its value once the school page goes live)

Also confirm the Program is on the n8n campus workflow allowlist before expecting a draft to appear.

## Trigger the initial sync

1. Set the Program's WordPress Post ID (Actions → View all properties) to `-1`.
2. Run [alpha.school website: Update school pages](https://trilogyinc.app.n8n.cloud/workflow/ORgdHC71YJ5RawBy) (`ORgdHC71YJ5RawBy`) in n8n.
3. Refresh the Program in HubSpot and check the new WordPress Post ID value.

A successful create is proven only when `wordpress_post_id` becomes a real positive WordPress object ID and the intended draft can be opened. Do not trust the green n8n banner alone.

Alpha MCP `create_draft_from_template` is an alternate path that clones the campus template into a draft with fresh element IDs and every CSS ID kept for n8n. It never publishes. Prefer the documented HubSpot `-1` sync when Operations owns the create; use MCP only when the ticket explicitly authorizes it.

## Post actions (website operations)

1. Continue manually editing the WordPress page at `https://alpha.school/wp-admin/post.php?post=YOUR_PROGRAM_WORDPRESS_POST_ID&action=elementor`.
2. Set the new page slug/URL and publish by changing status from Draft to Published (only when the launch owner has approved publication for that lifecycle).
3. Reference the new page from the WordPress site navigation menu.
4. Update the HubSpot Program Website field with the new campus WordPress URL (`https://alpha.school/[YOUR_CAMPUS_SLUG]/`).
5. Finish non-automated surfaces: intro media, staff cards, info packet and calendar links, Apply/booking routes, SEO/schema as required by the lifecycle page (`announced.md` or `open.md`).
6. Regenerate Elementor CSS if needed, then purge WP Engine and Cloudflare for the canonical URL. Verify logged-out public output before closing the ticket.

## Related

- Field destinations: `campus-page/field-map.md` and `spec/campus-page-field-map.json`
- Sync runbook: `integrations/hubspot-and-n8n.md`
- Pipeline overview: `site/content-pipelines.md`
