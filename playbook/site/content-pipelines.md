# How content reaches alpha.school without a person editing WordPress

Machine form: `spec/content-pipelines.json`. Read this before any edit: several parts of a campus page are written by automation, and a hand edit to those parts is overwritten on the next run.

October 7 active-version inventory: [n8n workflow map](../integrations/n8n-workflow-map.md). Creation steps: [campus-page creation](../integrations/campus-page-creation.md). Raw exports remain private.

## The short version

| Content | Written by | From | How often | Owner role |
| --- | --- | --- | --- | --- |
| Campus facts on a campus page: phone, address, grade range in the hero, tuition, email, page and SEO titles, four content body blocks, attend CTA, Cognia badge, gallery, FAQ and team titles, the events shortcode, the Apply link, Book a call | n8n workflow "Update school pages" | HubSpot Programs | daily, plus manual runs | n8n sync owner |
| New campus page (verify draft status) | same workflow, create branch | Eligible HubSpot Program with WordPress Post ID -1; see current creation runbook | when run | n8n sync owner, then website operations finishes the draft |
| Locations page List cards | a second n8n workflow | HubSpot Programs, with card images and a few overrides held inside n8n | schedule minute 2; inherited timezone needs confirmation | n8n sync owner |
| Events on `/upcoming-events/` and every campus event strip | Alpha HubSpot Events plugin stack (three plugins) | HubSpot Marketing Events with Public = Yes | about every 30 minutes, plus manual sync; every event post is rewritten on each run | events plugin owner (Garbhit), event data owner (Hailey) |
| HubSpot Marketing Events themselves | APEX "Push to HubSpot" (allowlisted users), then automatic re-push on edits; public flag switched on by hand in HubSpot, switched off by APEX on cancel | APEX events tracker, registration URL from the Goldcast push | as events are pushed or edited | HubSpot owner |
| HubSpot Program facts themselves | APEX campus Program editor (human approval, or the hosted agent behind feature flags) | APEX program change | on approval; HubSpot is read back into APEX every 30 minutes | HubSpot program admin |
| Homepage and Locations maps | growth map API on AWS, map app on S3 | HubSpot Programs | live | growth map owner (not yet named) |
| Event landing pages on go.alpha.school, forms, popups, Book a Tour and Book a Call meeting links, tracking, consent banner | HubSpot | HubSpot | live | HubSpot owner |
| Registration pages | events.alpha.school (Express app) or Goldcast | HubSpot registration link | live | events |
| Google Business Profile events | n8n RioSEO workflow | HubSpot Marketing Events | since 2026-08-28 | n8n sync owner |
| Video library | Airtable import | Airtable | on import | website operations |
| Future of Education posts | Substack and podcast feed import | Substack, ART19 | scheduled | PR and comms |

Not automated, and therefore edited through the Alpha WordPress MCP: team cards, bios and headshots, the intro card image or video, info packet and calendar links, navigation, the blog section, and the SEO Template page that n8n copies for new campuses.

## The n8n campus-page workflow

Workflow `ORgdHC71YJ5RawBy` on trilogyinc.app.n8n.cloud. It reads HubSpot Program records and writes Elementor fields found by CSS ID. The field map from the export inspected on 2026-09-09:

| HubSpot property | Elementor target (CSS ID) |
| --- | --- |
| contact_number | `phone` description, phone visibility, JSON-LD telephone |
| school_address | `address` description, map address and visibility |
| grade levels | `address` title, page title, SEO title |
| school name, city, state | `title`, SEO, OpenGraph and X titles and descriptions |
| website copy with region, city and name substitutions | `content_title`, `content_body_1` to `content_body_4`, `attend_cta_button` |
| tuition_usd_yearly | `tuition` description |
| email | `email` description, JSON-LD email |
| cognia_accredited | `cognia_yes` and candidate badge visibility and text |
| school name | `gallery_title`, `faq_title`, `team_title`, `team_top_title` |
| form_program_interest_label | `hubspot_events` shortcode `[hubspot_events school="<label>" show_filters="false" limit="3"]` |
| admission_link | `resource_4` link (Apply) |

Rules that follow:

- A fact that is wrong on the page is fixed in HubSpot, then the sync runs. A WordPress edit to one of these targets lasts until the next run.
- Preserve required CSS IDs: the active all-items writer throws when a nonempty update cannot find a required target. `address` is explicitly optional. Raleigh used an `address-disabled` override historically; any temporary override needs the ticket, owner and restoration condition and must not be generalized to required IDs.
- Layout changes to a campus page must keep the CSS IDs the workflow expects. In December 2025 a new events section dropped `events_subtitle` and the daily run failed until those targets were removed from the flow. The SEO Template page must be updated with any approved layout change, because new campus drafts are cloned from it.
- New campus pages: the October 7 active export clones template 6140 for eligible Programs with Post ID -1. No enabled campus allowlist or extra Announced-only gate was found. The run may also update existing campuses. Prove the returned positive ID, actual page status and completed content writes; Cristi describes draft creation but the export does not establish the clone endpoint default. Website operations finishes unsynchronized content under the ticket protocol.
- The launch sentence is confirmed as `content_body_4`, supplied by Program `website_campus_intro`. Fixed-copy sheet values supply the other main intro blocks; the Dynamic-copy branch is disabled. Blank source values may be skipped, leaving old destination content. Verify actual readback and the next scheduled publication.

## The events plugin stack

HubSpot Marketing Event, Public = Yes, with a form program interest, event type, display title, times with timezone, and a registration link. The plugin imports eligible events into the `hubspot_event` post type with `event_type` and `program_interest` terms, about every 30 minutes and on manual sync. The aggregate page is an unscoped query over that store; each campus page has a shortcode scoped by the program-interest label, and its container carries `data-has-school="true"` when scoped. Global events are events with many program-interest terms, not an event type.

Where events go wrong, in diagnosis order:

1. Not in the plugin debug log: the internal form program interest does not match the plugin setting or the WordPress term slug. Display-name renames do not propagate. Orange County versus Lake Forest is the standing example.
2. In the log but not imported: public flag, metadata, connection, or sync range. Public = Yes edits inside the last four hours are within the grace period; a past event never files.
3. Imported but missing from a campus page: the campus shortcode is absent, unscoped (`data-has-school="false"`), or points at the wrong label. Park City and La Jolla were found unscoped on 2026-07-13.
4. Wrong campus's events on a page: same shortcode problem. Never hide the events by privatizing them in HubSpot.

Nobody edits `hubspot_event` posts by hand and nobody flips the public flag as a website fix, because the flag drives other HubSpot workflows and the Google Business Profile push. Hailey has proposed feeding the site from APEX events directly (2026-08-28); until decided, HubSpot Marketing Events remain the source.

## Other authenticated writers on the same pages

Besides the Alpha WordPress MCP, the APEX hosted agent writes to alpha.school on its own: it saves Elementor pages through `apex-elementor/v1` and through the broad `custom/v1/update-elementor-page` route (campus intro, phone, and program edits), uploads staff headshots, sets the events plugin's program-interest filter through `apex-elementor/v1/event-filter`, and purges Elementor and WP Engine caches with its own credentials. It runs on a five-minute GitHub Actions schedule when enabled, with live edits behind feature flags and pilot task lists. An Elementor MCP tools server with an APEX compatibility shim, the WordPress core abilities API, and 15 admin-level users are also present. Any of them can change a page between an agent's prepare and apply. The MCP's semantic hash check and the post-apply verify ring exist for this reason, and every MCP apply records its APEX ticket so the two audit trails meet.

## How an event becomes public, end to end

1. A requester submits the APEX event request form (or Alpha Experiences posts it). The form's public or private choice stays inside APEX.
2. Hailey pushes the event to Goldcast, which creates the registration page and stores the registration URL on the APEX event.
3. An allowlisted user pushes the event to HubSpot. APEX writes the registration link, location, display date and time, event type, and the form program interest that the website plugin filters on. Later edits re-push automatically.
4. Hailey sets Public = Yes on the HubSpot marketing event by hand. Nothing in APEX does this.
5. Within about 30 minutes the WordPress plugin imports the event; within four hours the observer expects it on `/upcoming-events/` and on the campus strip (spec/check-bundle.generated.json site.events.sync.public).
6. Canceling in APEX sets Public = No in HubSpot and the card drops on the next sync.

## Who to ask

| Question | Role | Person (n8n/former-role correction 2026-10-07; other entries 2026-09-15) |
| --- | --- | --- |
| Run or inspect the n8n campus or Locations workflow; which CSS IDs are controlled | n8n sync owner | Replacement unconfirmed; see `registry/owners.json` and protocol 1d |
| Events plugin settings, debug log, manual sync, WordPress and Elementor finishing | events plugin owner | Garbhit Sharma |
| HubSpot Program creation and properties; Finalsite and HubSpot form routing | HubSpot program admin | Farhan Raja |
| Event content, public flag, APEX to HubSpot event automation | HubSpot owner | Hailey McSpadden |
| Campus data defaults, HubSpot governance | HubSpot admin | Resolve current holders from `registry/people.json`; Dmitry is no longer active |
| Map API and map app | growth map owner | not named |

Shared-reader recovery and downstream validation follow `playbook/integrations/program-data-reliability.md`. Rio Locations (`giviJTDi7Q3uM4HM`) and Rio events (`tq6IV3TeqlBaoWlg_dLkj`) are separate workflows; IDs verified October 7 in `registry/sources.json`.
