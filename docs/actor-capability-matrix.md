# Actor and Capability Matrix

Last verified: September 17, 2026  
Machine form: `spec/actor-capabilities.json`

The existence of a WordPress endpoint or Alpha MCP tool does not mean every actor may use it. This matrix separates tool capability, APEX integration, production authorization, and human fallback.

## Status definitions

| Status | Meaning |
| --- | --- |
| Implemented | Code or a system path exists |
| Integrated | The actor can reach the operation through its normal execution path |
| Tested | The required environment test or canary evidence exists |
| Allowed | Current policy permits the actor to use it in the named environment |
| Human-only | Requires an authorized person and is not available to unattended execution |
| Unsupported | The actor must stop and route the ticket |

## Current matrix

| Operation | Scheduled APEX agent through Alpha MCP | Human Alpha MCP operator | Browser or wp-admin | Source-system owner |
| --- | --- | --- | --- | --- |
| Resolve page and detect drafts | Integrated, read-only | Integrated, read-only | Possible but not authoritative | Not applicable |
| Read page and find component | Integrated, read-only | Integrated, read-only | Possible | Not applicable |
| Staff add | Integrated for eligible, approved pilot or enabled scope | Implemented for recognized structures | Supervised fallback only | Campus supplies approved facts and asset |
| Staff copy update | Integrated for supported fields | Implemented | Supervised fallback only | Campus supplies approved copy |
| Staff removal | Integrated | Implemented | Supervised fallback only | Campus supplies identity and effective date |
| Staff photo only | Legacy APEX path or held unless routed through a supported staff update; not yet the same Alpha scheduled path | Implemented using explicit asset mapping | Supervised fallback only | APEX asset owner supplies exact file |
| Staff reorder | Alpha MCP tool exists; scheduled route not established | Implemented for recognized existing components | Supervised fallback only | Campus supplies approved order |
| General Elementor text, link, or image | Alpha MCP tool exists; scheduled route not established | Implemented in bridge and plugin, subject to environment policy | Supervised fallback only | Copy, link, or asset owner supplies value |
| Post title, excerpt, body, Yoast fields | Alpha MCP tool exists; scheduled route not established | Implemented, subject to environment policy | Human-only fallback | Content or SEO owner supplies value |
| Publish or unpublish | Scheduled route not established | Implemented with bounded status rules | Human-only | Approver required |
| Upload APEX media | Integrated when part of supported staff execution | Implemented with exact source hash and person mapping | Human-only fallback | Asset must already be attached to APEX or approved record |
| Elementor snapshot restore | Integrated recovery for supported Alpha executions | Implemented | WordPress revisions alone are insufficient | Website operator authorizes recovery |
| CSS regeneration | Integrated after supported mutation | Implemented | Human-only fallback | Not applicable |
| WP Engine clear-all | Integrated and rate-limited for supported batches | Implemented with cache capability | Human-only fallback | Not applicable |
| Cloudflare URL purge | Available only when provider callback and authorization are configured | Same | Cloudflare owner only | Cache owner |
| Public text and media verification | Integrated | Implemented | Browser provides required visual supplement | Observer may independently confirm |
| Desktop and mobile visual verification | Integrated in APEX release path where enabled | Required human or browser-backed check | Human-only | Observer may independently confirm |
| HubSpot Program data | Not a WordPress mutation; use approved APEX Program path | Website operators may change permitted values in APEX or HubSpot | Do not patch synchronized Elementor fields | HubSpot Program owner |
| n8n mapping or workflow | Unsupported | Unsupported unless the person is the named n8n owner | Not applicable | n8n owner only |
| HubSpot event publication | Unsupported | Unsupported as a WordPress edit | Do not hand-edit event posts | Authorized event and HubSpot operator |
| New carousel, new section, new page, or structural clone | Unsupported | Unsupported by Alpha MCP | Human project work after staging and approval | Elementor owner |
| Global template, plugin, form, script, or redirect-system change | Unsupported | Not a routine Alpha MCP ticket | Human project work after staging and approval | Named platform owner |

## Alpha MCP tool inventory

The audited Alpha MCP 0.3.2 bridge exposes 20 fixed tools:

1. `resolve_page`
2. `get_page`
3. `find_elementor_component`
4. `upload_media_from_apex_asset`
5. `prepare_elementor_staff_patch`
6. `apply_elementor_staff_patch`
7. `restore_elementor_snapshot`
8. `regenerate_elementor_css`
9. `flush_wp_engine_cache`
10. `purge_cloudflare_url`
11. `verify_public_page`
12. `inspect_hubspot_event`
13. `find_text_occurrences`
14. `get_post_fields`
15. `prepare_elementor_content_patch`
16. `apply_elementor_content_patch`
17. `prepare_post_fields_patch`
18. `apply_post_fields_patch`
19. `restore_post_fields_snapshot`
20. `set_post_status`

This is a tool inventory, not an execution allowlist. Scheduled-agent integration and feature flags remain narrower.

## Scheduled-agent hard limits

Current Alpha MCP worker design limits include:

- Up to 10 mutations per run
- Up to 20 minutes per run
- Up to 2 whole-site cache clears per run
- Up to 5 public verification attempts per ticket inside 10 minutes
- One retry for transient network, HTTP 429, or HTTP 5xx only after confirming the lease
- No automatic retry after lease loss, wrong object, stale hash, mapping conflict, unknown structure, or failed restoration

The workflow also has environment and pilot flags. A tool being integrated does not prove it is enabled for all production tickets.

## Browser policy

Browser use is appropriate for:

- Read-only inspection
- Desktop and mobile visual QA
- Supervised fallback after an owner decision
- Plugin or workflow administration by the named owner

Unattended browser production edits are not an alternative when the scheduled Alpha MCP route refuses a ticket.

## Updating this matrix

An operation moves to Allowed only when all of these are recorded:

1. Implementation commit or system path
2. Actor integration path
3. Staging evidence
4. Production canary when applicable
5. Owner and rollback procedure
6. Ticket class and tested recipe
7. Feature-flag or environment state

Update the machine-readable registry and this page in the same pull request.
