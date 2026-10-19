# Plano enrollment update, October 19, 2026

Andy Gibson requested removal of Plano's campus waitlist in the screenshot supplied by Yash Chitneni. Yash approved direct application and then requested coverage of all surfaces, including the map. The approved enrolling sentence and existing application route come from the enrollment registry and HubSpot Program 29737764355.

## Delivery status

| Surface | Result | Evidence or remaining step |
| --- | --- | --- |
| HubSpot `website_campus_intro` | Updated and read back | First paragraph is `<p>[DISPLAY_NAME] is open and enrolling.</p>`; remaining paragraph unchanged |
| Campus page 6546 intro | Published, canonical public source and desktop render verified | Prepare/apply receipts 13184/13185 |
| Campus hero and resources application labels | Published, both render Apply now | Same scoped patch; routes unchanged |
| Campus intro media | No change required by this request | Existing campus video remains; no new approved image was supplied |
| Locations page 6703 Plano card | Waitlist paragraph removed; button saved as Apply now | Prepare/apply receipts 13186/13187; card has no waitlist text in public DOM, but the existing List tab is hidden, so rendered card proof remains open |
| Homepage waitlist summary | Published and verified on canonical public page | Removed only Plano link from HTML widget `8e6fd16`, path `/11/elements/1`, through signed-in Elementor UI |
| Locations waitlist summary | Published and verified on canonical public page | Removed only Plano link from HTML widget `3fd4799`, path `/2/elements/0/elements/0/elements/0`, through signed-in Elementor UI |
| Standalone map and homepage/Locations map embeds | Pending | Public map API still returns `enrollment.state=waitlist` for `program-29737764355` |
| Enrollment registry and observer literal | Prepared in PR 106 | Code-owner review required |

The map feed is `https://u7f4afjn6j.execute-api.us-east-1.amazonaws.com/production/map-locations`. Its enrollment object currently contains `state: waitlist` and `schoolYear: 2026–27`. The recorded source repository `trilogy-group/educrm-city-communities` returned 404 through both available GitHub credentials. GitHub sign-in or source-owner access is needed before preparing a map-source change. After Yash signed in to WordPress in the Codex browser, both HTML notices were edited through Elementor. Saved HTML readback and unauthenticated canonical public checks confirm Plano is absent from each summary; other listed campuses and embedded map code are preserved. A batched cache clear produced receipt 13191.

The campus FAQ's conditional reference to classes that may be waitlisted is a separate admissions policy, not a claim that the whole campus is on a waitlist. It was preserved.

## Verification and audit

Internal execution record: [APEX cmvfcpn9x000708jh91slucfw](https://apex.2hourlearning.com/intake?taskId=cmvfcpn9x000708jh91slucfw). The record was created and claimed by the operator; supported `syncedOverride` records the source-aligned edits. This does not establish a general no-APEX policy.

Campus resulting semantic hash: `57f1e672a42424942fc292ecfc6a30618a2ad9e1927750cef6183e47169f4124`. Locations resulting semantic hash: `38d67208c7e1d454c9152a44e20c419418390330f86ee4ccc88d6301ec187a1b`. The Alpha MCP patches touched exactly three campus fields and two Plano card fields. Later Elementor UI publishes removed the two notice links; the Locations editor also normalized stored Elementor settings, changing its semantic hash to `0994a4c9c15a1e55060510e7a695582ef6f61934a5b827cb1e46e1b98577b755`. The resulting homepage semantic hash is `4b8f7f2ed8dfd0ac7160e454b13a1be71c86f04cc2bfc24a4594b635e0d6fe11`. Page CSS receipts: 13188/13189; batched WP Engine cache receipt: 13190. Prepared snapshots, applied receipts, exact HTML-notice replacements and desktop capture are retained locally under `/tmp/plano-enrollment-2026-10-19/` for this session; this temporary directory is not a permanent evidence store.

The canonical campus public check returned `verified_pass`; the desktop browser confirms the enrolling sentence and both application labels with no horizontal overflow. Mobile QA remains incomplete: the browser's viewport override did not change actual `innerWidth` from 1280. No desktop capture is represented as mobile proof. No n8n workflow was changed or executed, and no map deployment occurred. The overall task remains open until all public surfaces and required QA pass.
