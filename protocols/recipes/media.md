# Recipe: Media Upload and Replacement

Classes: `media`, `observer-media-identity`, and the media portion of staff or page tickets.

## Inputs

- Canonical page URL and exact media slot
- Approved APEX asset or registry entry
- Source owner and rights confirmation
- Exact campus or person mapping
- Source SHA-256
- Filename, title, alt text, crop and focal point
- Expected current attachment ID

## Source rules

- Never identify a person or campus from appearance.
- Do not fetch unreviewed Slack or Drive files directly during unattended execution.
- Attach overflow media to the APEX ticket or another approved source record first.
- Do not substitute a visually similar asset.
- Seasonal and launch media must match current campus state and date.

## Upload

Use `upload_media_from_apex_asset` with the exact APEX asset ID, approved download URL, subject name, `sourceConfirmed: true`, filename, title, alt text, and expected SHA-256. Record the returned attachment ID and source hash.

An identical prior upload may return the existing attachment. Confirm the receipt matches this asset before using it.

## Prepare

1. Resolve the canonical object.
2. Find the exact image widget or supported staff card.
3. Confirm current attachment and expected slot.
4. Use a staff patch for a supported staff component or `prepare_elementor_content_patch` with a single `set_image` edit for a field-scoped widget.
5. Review the full snapshot and confirm the diff changes only the intended media fields.

Unknown widget structure, zero or multiple targets, missing asset mapping, unsupported file, or unapproved crop is a stop condition.

## Apply and verify

- Apply and confirm the proposed semantic hash.
- Regenerate Elementor CSS and follow cache policy.
- Scroll the image into view before judging lazy-loaded media.
- Confirm loaded state and natural dimensions.
- Verify attachment or URL, alt text, campus or person identity, crop, focal point, resolution, desktop and mobile.
- Confirm no other card or widget changed.
- Run cross-campus and sister-brand media checks.

## Rollback

Restore the full Elementor snapshot if the wrong image, crop, component, or sibling changed. Deleting an uploaded attachment is a separate cleanup decision; do not remove it before confirming no page uses it.

## Scheduled-agent status

Media upload is integrated when it is part of a supported staff execution. General page-media replacement and photo-only routing require the capability matrix to show an integrated path.
