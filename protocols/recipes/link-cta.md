# Recipe: Links and CTAs

Classes: `link-cta` and `observer-link-cta`.

## Inputs

- Canonical page URL
- CTA label and component
- Exact current destination
- Exact approved destination
- Source field or owner
- Logged-out reachability evidence
- Campus or program identity

## Source check

Determine the exact link family:

| Link | Typical authority |
| --- | --- |
| Apply | HubSpot Program `admission_link` and application routing owner |
| Book a Call | HubSpot Program `call_scheduling_link` (the campus's own meetings page) |
| Info packet | Approved packet registry and packet workflow |
| Community | Exact Program ID joined to visible Community record |
| Event registration | HubSpot Marketing Event |
| Page-owned editorial link | Approved APEX replacement |

If n8n writes the target, change the source and verify delivery instead of patching Elementor.

### Book a Call on Open and Announced pages

Every campus page whose HubSpot Program type is Open or Announced shows Book a Call on desktop, tablet and mobile, linking to that campus's own Program `call_scheduling_link` (Rachel Goodlad, Slack 2026-10-06, in answer to Matt Barge: "Yes, they should all have their own links"; `docs/decisions.md` 2026-10-06). Pre-Announcement campuses have no booking. Nothing writes the widget from HubSpot (`spec/synced-targets.json` has no book_a_call id), so:

1. Read the Program's `call_scheduling_link` and `get_element` on `book_a_call_1` and `book_a_call_2`. Expect text, link and visibility all to need checking: a hidden widget may carry a Community link or other text.
2. When HubSpot has the link: show, never hide. One `prepare_elementor_content_patch` with `set_visibility` (all three breakpoints true), `link.url` set to the `call_scheduling_link` when it differs, and text `Book a Call` when it differs. Confirm the destination logged out first: 200 and a meetings page naming this campus.
3. When the Program has no `call_scheduling_link`: change nothing on the page; the ask goes to the HubSpot Program owner to set it.
4. A page with no Book a Call widget at all is structural (clone a sibling button with plugin 0.5.0 or later, or route to the Elementor owner).
5. The only standing exception is Dorado's destination (`registry/campus-cta-exceptions.json`); the 2026-09-24 Lexington hidden exception expired 2026-10-06.

## Prepare

1. Resolve the canonical live object.
2. Find the CTA by stable component or exact label and current URL.
3. Verify the destination logged out. Confirm host, path, campus, year, form or application route, and expected redirect.
4. Preserve legitimate UTM and analytics behavior. Compare the base URL before treating `_gl`, `_ga`, or approved tracking parameters as a defect.
5. Prepare a field-scoped `link.url` edit with the exact current URL.
6. Review snapshot, diff, proposed hash, and expected public link.

An absent CTA widget is structural work and routes to the Elementor owner. A 401, login wall, wrong campus, expired packet, unknown Program, or guessed Community slug is Missing Info.

## Apply and verify

Apply the exact approved preparation, read back, recover CSS and caches, then verify:

- Correct visible label
- Correct base destination and permitted parameters
- Logged-out reachability
- Exact campus, Program, packet year, event, or application identity
- No wrong responsive duplicate
- Form or admissions behavior when relevant
- Whole-page, desktop, mobile, and ring-3 checks

## Rollback

Restore the saved snapshot when the target or public path is wrong, the link change affected another component, or downstream behavior fails because of the edit.

## Scheduled-agent status

The scheduled Alpha MCP path is not currently documented as integrated for general link editing. Do not fall back to an unattended browser.
