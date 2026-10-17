# Exact-control tracking pilot release, October 17

GTM container `GTM-5W56ZLQJ` version **8** was published at **2026-10-17 22:05:39 UTC** by Matt's authorized operator session. Full version 7 is the rollback. This is a pilot release, not completion of sitewide tracking or provider attribution.

The published listener SHA-256 is `747084cdbc90a2ecdd6d50464bc4a8ec40d932b6994e6cb6695556f4124dac39`. The existing listener was replaced once. The workspace contained 2 modified, 28 added and 0 deleted entities. No keys were deleted, replaced or created. No GA4 key events were promoted.

Coverage: homepage, Upcoming Events and Chicago. New collection covers exact mapped controls and their exposure; event Location/Type/search and settled results; newsletter popup opening/closing; navigation state; campus application, booking, packet, guide and calendar handoffs. Existing five action-type click signals remain elsewhere. A click is not a completed outcome.

Desktop and 390px preview checks passed. Real Safari/WebKit consent QA used HubSpot's public analytics callback and revoke method: granted menu interaction increased emitted events to 2; revocation set analytics/tracker consent false; subsequent menu-close and signup-open interactions left the count at 2 while the popup still worked. The preview-only test panel was removed and the saved listener verified byte-for-byte before publishing. Public production GTM JavaScript contains schema 2.1.0 and no test-panel code.

The existing HubSpot policy grants analytics again on reload in the tested browser, and showBanner did not show a banner. The tracker follows the vendor category. This release does not establish persistent denial or alter consent policy. Naming Matt interim owner did not approve new identity joins or broaden permissions.

The first eligible full collection date is October 18 in America/Chicago. Processed GA4 rows and actual exact-control percentages remain unverified. The daily report uses a two-day processing buffer, so October 18 becomes eligible in the October 20 scheduled run. Do not interpret earlier missing cells as zero, and do not backfill.

Daily heat-map artifact generation passed in AEO run [39073522506](https://github.com/superbuilders/aeo/actions/runs/39073522506), using the existing CHECK_BUNDLE_TOKEN and the reviewed Marketing renderer. The report retains its dated baseline until valid new aggregates exist, or preserves the prior validated report with a stale label when refresh fails.

Remaining: warehouse IAM, newsletter owning-frame integration and safe accepted-response test, subscription mapping, provider ingestion and approved joins, other templates and applications, physical-device QA, and verification after source republishes. The existing daily measurement lane owns follow-up evidence. User authorization to contact external owners remains withheld.
