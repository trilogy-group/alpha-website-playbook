# Missing-Info routing

**Purpose:** When an Alpha website APEX ticket is Missing Info or blocked on facts or assets, which **role** to ask. People hold roles in `registry/people.json`. Campus DoA/DoP are live via the Admissions Hub resolver. Machine twin: `registry/missing-info-routing.json`.

**As of:** 2026-09-15. Responsibility layer: `spec/responsibilities.json` v0.2.1.

## Quick routing table

| Missing-info class | Roles to ask (in order) | Channel | Do not |
| --- | --- | --- | --- |
| `staff_photo_title_bio` | requester, then dean-of-parents (live) | `#support-websites` / APEX Provide Info | events, n8n-sync-owner inventing bios |
| `launch_copy_coming_soon` | website-operations / requester | `#support-websites` | inventing open/closed |
| `hubspot_campus_facts` | director-of-admissions (confirm) → hubspot-owner (edit) → n8n-sync-owner (sync) | HubSpot/n8n GDM; `#admin-websites` for Locations List | hand-edit synced WP facts |
| `events_public_sync` | events (content) then hubspot-admin / events sync partners | `#admin-websites` | Website APEX |
| `info_packet` | campus + marketing-collateral + brand-authority + expansion-founding + website-operations host | APEX / `#support-websites` | publishing unapproved Flipsnack |
| `apply_link_admission` | hubspot-owner (`admission_link`) then website-agent-operator | APEX Website once SoT URL exists | inventing `submission_campus` |
| `brand_copy_voice_ux` | brand-authority (+ brand-authority-liaison) | existing brand GDM / APEX for UX impl | campus DoA for national brand voice |
| `n8n_overwrite_or_sync_exception` | n8n-sync-owner (+ website-operations partners) | HubSpot/n8n GDM with website-operations | "just edit WP" |
| `admissions_team_leadership` | expansion-founding | `#support-websites` | historical Amelia Baldwin |
| `requester_waiting_escalation` | website-agent-operator, website-operations (no escalation role exists) | answer on the ticket | clearing Missing Info by inventing answers |

## Class notes

1. **staff_photo_title_bio** : Requester first (usually campus DoA/DoP). Fall back to live dean-of-parents. Need exportable image files.
2. **launch_copy_coming_soon** : Campus requester confirms; website-operations executes.
3. **hubspot_campus_facts** : Confirm with director-of-admissions, edit HubSpot, then n8n-sync-owner. Not hand WP for synced fields.
4. **events_public_sync** : events owns content/Public flag; sync reliability partners own HubSpot→site. Route in `#admin-websites`. Do not file Website APEX.
5. **info_packet** : Campus facts + marketing-collateral (Canva) + brand-authority signoff + expansion-founding language QA + website-operations host. packet-owner is Yash Chitneni (Matt Barge, 2026-10-07).
6. **apply_link_admission** : hubspot-owner for `admission_link` / email; website-agent-operator for WP map.
7. **brand_copy_voice_ux** : brand-authority SoT; brand-authority-liaison for UX feedback.
8. **n8n_overwrite_or_sync_exception** : n8n-sync-owner. New locations: HubSpot `wordpress_post_id = -1` then run sync.
9. **admissions_team_leadership** : expansion-founding. Amelia Baldwin historical only.
10. **requester_waiting_escalation** : the website operators themselves; there is no escalation role (Matt Barge, 2026-09-15). Not a facts gap.

## Ticket class to routing class

The validator classifies tickets with `spec/ticket-classes.json` (17 classes). This table says which routing class above applies; machine form `ticketClassMap` in the JSON.

| Ticket class | Routing class |
| --- | --- |
| staff-add, staff-update, staff-remove, staff-photo | `staff_photo_title_bio` |
| observer-launch-copy, observer-media-identity | `launch_copy_coming_soon` |
| program-info, observer-fact-sync, observer-map-community | `hubspot_campus_facts` |
| observer-event | `events_public_sync` |
| observer-packet | `info_packet` |
| observer-link-cta | `apply_link_admission` |
| copy, observer-brand-leak | `brand_copy_voice_ux` |
| observer-layout, observer-health, other-workflow | none; `spec/responsibilities.json` `registryByTicketClass` alone |

`n8n_overwrite_or_sync_exception`, `admissions_team_leadership`, and `requester_waiting_escalation` have no ticket class. They are reached from what the ticket says, not from classification.

## Channels

| Channel | ID | Use |
| --- | --- | --- |
| `#support-websites` | `C09GRQ8L533` | Public intake/overflow |
| `#admin-websites` | `C099GQ9F15X` | Events sync / urgent reliability |
| `#apex-daily-rundown` | `C0B6GSNCJG2` | APEX rundown context |
| HubSpot/n8n GDM | (no ID captured) | Sync exceptions with n8n-sync-owner and website-operations |

## Operator checklist

1. Classify Missing Info (table above).
2. Resolve people from `registry/people.json` or the live campus resolver. Never hardcode people in rules.
3. Comment APEX with who was asked and what is still needed.
4. Never invent emails or Slack IDs.

## Appendix: resolved examples 2026-09-15

Point-in-time holders. Prefer live lookup over this appendix.

| Role | Example holder (see people.json) |
| --- | --- |
| n8n-sync-owner | Cristi Constantin (primary); Dmitry Bakaev (partner) |
| events (content) | Hailey McSpadden |
| events (sync reliability) / hubspot-admin | Garbhit Sharma; Dmitry Bakaev |
| website-operations | Yash Chitneni |
| website-agent-operator | Matt Barge |
| brand-authority | MacKenzie Price |
| brand-authority-liaison | Haven Mass |
| marketing-collateral | Chris Davidson |
| expansion-founding | Rachel Goodlad |
| hubspot-owner | Hailey McSpadden |

packet-owner: Yash Chitneni (Matt Barge, 2026-10-07, "info packets are all yash"). Packet path uses packet-owner + campus + marketing-collateral + brand-authority + expansion-founding + website-operations hosting.
