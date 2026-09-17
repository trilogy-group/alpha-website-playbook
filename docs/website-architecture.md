# Alpha Website Architecture

Last verified: September 17, 2026  
Scope: Alpha public WordPress site, `alpha.school`

This document explains how content reaches the site. It is an operating map, not a credential inventory and not permission to change any system.

## System boundary

| Layer | System | Responsibility |
| --- | --- | --- |
| Request and control | APEX | Tickets, revisions, assignment, approvals, leases, checkpoints, evidence, completion |
| Business data | HubSpot Programs | Campus state, identity, address, grades, tuition, contact values, admissions and booking fields, website intro copy |
| Website-friendly editor | APEX campus editor | Permitted Program-field edits with two-way HubSpot synchronization |
| Delivery | n8n | Converts HubSpot and other source values into Elementor and Locations output |
| Editorial sources | Airtable, HubSpot Marketing Events, approved asset records | Alpha Answers, video resources, events, and media inputs |
| Content store | WordPress | Posts, pages, media, metadata, redirects, users, revisions, custom post types |
| Page composition | Elementor and Elementor Pro | Campus page documents, global templates, widgets, CSS IDs used by synchronization |
| Safe WordPress adapter | Alpha MCP | Canonical resolution, bounded field or component changes, snapshots, hashes, cache actions, public verification |
| Legacy writers | APEX Elementor routes, custom WordPress routes, browser | Existing paths with narrower or less consistent controls; use only when explicitly approved |
| Caching and delivery | WP Engine, Cloudflare | Origin and edge caching between WordPress and visitors |
| Observation | Production observer and page checks | Detects source, rendering, link, identity, SEO, event, map, and health defects |

## Primary content flows

### Campus Program values

```text
APEX campus editor or authorized HubSpot person
    -> HubSpot Program
    -> HubSpot readback
    -> n8n workflow ORgdHC71YJ5RawBy
    -> Elementor targets selected by stable CSS IDs
    -> WordPress page
    -> caches
    -> canonical campus URL
```

The n8n campus flow runs daily at 00:15 Central unless manually run by its owner. A direct Elementor edit to a synchronized target is temporary and can be overwritten.

### Staff cards and direct page content

```text
Approved APEX ticket and exact source asset
    -> APEX ticket claim and web:alpha.school lease
    -> Alpha MCP resolve and prepare
    -> approved exact proposed hash
    -> WordPress or Elementor apply
    -> CSS and cache recovery
    -> canonical public verification
    -> APEX evidence and completion
```

The scheduled APEX Alpha MCP integration currently supports a smaller operation set than the Alpha MCP bridge. See `docs/actor-capability-matrix.md`.

### Events

```text
APEX event request
    -> registration system and URL
    -> HubSpot Marketing Event
    -> Public = Yes and required source fields
    -> WordPress event importer, about every 30 minutes
    -> hubspot_event post and taxonomies
    -> /upcoming-events/ and campus shortcode
```

Do not create or repair `hubspot_event` posts manually. Diagnose the HubSpot record, plugin import, taxonomy mapping, and campus shortcode separately.

### Alpha Answers and video resources

```text
Airtable approved records
    -> import endpoint or workflow
    -> WordPress resource content
    -> Alpha Answers index and detail experience
```

The import schema, canonical grouping behavior, and validation rules require additional verification. Until completed, route schema or import failures to website operations.

### Maps and Community

```text
HubSpot Program and Operations data
    -> public growth-map API
    -> homepage and Locations map applications

Visible Community program joined by exact HubSpot Program ID
    -> approved Community slug
    -> https://www.community.alpha.school/?campus=<slug>
    -> WordPress CTA or map destination, depending on the ticketed surface
```

Map, Community, and WordPress are separate surfaces. A ticket can require linked work in more than one system, but one surface must not be changed as an undocumented side effect of another.

## Global WordPress output

The audit observed these global technologies or behaviors in rendered output:

- Elementor and ElementsKit components
- Google Tag Manager container `GTM-5W56ZLQJ`
- Google tag `GT-PJNQ32T9`
- HubSpot tracking, forms, content embeds, and consent scripts
- Meta and LinkedIn tracking markers
- Voiceflow chatbot rollout logic
- Founder chat behavior controlled by an `agent` query parameter
- Global UTM propagation JavaScript
- Two map implementations on the homepage
- Yoast SEO and the Redirection plugin

These global systems can affect many pages. Changes require a dedicated ticket, owner approval, staging when behavior changes, and ring-3 verification.

## Known WordPress objects and shared templates

| Object | ID | Use |
| --- | ---: | --- |
| Front page | 3657 | Homepage |
| Theme-builder header | 76 | Shared header |
| Theme-builder footer | 77 | Shared footer |
| Campus SEO template | 6140 | Source template used by the campus creation and synchronization process |

IDs must be resolved again before mutation. This table is a routing aid, not a substitute for `resolve_page` or an environment check.

## Overlapping authenticated writers

The public WordPress REST index exposes or has exposed these namespaces:

- `alpha-mcp/v1`
- `apex-elementor/v1`
- `apex-emcp-compat/v1`
- `custom/v1`
- `mcp`
- `wp-abilities/v1`
- `alpha-video-resources/v1`
- `ahse/v1`
- `redirection/v1`

An exposed namespace does not prove that an operation is approved, enabled, or safe. The actor-capability registry decides the allowed path. `custom/v1/update-elementor-page` performs broad document replacement and must not be used for routine ticket execution.

## Failure diagnosis order

Diagnose in this order:

1. Request: Is the desired outcome complete and approved?
2. Authority: Does the source system contain the expected value?
3. Mapping: Does the delivery rule convert that source value correctly?
4. Delivery: Did the workflow or importer run successfully for the right object?
5. Storage: Does WordPress or Elementor contain the expected value?
6. Presentation: Does the page structure render it correctly?
7. Cache: Is the public response stale at WP Engine or Cloudflare?
8. Verification: Does the query-free canonical URL pass exact content and visual checks?

A failure at one layer is not repaired by patching a later layer unless the playbook explicitly identifies the later layer as authoritative.

## Architecture changes

Any new writer, source field, workflow, plugin, global script, form, redirect system, cache provider, or page family must update:

- This architecture map
- `spec/source-authority.json`
- `spec/actor-capabilities.json` when execution changes
- The related inventory in `registry/`
- The ticket class and recipe when a new operation becomes executable
- Observer checks and acceptance evidence
