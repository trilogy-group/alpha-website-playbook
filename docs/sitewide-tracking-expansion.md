# Sitewide tracking expansion

## Current release: October 19, 2026

**GTM version 12 is live**, published at 20:18:06 UTC in GTM-5W56ZLQJ. Only listener tag 40 changed. Rollback: version 11. The measurement health contract now requires version 12 or newer, so reverting to an older container flags the missing release. An intentional rollback must be recorded as degraded coverage until the affected controls are restored. Canonical release state is in `registry/website-tracking-expansion.json` under `release.comprehensiveControls`; the tooling registry records the same version. Earlier dated notes below are historical.

Coverage includes the four homepage commitment/Guides buttons, individual public content and event-card links, campus contact/resources/gallery/video/FAQ/blog controls and navigation/footer links. The 46-page source audit accounts for 15,332 interactive elements with 94 definitions, adapters and explicit exceptions. Hidden markup is included; source coverage is not rendered or delivery proof. The public compiled listener passed 10,604 click cases plus matching deny/revoke cases. Browser preview verified a new control exposure and GA4 tag firing; processed per-control receipts remain pending.

[Production verification run 39319504962](https://github.com/superbuilders/aeo/actions/runs/39319504962) confirmed version 12, GA4 report access, required dimensions, all 44 mapped campuses and zero unmapped source controls across 46 pages. Processed recent signals are delivery evidence, not new-control rates. The overall status remains degraded for the named integrations.

First full new-control day: October 20. Earliest scheduled complete-day rates after the existing processing buffer: October 22. Existing older controls retain their own earlier measurement dates. Combined groups and exact item rates are distinct. A click is not provider completion, and non-clickers are not site exits.

Remaining dependencies: owning newsletter form/GTM-KNSZSMLS access for field/start signals; source integration for internal map/Community controls; BigQuery export read access; verified provider reconciliation/joins. Do not enable the field flag without verified selectors and consent forwarding. No real form submission was performed. No keys or consent settings changed, and no external messages were sent.

Release evidence: `superbuilders/marketingsupport/projects/alpha-website-heatmap/evidence/comprehensive-2026-10-19/`. Full status: `projects/alpha-website-heatmap/COMPREHENSIVE-TRACKING-2026-10-19.md` in that repository.


October 16, 2026: implementation requested by Matt Barge. The source contract is [website-tracking-expansion.json](../registry/website-tracking-expansion.json); it is **built-not-released**. It extends the existing measurement contract without replacing approved outcome definitions, enabling key events, authorizing identity joins or inventing a consent owner.

Runtime and tests live in `superbuilders/aeo/scripts/website-tracking/`. Deployment procedures live in `superbuilders/aeo/docs/operations/alpha-sitewide-tracking.md`. Marketing Support holds the full design specification and the interactive heat-map consumer.

The initial verified DOM bindings are homepage, Upcoming Events and Chicago. The event catalog includes navigation, visibility, signup/forms, discovery, calendar, maps, content and errors. Some are integration hooks, not connected production producers. All provider completion events are server-only in the browser contract and remain unavailable until their authority and reconciliation are implemented.

A local test does not satisfy the production release checks. Required release evidence: named consent owner, correct consent adapter behavior, live-container fingerprint, preview tests on the actual pages, required reporting definitions and processed data. Register only needed dimensions within the property quota. New collection is opt-in at the adapter, with no replay of denied-consent events.

The existing five start-event names and `destination_key` algorithm remain compatible. Existing unmatched click behavior remains the fallback; exact-control identity is never guessed from the fallback. The hero Apply control in Chicago is an anchor to Resources, so `interaction_role=anchor` distinguishes it from an actual application handoff.

The scheduled AEO integrity lane reads the canonical expansion contract and reports absent definitions, pending release and unavailable provider joins explicitly. An overall successful Actions run does not turn those into measured outcomes.

The observed newsletter form is `1a12e7bb-59fa-4140-9773-93f11da668f8` in HubSpot CTA `198135985568`, hosted at `40051392.hs-sites.com`. The active embed is `/_hcms/forms/embed/v3.js`; `forms/v2-legacy.js` appears only in an Internet Explorer conditional. The parent `HubSpotCallsToActions` API exposes ready and accepted-submission callbacks. The adapter binds exact CTA/form IDs and reads no submitted values. October 17 preview verified `funnel_form_ready` reaching the intended GA4 tag. Accepted submission, active subscription, field starts and field diagnostics remain unverified. The popup observer separately measures actual open/close state; ready can fire before the popup is visible and is not an impression.

Desktop preview also verified native keyboard selection of Atlanta and Information Session: each changed filter emitted one `event_filter_change` and one `event_results_shown`, with `2-5` matching the displayed results. Search uses a controlled signal, never the typed query. Phone-width (390 × 844) preview now also verifies navigation open/close, signup, both pickers/search and Chicago handoffs. Physical touch-device behavior, processed mobile classification and deployed deny/revoke consent QA remain open.

The existing export reader now has a cost-capped, dry-run-first aggregate runner. It returns only allowlisted day/page/device/event/control counts from the existing BigQuery dataset, with strict schema and pagination checks. Counts are collection coverage, not conversion rates. Raw-table access, real SQL validation and scheduled execution remain unverified/disabled; no warehouse access grants or billing changes were made.

Set `release.measurementStartDate` only after controlled production and processed-data checks establish a full usable reporting day. The reporter rejects date ranges beginning before this boundary, avoiding an artificial low rate from pre-instrumentation page views.

October 17 ownership update: Matt Barge confirmed interim visitor-data/consent ownership. The canonical measurement and expansion contracts now record this decision. Provider joins and field collection remain separately gated; naming an owner is not evidence that those integrations passed QA.


October 17 subscription access: Matt approved adding only `communication_preferences.read` to the existing Alpha Website Funnel Reporting service key. [AEO run 39072109647](https://github.com/superbuilders/aeo/actions/runs/39072109647) returned HTTP 200 and 16 definitions using the existing GitHub reporting secret. No keys were deleted, rotated, replaced or created; all prior scopes remain. The probe retains IDs and flags only, never contact records or arbitrary definition text. `authorityReadVerified` for subscription outcomes remains false: definitions do not verify individual status, form mapping or conversion. The exact form's Forms v3 `legalConsentOptions` contains only `type: none`; portal-wide subscription behavior remains unverified. Inside-form tracking still needs the owning source or access to its separate GTM container.
