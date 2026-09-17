# Recipe: Publish, Unpublish, and Draft Status

This recipe is human-reviewed until the ticket taxonomy and actor matrix explicitly allow scheduled execution.

## Inputs

- Canonical or intended public URL
- Exact WordPress object ID
- Current status and target status
- Reason and effective time
- Approver
- Redirect, sitemap, noindex, Markdown and LLM-export expectations
- Form, analytics and external side effects
- Restore plan

## Procedure

1. Resolve the object and any competing draft or published object.
2. Confirm the source and page-family publication requirements.
3. Read current post fields, metadata, canonical and status.
4. Verify the page is complete for the target state.
5. Prepare the status change and public postconditions.
6. Apply only through an allowed actor and exact authorization.
7. Recover caches.
8. Verify status, canonical, redirect, sitemap, robots, Markdown, LLM exports, navigation and public page behavior.

Publishing a draft requires content, forms, metadata, schema, mobile and desktop review. Unpublishing requires an approved redirect or explicit not-found behavior.

## Stop conditions

- Duplicate or competing page object
- Missing owner or redirect decision
- Unknown form, payment, analytics or integration side effect
- Page-family requirements incomplete
- Scheduled actor not integrated for `set_post_status`

## Rollback

Restore the prior status and fields only when the public route and downstream systems can be returned to their proven prior state. Record any transient indexing or form exposure as an incident.
