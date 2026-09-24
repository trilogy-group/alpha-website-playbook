# Website agent telemetry (since 2026-08-25 until 2026-09-24)

Generated 2026-09-24T16:51:54.881Z by tests/telemetry-report.mjs from WordPress receipts and APEX website-family Requests. Read only.

## Writes to alpha.school (WordPress receipts)

| Measure | Value |
| --- | ---: |
| Receipts stored | 178 |
| Applied | 110 |
| Idempotent replays (noop) | 34 |
| Distinct tickets written | 22 |
| Distinct runs | 57 |

By operation:

| Key | Count |
| --- | ---: |
| regenerate-elementor-css | 56 |
| upload-media-from-apex-asset | 34 |
| flush-wp-engine-cache | 24 |
| prepare-elementor-content-patch | 14 |
| apply-elementor-content-patch | 12 |
| apply-elementor-staff-patch | 10 |
| purge-cloudflare-url | 7 |
| prepare-elementor-staff-patch | 6 |
| apply-elementor-structure-patch | 4 |
| apply-post-fields-patch | 4 |
| prepare-post-fields-patch | 4 |
| prepare-elementor-structure-patch | 3 |

## Queue (APEX website-family Requests)

| Measure | Value |
| --- | ---: |
| Open or completed website Requests seen | 755 |
| Touched since 2026-08-25 | 628 |
| Completed in the window | 423 |
| Median days request to completion (window) | 7.8 |
| p95 days request to completion (window) | 37.6 |
| Carrying an intake contract (intakeHash) | 279 |
| Missing Info (waiting on a requester) | 28 |

All by status:

| Key | Count |
| --- | ---: |
| COMPLETED | 550 |
| BLOCKED | 145 |
| MISSING_INFO | 28 |
| NOT_STARTED | 18 |
| FOR_REVIEW | 11 |
| CANCELLED | 2 |
| IN_PROGRESS | 1 |

Touched in the window by status:

| Key | Count |
| --- | ---: |
| COMPLETED | 423 |
| BLOCKED | 145 |
| MISSING_INFO | 28 |
| NOT_STARTED | 18 |
| FOR_REVIEW | 11 |
| CANCELLED | 2 |
| IN_PROGRESS | 1 |

## Observer precision (pre-redesign, tickets filed 2026-08-25 to 2026-09-24)

Precision is the share of observer tickets that ended in a site change (an applied mutation receipt carrying the ticket id), a source change (an audit line on the ticket), or a recorded decision (Blocked with DECISION NEEDED, or `customFields.resolutionKind` blocked-decision). False-positive and fixed-elsewhere rates read `customFields.resolutionKind`. Median days open counts closed tickets to completion and open tickets to the report time. The receipt store's earliest receipt is 2026-09-21; a site change before that date leaves no receipt and is not counted.

| Measure | Value |
| --- | ---: |
| Observer tickets filed | 269 |
| Precision | 34.2% (92 of 269) |
| Ended in a site change | 0 |
| Ended in a source change | 30 |
| Ended in a recorded decision | 62 |
| False-positive rate | 17.1% (46) |
| Fixed-elsewhere rate | 18.2% (49) |
| Aged out | 6 |
| Check retired or cleared | 0 |
| Unclassified (no resolutionKind, no evidence-backed end) | 78 |
| Still open | 79 |
| Median days open | 11.0 |

Per observer run (`customFields.runId`):

| Observer run | Filed | Precision | Site change | Source change | Decision | False positive | Fixed elsewhere | Aged out | Retired or cleared | Unclassified | Open | Median days open |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| site-events-2026-09-03T20-22-19-586Z | 5 | 20.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 4 | 1 | 5.0 |
| site-events-2026-09-03T23-19-33-546Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 | 1.0 |
| site-events-2026-09-04T00-55-48-944Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 4 | 0 | 6.0 |
| site-events-2026-09-04T01-29-50-666Z | 5 | 60.0% | 0 | 2 | 1 | 0 | 2 | 0 | 0 | 0 | 1 | 20.6 |
| site-events-2026-09-04T03-29-52-717Z | 5 | 40.0% | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 3 | 2 | 12.6 |
| site-events-2026-09-04T04-30-20-996Z | 5 | 20.0% | 0 | 1 | 0 | 0 | 2 | 0 | 0 | 2 | 1 | 20.5 |
| site-events-2026-09-04T05-26-55-099Z | 5 | 20.0% | 0 | 0 | 1 | 0 | 2 | 0 | 0 | 2 | 1 | 20.5 |
| site-events-2026-09-04T07-33-04-010Z | 5 | 20.0% | 0 | 0 | 1 | 0 | 2 | 1 | 0 | 1 | 1 | 20.4 |
| site-events-2026-09-04T08-34-52-881Z | 5 | 60.0% | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 2 | 2 | 19.6 |
| site-events-2026-09-04T09-32-59-911Z | 5 | 20.0% | 0 | 1 | 0 | 1 | 2 | 0 | 0 | 1 | 0 | 20.3 |
| site-events-2026-09-04T11-27-42-713Z | 5 | 60.0% | 0 | 2 | 1 | 0 | 1 | 0 | 0 | 1 | 1 | 19.1 |
| site-events-2026-09-04T12-34-13-254Z | 5 | 20.0% | 0 | 1 | 0 | 0 | 3 | 0 | 0 | 1 | 0 | 20.2 |
| site-events-2026-09-04T13-23-27-247Z | 5 | 40.0% | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 4.3 |
| site-events-2026-09-04T21-20-16-063Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 | 0.1 |
| site-events-2026-09-08T19-20-21-345Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 15.9 |
| site-events-2026-09-08T20-23-17-317Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 15.8 |
| site-events-2026-09-12T21-21-37-429Z | 5 | 60.0% | 0 | 0 | 3 | 0 | 2 | 0 | 0 | 0 | 3 | 11.8 |
| site-events-2026-09-12T23-20-57-408Z | 5 | 40.0% | 0 | 0 | 2 | 0 | 3 | 0 | 0 | 0 | 2 | 11.7 |
| site-events-2026-09-13T01-03-30-900Z | 5 | 60.0% | 0 | 0 | 3 | 0 | 2 | 0 | 0 | 0 | 3 | 11.7 |
| site-events-2026-09-17T16-27-39-924Z | 5 | 100.0% | 0 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 5 | 7.0 |
| site-full-2026-09-03T22-26-51-465Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 | 4.9 |
| site-full-2026-09-04T02-32-10-641Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 3 | 0 | 4.7 |
| site-full-2026-09-04T18-26-41-789Z | 5 | 100.0% | 0 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 5 | 19.9 |
| site-full-2026-09-04T19-22-20-780Z | 5 | 80.0% | 0 | 2 | 2 | 0 | 0 | 0 | 0 | 1 | 4 | 19.9 |
| site-full-2026-09-04T20-00-04-070Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 | 0.1 |
| site-full-2026-09-04T20-21-06-206Z | 5 | 80.0% | 0 | 1 | 3 | 0 | 0 | 0 | 0 | 1 | 4 | 19.8 |
| site-full-2026-09-04T20-52-51-155Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 | 0.1 |
| site-full-2026-09-04T21-04-18-793Z | 5 | 20.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 4 | 1 | 0.1 |
| site-full-2026-09-04T21-42-15-812Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 | 0.1 |
| site-full-2026-09-04T23-14-05-254Z | 5 | 60.0% | 0 | 1 | 2 | 1 | 0 | 0 | 0 | 1 | 2 | 19.7 |
| site-full-2026-09-07T22-21-45-216Z | 5 | 60.0% | 0 | 0 | 3 | 2 | 0 | 0 | 0 | 0 | 3 | 16.8 |
| site-full-2026-09-08T19-55-14-186Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 15.9 |
| site-full-2026-09-12T10-21-54-625Z | 5 | 0.0% | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 12.3 |
| site-full-2026-09-12T22-21-40-009Z | 5 | 40.0% | 0 | 0 | 2 | 0 | 3 | 0 | 0 | 0 | 2 | 11.8 |
| site-full-2026-09-14T14-27-34-304Z | 5 | 20.0% | 0 | 0 | 1 | 4 | 0 | 0 | 0 | 0 | 1 | 10.1 |
| site-events-2026-09-03T21-21-27-629Z | 4 | 25.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 3 | 1 | 5.6 |
| site-events-2026-09-08T23-21-01-684Z | 4 | 0.0% | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 15.7 |
| site-full-2026-09-03T20-03-00-917Z | 4 | 25.0% | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 3 | 0 | 5.6 |
| site-full-2026-09-04T14-23-41-330Z | 4 | 100.0% | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 4 | 20.1 |
| site-events-2026-09-04T15-23-50-472Z | 3 | 66.7% | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 19.0 |
| site-events-2026-09-14T15-25-58-699Z | 3 | 100.0% | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 3 | 10.1 |
| site-events-2026-09-16T01-34-27-639Z | 3 | 0.0% | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 8.6 |
| site-full-2026-09-04T06-44-45-564Z | 3 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 5.9 |
| site-full-2026-09-14T02-37-37-948Z | 3 | 33.3% | 0 | 0 | 1 | 2 | 0 | 0 | 0 | 0 | 1 | 10.6 |
| site-full-2026-09-14T22-23-32-254Z | 3 | 0.0% | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 9.8 |
| site-full-2026-09-16T18-29-20-347Z | 3 | 100.0% | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 3 | 7.9 |
| site-full-2026-09-17T18-30-32-439Z | 3 | 0.0% | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 6.9 |
| site-full-2026-09-21T18-30-51-377Z | 3 | 0.0% | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 2.9 |
| site-events-2026-09-05T05-22-07-504Z | 2 | 100.0% | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 19.5 |
| site-events-2026-09-12T20-23-21-989Z | 2 | 50.0% | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 11.8 |
| site-events-2026-09-13T17-20-05-887Z | 2 | 50.0% | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 11.0 |
| site-events-2026-09-17T15-25-26-360Z | 2 | 100.0% | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 7.1 |
| site-events-2026-09-23T05-26-28-812Z | 2 | 0.0% | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 1.5 |
| site-full-2026-09-09T22-21-56-884Z | 2 | 100.0% | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 14.8 |
| site-full-2026-09-11T18-28-33-112Z | 2 | 100.0% | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 12.9 |
| site-full-2026-09-18T06-39-38-196Z | 2 | 50.0% | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 1 | 6.4 |
| site-events-2026-09-04T19-19-41-346Z | 1 | 100.0% | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 19.9 |
| site-events-2026-09-04T23-26-47-819Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 19.7 |
| site-events-2026-09-06T16-22-45-625Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 18.0 |
| site-events-2026-09-08T21-19-39-888Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 15.8 |
| site-events-2026-09-09T13-24-10-267Z | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 15.1 |
| site-events-2026-09-09T17-21-42-969Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 15.0 |
| site-events-2026-09-10T20-22-15-562Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 13.8 |
| site-events-2026-09-13T16-23-20-972Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 11.0 |
| site-events-2026-09-15T17-21-47-342Z | 1 | 100.0% | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 9.0 |
| site-events-2026-09-15T21-22-17-968Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 8.8 |
| site-events-2026-09-16T05-25-32-183Z | 1 | 100.0% | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 8.5 |
| site-events-2026-09-16T17-21-44-707Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 8.0 |
| site-events-2026-09-17T12-35-54-647Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 7.2 |
| site-events-2026-09-17T17-21-55-535Z | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 7.0 |
| site-events-2026-09-18T00-58-33-327Z | 1 | 100.0% | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 6.7 |
| site-events-2026-09-18T17-21-02-925Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 6.0 |
| site-events-2026-09-21T16-28-29-646Z | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 3.0 |
| site-events-2026-09-22T01-35-02-972Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 2.6 |
| site-events-2026-09-22T03-30-21-720Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 2.5 |
| site-events-2026-09-22T20-24-45-108Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0.8 |
| site-events-2026-09-24T04-31-00-588Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0.5 |
| site-full-2026-09-03T19-39-57-137Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0.5 |
| site-full-2026-09-04T10-24-34-539Z | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 20.3 |
| site-full-2026-09-04T21-59-53-828Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0.1 |
| site-full-2026-09-08T10-25-40-675Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 16.3 |
| site-full-2026-09-10T18-27-22-332Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 13.9 |
| site-full-2026-09-11T06-38-06-042Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0.7 |
| site-full-2026-09-11T22-22-46-804Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 12.8 |
| site-full-2026-09-12T02-32-06-143Z | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 12.6 |
| site-full-2026-09-13T22-22-22-594Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 10.8 |
| site-full-2026-09-14T18-28-51-741Z | 1 | 100.0% | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 9.9 |
| site-full-2026-09-17T22-23-29-038Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 6.8 |
| site-full-2026-09-21T06-51-18-117Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 3.4 |
| site-full-2026-09-23T22-24-27-914Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0.8 |
| site-full-2026-09-24T02-35-48-908Z | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0.6 |

Per observer check (`customFields.check`):

| Check | Filed | Precision | Site change | Source change | Decision | False positive | Fixed elsewhere | Aged out | Retired or cleared | Unclassified | Open | Median days open |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| public-event-sync | 31 | 3.2% | 0 | 1 | 0 | 11 | 10 | 4 | 0 | 6 | 0 | 9.0 |
| campus-image-identity-conflict | 28 | 7.1% | 0 | 0 | 2 | 0 | 4 | 0 | 0 | 22 | 2 | 0.1 |
| map-campus-missing-from-operations | 28 | 42.9% | 0 | 0 | 12 | 0 | 16 | 0 | 0 | 0 | 12 | 15.8 |
| campus-info-packet-link-reachable | 27 | 11.1% | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 24 | 3 | 4.7 |
| campus-page-stale-launch-media | 24 | 50.0% | 0 | 12 | 0 | 0 | 3 | 0 | 0 | 10 | 0 | 16.1 |
| campus-layout-header-overlap | 20 | 40.0% | 0 | 0 | 8 | 11 | 0 | 0 | 0 | 1 | 8 | 10.6 |
| campus-page-grade-source-sync | 17 | 82.4% | 0 | 1 | 13 | 0 | 0 | 0 | 0 | 3 | 14 | 19.9 |
| preannouncement-community-host | 12 | 100.0% | 0 | 1 | 11 | 0 | 0 | 0 | 0 | 0 | 12 | 7.0 |
| preannouncement-community-url | 12 | 0.0% | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 11.7 |
| campus-application-source-missing | 9 | 33.3% | 0 | 3 | 0 | 1 | 0 | 0 | 0 | 5 | 3 | 0.1 |
| route-reachable | 9 | 0.0% | 0 | 0 | 0 | 9 | 0 | 0 | 0 | 0 | 0 | 9.8 |
| operations-map-address-conflict | 7 | 71.4% | 0 | 4 | 1 | 0 | 0 | 0 | 0 | 2 | 5 | 15.1 |
| event-registration-reachable | 6 | 0.0% | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 2 | 0 | 3.0 |
| provider-health | 6 | 83.3% | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 1 | 5 | 13.7 |
| event-page-reachable | 4 | 0.0% | 0 | 0 | 0 | 2 | 0 | 2 | 0 | 0 | 0 | 8.0 |
| campus-event-filter | 3 | 0.0% | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 1 | 0 | 20.5 |
| campus-schema-coordinates | 3 | 66.7% | 0 | 1 | 1 | 0 | 1 | 0 | 0 | 0 | 2 | 11.0 |
| campus-sister-brand-leak | 3 | 0.0% | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 15.7 |
| images-render | 3 | 0.0% | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 12.3 |
| campus-application-finalsite-redirect | 2 | 100.0% | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 12.9 |
| campus-info-packet-present | 2 | 100.0% | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 20.3 |
| campus-schema-address | 2 | 100.0% | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 15.3 |
| campus-schema-name | 2 | 50.0% | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 10.4 |
| campus-schema-required-facts | 2 | 100.0% | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 2 | 10.1 |
| campus-application-path | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 19.8 |
| campus-layout-horizontal-overflow | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 12.3 |
| campus-layout-offscreen-content | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 12.3 |
| campus-operations-snapshot-fresh | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 19.5 |
| campus-page-email-source-sync | 1 | 0.0% | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 12.8 |
| campus-school-schema | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 19.7 |
| operations-campus-missing-from-map | 1 | 100.0% | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 6.7 |

## What is not measured yet

Refusal reasons per decision (needs the intake agent to attach its outcome as a structured field), complete-evidence rate (needs the APEX evidence gate to record evidence profiles), and recovery time from transient failures (needs the retry taxonomy). Each is an APEX-side item in the improvement plan. Precision per shadow run (redesign workstream 8) needs the filer to write `resolutionKind: check-cleared` and the run id on auto-resolved tickets.
