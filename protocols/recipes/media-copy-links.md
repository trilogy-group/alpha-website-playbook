# Recipes: media, copy, links and CTAs

## Media (`media`, `observer-media-identity`)

Applies to the intro card slot and any image whose file name, alt text, or nearby text names another campus.

1. `get_page` and locate the image widget by path; confirm the current attachment id and file name match the ticket's observed value.
2. Look up the approved asset in `registry/campus-open-media.json` (intro card) or in the ticket (requester-supplied image with the requester's confirmation). No approved asset means Missing Info naming the owner. Never substitute another campus's image or unrelated footage.
3. If the asset is not yet in WordPress, `upload_media_from_apex_asset` with a confirmed mapping.
4. `prepare_elementor_content_patch` with one `set_image` edit and `expectedCurrentAttachmentId`; check the diff touches only that widget.
5. Apply, regenerate CSS, clear cache. Ring 1: the new attachment id renders on the canonical URL. Ring 2: screenshot of the section; no other campus named in any image name or alt text on the page. Ring 3 after cache clear. Attach the desktop and mobile captures to the ticket with `agent/attach-evidence.mjs` before the RESOLUTION note (protocol section 7).

## Copy (`copy`, `observer-brand-leak`, `observer-launch-copy` text part)

1. `find_text_occurrences` with the exact current text. Every hit's field must be editable; note desktop and mobile duplicates.
2. Replacement text comes from the ticket (requester-approved) or from an approved exemplar in the playbook. Brand rules apply: no em dashes, no exclamation marks in headings or buttons, the recorded terminology (`marketingsupport docs/rules/alpha-brand-copy-rules.md`). If the replacement would violate a brand rule, send back rather than write it.
3. `prepare_elementor_content_patch` with one `replace_substring` edit per hit and the observed occurrence count; for post bodies, `prepare_post_fields_patch`.
4. Apply, regenerate CSS, clear cache. Ring 1: `expectedPresent` new text, `expectedAbsent` old text. Ring 2 and 3 as usual.

Sister-brand words (Nova, NextGen, Waypoint, Texas Sports Academy) on an Alpha campus page are a defect unless the page is a named exception (the shared Brownsville and Nova path). Removing them is copy; deciding the replacement is the campus owner's.

## Links and CTAs (`observer-link-cta`, `link-cta`)

Covers Apply, info packet, calendar, Book a Call, Book a Tour, registration, and community links.

1. Identify the CTA widget (`find_elementor_component` by `text`, or `find_text_occurrences` for the current URL in `link.url` fields).
2. The destination must be supplied by the ticket or by the source of truth (HubSpot `admission_link` for Apply; the packet owner for packets). Confirm it logged out: HTTP 200 and the body is the right campus and school year, not an expired or private platform page. A 401, a login wall, or another campus's page is a send-back.
3. `prepare_elementor_content_patch` with a `replace_field` edit on `link.url` (or the repeater item's link) and the current URL as `expectedCurrent`. Links must be https, mailto, or tel.
4. Apply, regenerate CSS, clear cache. Ring 1: `expectedLinks` carries the new URL. Ring 2 includes the CTA link resolution check. Ring 3 after cache clear.

A CTA that is present in the source but hidden (Elementor `hide_desktop`, `hide_tablet`, `hide_mobile`) is neither missing nor mislinked. Diagnose with `tests/rendered-controls.mjs`; the page check reports it as `cta-hidden-everywhere`. First confirm with the sync owner that no workflow writes the flags (for Book a Call this is open, sync-mapping ticket 2026-09-17). Then `prepare_elementor_content_patch` with one `set_visibility` edit per widget (field `visibility`, all three breakpoints stated, `expectedCurrentVisibility` set to what the rendered check reported), plugin 0.3.4 or later. Ring 1: `verify_public_page` no longer reports `hidden_everywhere`. Ring 2: rendered-controls passes on desktop and mobile and a screenshot shows the button. Ring 3 after cache clear, and the button must survive the next nightly run.

Missing CTA (the widget is absent, not mislinked): with plugin 0.5.0 or later, `prepare_elementor_structure_patch` with one `clone_element` of the sibling button (`expectedSourceId`, `expectedParentChildCount`, `overrides` for `text` and `link.url`), then rings 1 to 3 with the rendered check. Before 0.5.0, route to the Elementor owner with the destination already confirmed.
