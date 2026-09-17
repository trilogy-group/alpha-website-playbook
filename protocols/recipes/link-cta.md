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
| Book a Call | HubSpot `call_scheduling_link` or named calendar owner |
| Info packet | Approved packet registry and packet workflow |
| Community | Exact Program ID joined to visible Community record |
| Event registration | HubSpot Marketing Event |
| Page-owned editorial link | Approved APEX replacement |

If n8n writes the target, change the source and verify delivery instead of patching Elementor.

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
