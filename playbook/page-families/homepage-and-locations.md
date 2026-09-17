# Homepage and Locations Requirements

## Purpose

The homepage explains Alpha, routes families into the admissions funnel, presents the campus network, and exposes global navigation and conversion paths. Locations lets a parent find the correct campus or Community destination.

## Known objects and dependencies

- Front page WordPress object: `3657`, subject to resolution before any write
- Shared header template: `76`
- Shared footer template: `77`
- HubSpot-backed growth-map data
- Homepage and Locations map applications
- HubSpot forms and tracking
- Global UTM propagation
- Voiceflow or founder-chat behavior where enabled
- GTM and consent behavior

## Requirements

- One indexable canonical URL per page.
- One semantic H1 describing the page purpose.
- Unique title and approved meta description.
- Header and footer render with their expected styles.
- Primary calls to action route to the approved admissions or campus journey.
- Locations and map data match HubSpot Program identity, lifecycle, address, coordinates, and approved public destination.
- Each Program appears once unless an explicit multi-location rule applies.
- Pre-Announcement Programs route to a verified campus-specific Community URL.
- The map does not trap normal page scrolling or obscure keyboard access.
- No map or card points to a draft, obsolete campus object, wrong brand, or guessed Community slug.
- Analytics, consent, chat, and UTM scripts do not block primary content or routing.
- Desktop and mobile checks include maps, navigation, popups, overlays, and primary CTAs.

## Change routing

| Change | Owner and path |
| --- | --- |
| Campus fact or lifecycle | HubSpot Program, then map or n8n delivery |
| Map row or coordinates | Growth-map owner |
| Community record or slug | Community app owner |
| WordPress map CTA or surrounding copy | Website operations through an approved recipe |
| Page layout or map implementation | Elementor or platform owner, staging first |
| Global navigation or tracking | Dedicated global ticket, staging first |

## Completion

Verify the requested outcome, the complete page, the map interaction, affected campus destination, desktop, mobile, canonical, metadata, and two untouched pages after a shared-template or global-script change.
