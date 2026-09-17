# Cache and Public Verification Runbook

Last verified: September 17, 2026

## Why this is required

WordPress storage, Elementor generated CSS, WP Engine cache, and Cloudflare edge cache can disagree. A save or correct origin readback does not prove what a parent sees.

Production responses have shown Cloudflare cache hits and a one-hour cacheability window. Staging was dynamic behind Cloudflare, so staging could not prove that a WP Engine clear also purges the production edge.

## Fixed sequence

1. Apply the approved mutation.
2. Read back the complete affected store.
3. Confirm the proposed semantic hash and exact ticketed fields.
4. Regenerate page-scoped Elementor CSS when the page or template requires it.
5. Clear WP Engine caches when required. This is a site-wide operation.
6. Purge the exact affected canonical URLs from Cloudflare when the approved provider callback is configured.
7. Fetch the query-free canonical URL.
8. Verify object identity, HTTP result, canonical tag, expected present and absent content, media, links, and cache evidence.
9. Perform desktop and mobile review.
10. Run ring 3 after a global or site-wide action.
11. Record `verified_pass`, `verified_failure`, or `unverified` in APEX.

## When CSS regeneration is required

Regenerate after an Elementor document mutation, snapshot restoration, or a known generated-style problem. Use the page-scoped Alpha MCP ability. Do not purge all Elementor CSS files through an unrelated broad tool when page-scoped recovery exists.

Confirm the public page still links and serves the expected header and page CSS. The September 15 header regression proves that content correctness without styles is a failure.

## WP Engine policy

- WP Engine clearing is clear-all, not URL-scoped.
- Batch up to ten separately evidenced tickets.
- Default minimum interval between clears is five minutes.
- The scheduled worker permits no more than two clear-all operations per run.
- Do not clear after every ticket in a batch.
- A `429` cooldown response is expected behavior, not permission to use another purge mechanism.
- Stop new mutations and clears if visitor performance degrades.

The cache authorization must bind the exact batch ticket or execution IDs.

## Cloudflare policy

Use `purge_cloudflare_url` only when the production provider callback and authorization are configured. The authorization binds the exact canonical URL set, with a maximum of ten.

If the operation reports unavailable and the public edge remains stale:

- Do not claim success.
- Continue bounded public retries within the execution window.
- Record response headers and `unverified` if the edge cannot be proven current.
- Route configuration to the cache or platform owner.

Never store Cloudflare credentials in the playbook, APEX evidence, or MCP response.

## Public verification request

The request should identify:

- Canonical URL
- Expected WordPress object ID
- Exact strings that must be present
- Exact strings or safe patterns that must be absent
- Expected media attachment or URL
- Expected links and destinations
- Expected canonical tag
- Cache or receipt evidence required by the execution

Use query-free URLs for final evidence. Tracking parameters may be added by the browser or destination site and are not automatically defects.

## Bounded retry

- Up to five public verification attempts per ticket inside ten minutes.
- Retry only transient network, HTTP 429, HTTP 5xx, or demonstrably stale-cache conditions.
- Do not retry wrong object, wrong content, source mismatch, changed hash, broken layout, or missing stylesheet as though they are cache delay.
- If public state remains unknown after the bound, record `unverified` and keep the ticket open.

## Batch failure rule

Verified tickets remain complete. Failed tickets remain open. Do not roll back successful siblings unless a shared document write failed or later verification shows their postconditions no longer hold.

Record one batch cache receipt and separate public verification evidence for every canonical URL.

## Required response evidence

Capture where available:

- Verification time
- HTTP status
- Final URL after redirects
- Canonical tag
- Object identity signal
- `cf-cache-status`
- `cache-control`
- `x-cacheable`
- Expected present and absent results
- Link and media checks
- Desktop and mobile screenshots
- Ring-3 pages and outcomes

Headers describe delivery behavior but do not replace content verification.

## Result rules

| Result | Rule |
| --- | --- |
| `verified_pass` | Canonical page is reachable and every required content, identity, link, media, cache, and visual check passes |
| `verified_failure` | Canonical page is reachable and at least one required check fails |
| `unverified` | The agent cannot establish the public truth because of bounded network, cache, authentication, or evidence limitations |

Only `verified_pass` can close the ticket.
