# Sitewide tracking expansion

October 16, 2026: implementation requested by Matt Barge. The source contract is [website-tracking-expansion.json](../registry/website-tracking-expansion.json); it is **built-not-released**. It extends the existing measurement contract without replacing approved outcome definitions, enabling key events, authorizing identity joins or inventing a consent owner.

Runtime and tests live in `superbuilders/aeo/scripts/website-tracking/`. Deployment procedures live in `superbuilders/aeo/docs/operations/alpha-sitewide-tracking.md`. Marketing Support holds the full design specification and the interactive heat-map consumer.

The initial verified DOM bindings are homepage, Upcoming Events and Chicago. The event catalog includes navigation, visibility, signup/forms, discovery, calendar, maps, content and errors. Some are integration hooks, not connected production producers. All provider completion events are server-only in the browser contract and remain unavailable until their authority and reconciliation are implemented.

A local test does not satisfy the production release checks. Required release evidence: named consent owner, correct consent adapter behavior, live-container fingerprint, preview tests on the actual pages, required reporting definitions and processed data. Register only needed dimensions within the property quota. New collection is opt-in at the adapter, with no replay of denied-consent events.

The existing five start-event names and `destination_key` algorithm remain compatible. Existing unmatched click behavior remains the fallback; exact-control identity is never guessed from the fallback. The hero Apply control in Chicago is an anchor to Resources, so `interaction_role=anchor` distinguishes it from an actual application handoff.

The scheduled AEO integrity lane reads the canonical expansion contract and reports absent definitions, pending release and unavailable provider joins explicitly. An overall successful Actions run does not turn those into measured outcomes.

The observed newsletter form is HubSpot legacy form `1a12e7bb-59fa-4140-9773-93f11da668f8` in CTA `198135985568`, hosted at `40051392.hs-sites.com`. Its public embed loads `forms/v2-legacy.js`. The main-page popup observer is built; submission callback behavior is unverified. Do not bind the v4 adapter to this form merely because it is a HubSpot form.

Set `release.measurementStartDate` only after controlled production and processed-data checks establish a full usable reporting day. The reporter rejects date ranges beginning before this boundary, avoiding an artificial low rate from pre-instrumentation page views.
