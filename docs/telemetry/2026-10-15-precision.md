# Website agent telemetry (since 2026-09-01)

Generated 2026-10-16T00:18:05.578Z by tests/telemetry-report.mjs from WordPress receipts and APEX website-family Requests. Read only.

## Writes to alpha.school (WordPress receipts)

| Measure | Value |
| --- | ---: |
| Receipts stored | 200 |
| Applied | 200 |
| Idempotent replays (noop) | 0 |
| Distinct tickets written | 60 |
| Distinct runs | 39 |

By operation:

| Key | Count |
| --- | ---: |
| regenerate-elementor-css | 70 |
| apply-elementor-content-patch | 50 |
| flush-wp-engine-cache | 42 |
| apply-elementor-structure-patch | 14 |
| apply-elementor-staff-patch | 8 |
| apply-post-fields-patch | 8 |
| upload-media-from-apex-asset | 7 |
| create-draft-from-template | 1 |

## Queue (APEX website-family Requests)

| Measure | Value |
| --- | ---: |
| Open or completed website Requests seen | 1050 |
| Touched since 2026-09-01 | 909 |
| Completed in the window | 600 |
| Median days request to completion (window) | 4.3 |
| p95 days request to completion (window) | 33.0 |
| Carrying an intake contract (intakeHash) | 416 |
| Missing Info (waiting on a requester) | 49 |

All by status:

| Key | Count |
| --- | ---: |
| COMPLETED | 741 |
| BLOCKED | 208 |
| MISSING_INFO | 49 |
| FOR_REVIEW | 45 |
| IN_PROGRESS | 3 |
| NOT_STARTED | 2 |
| CANCELLED | 2 |

Touched in the window by status:

| Key | Count |
| --- | ---: |
| COMPLETED | 600 |
| BLOCKED | 208 |
| MISSING_INFO | 49 |
| FOR_REVIEW | 45 |
| IN_PROGRESS | 3 |
| NOT_STARTED | 2 |
| CANCELLED | 2 |

## Observer precision (first precision-standard report, tickets filed 2026-09-01 to now)

Precision is the share of observer tickets that ended in a site change (an applied mutation receipt carrying the ticket id, or resolutionKind EXECUTED), a source change (an audit line on the ticket), or a recorded decision (Blocked with DECISION NEEDED, or `customFields.resolutionKind` blocked-decision). False-positive and fixed-elsewhere rates read `customFields.resolutionKind`. Median days open counts closed tickets to completion and open tickets to the report time. The receipt store's earliest receipt is 2026-10-06; a site change before that date leaves no receipt and is not counted.

| Measure | Value |
| --- | ---: |
| Observer tickets filed | 446 |
| Precision | 24.9% (111 of 446) |
| Ended in a site change | 8 |
| Ended in a source change | 48 |
| Ended in a recorded decision | 55 |
| False-positive rate | 21.3% (95) |
| Fixed-elsewhere rate | 11.0% (49) |
| Aged out | 6 |
| Check retired or cleared | 23 |
| Unclassified (no resolutionKind, no evidence-backed end) | 164 |
| Closed with no resolution kind (every close should record one) | 90 |
| Still open | 161 |
| Median days open | 6.1 |

Per observer run (`customFields.runId`):

| Observer run | Filed | Precision | Site change | Source change | Decision | False positive | Fixed elsewhere | Aged out | Retired or cleared | Unclassified | Open | Median days open |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| site-events-2026-09-08T03-27-24-684Z | 37 | 0.0% | 0 | 0 | 0 | 37 | 0 | 0 | 0 | 0 | 0 | 0.0 |
| site-full-2026-10-14T21-17-06-893Z | 36 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 33 | 33 | 1.1 |
| site-events-2026-09-28T17-26-15-704Z | 24 | 45.8% | 8 | 3 | 0 | 0 | 0 | 0 | 0 | 13 | 15 | 17.3 |
| site-full-2026-10-02T21-18-33-057Z | 18 | 66.7% | 0 | 12 | 0 | 0 | 0 | 0 | 3 | 3 | 3 | 2.8 |
| site-full-2026-10-15T21-18-18-707Z | 14 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 14 | 14 | 0.1 |
| site-full-2026-10-15T06-16-27-172Z | 11 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 10 | 10 | 0.7 |
| site-events-2026-09-28T21-32-40-361Z | 10 | 20.0% | 0 | 2 | 0 | 0 | 0 | 0 | 6 | 2 | 2 | 1.0 |
| site-full-2026-09-24T22-10-26-626Z | 6 | 33.3% | 0 | 1 | 1 | 1 | 0 | 0 | 0 | 3 | 5 | 21.1 |
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
| site-events-2026-09-12T21-21-37-429Z | 5 | 60.0% | 0 | 0 | 3 | 0 | 2 | 0 | 0 | 0 | 3 | 33.1 |
| site-events-2026-09-12T23-20-57-408Z | 5 | 40.0% | 0 | 0 | 2 | 0 | 3 | 0 | 0 | 0 | 2 | 11.7 |
| site-events-2026-09-13T01-03-30-900Z | 5 | 60.0% | 0 | 0 | 3 | 0 | 2 | 0 | 0 | 0 | 3 | 33.0 |
| site-events-2026-09-17T16-27-39-924Z | 5 | 100.0% | 0 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 5 | 28.3 |
| site-full-2026-09-03T22-26-51-465Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 | 4.9 |
| site-full-2026-09-04T02-32-10-641Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 3 | 0 | 4.7 |
| site-full-2026-09-04T18-26-41-789Z | 5 | 100.0% | 0 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 5 | 41.2 |
| site-full-2026-09-04T19-22-20-780Z | 5 | 80.0% | 0 | 2 | 2 | 0 | 0 | 0 | 0 | 1 | 4 | 41.2 |
| site-full-2026-09-04T20-00-04-070Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 | 0.1 |
| site-full-2026-09-04T20-21-06-206Z | 5 | 80.0% | 0 | 1 | 3 | 0 | 0 | 0 | 0 | 1 | 4 | 41.2 |
| site-full-2026-09-04T20-52-51-155Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 | 0.1 |
| site-full-2026-09-04T21-04-18-793Z | 5 | 20.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 4 | 1 | 0.1 |
| site-full-2026-09-04T21-42-15-812Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 | 0.1 |
| site-full-2026-09-04T23-14-05-254Z | 5 | 40.0% | 0 | 1 | 1 | 2 | 0 | 0 | 0 | 1 | 1 | 19.7 |
| site-full-2026-09-07T22-21-45-216Z | 5 | 0.0% | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 28.9 |
| site-full-2026-09-08T19-55-14-186Z | 5 | 0.0% | 0 | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 15.9 |
| site-full-2026-09-12T10-21-54-625Z | 5 | 0.0% | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 12.3 |
| site-full-2026-09-12T22-21-40-009Z | 5 | 40.0% | 0 | 0 | 2 | 0 | 3 | 0 | 0 | 0 | 2 | 11.8 |
| site-full-2026-09-14T14-27-34-304Z | 5 | 0.0% | 0 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 10.1 |
| site-events-2026-09-03T21-21-27-629Z | 4 | 25.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 3 | 1 | 5.6 |
| site-events-2026-09-08T23-21-01-684Z | 4 | 0.0% | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 15.7 |
| site-events-2026-09-24T23-23-00-674Z | 4 | 0.0% | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 0.7 |
| site-full-2026-09-03T20-03-00-917Z | 4 | 25.0% | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 3 | 0 | 5.6 |
| site-full-2026-09-04T14-23-41-330Z | 4 | 100.0% | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 4 | 41.4 |
| site-events-2026-09-04T15-23-50-472Z | 3 | 66.7% | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 19.0 |
| site-events-2026-09-14T15-25-58-699Z | 3 | 100.0% | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 3 | 31.4 |
| site-events-2026-09-16T01-34-27-639Z | 3 | 0.0% | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 8.6 |
| site-full-2026-09-04T06-44-45-564Z | 3 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 5.9 |
| site-full-2026-09-14T02-37-37-948Z | 3 | 0.0% | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 10.6 |
| site-full-2026-09-14T22-23-32-254Z | 3 | 0.0% | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 9.8 |
| site-full-2026-09-16T18-29-20-347Z | 3 | 100.0% | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 3 | 29.2 |
| site-full-2026-09-17T18-30-32-439Z | 3 | 0.0% | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 6.9 |
| site-full-2026-09-21T18-30-51-377Z | 3 | 0.0% | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 2.9 |
| site-events-2026-09-05T05-22-07-504Z | 2 | 100.0% | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 40.8 |
| site-events-2026-09-12T20-23-21-989Z | 2 | 50.0% | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 22.5 |
| site-events-2026-09-13T17-20-05-887Z | 2 | 50.0% | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 21.6 |
| site-events-2026-09-17T15-25-26-360Z | 2 | 100.0% | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 28.4 |
| site-events-2026-09-23T05-26-28-812Z | 2 | 0.0% | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 1.5 |
| site-full-2026-09-09T22-21-56-884Z | 2 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 20.9 |
| site-full-2026-09-11T18-28-33-112Z | 2 | 100.0% | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 34.2 |
| site-full-2026-09-18T06-39-38-196Z | 2 | 50.0% | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 1 | 17.1 |
| site-full-2026-09-25T06-42-20-468Z | 2 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 | 20.7 |
| site-full-2026-09-29T21-19-29-996Z | 2 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 8.6 |
| site-full-2026-10-13T21-16-10-159Z | 2 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0.7 |
| site-events-2026-09-04T19-19-41-346Z | 1 | 100.0% | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 41.2 |
| site-events-2026-09-04T23-26-47-819Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 19.7 |
| site-events-2026-09-06T16-22-45-625Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 18.0 |
| site-events-2026-09-08T21-19-39-888Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 15.8 |
| site-events-2026-09-09T13-24-10-267Z | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 36.5 |
| site-events-2026-09-09T17-21-42-969Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 15.0 |
| site-events-2026-09-10T20-22-15-562Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 13.8 |
| site-events-2026-09-13T16-23-20-972Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 11.0 |
| site-events-2026-09-15T17-21-47-342Z | 1 | 100.0% | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 9.0 |
| site-events-2026-09-15T21-22-17-968Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 8.8 |
| site-events-2026-09-16T05-25-32-183Z | 1 | 100.0% | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 29.8 |
| site-events-2026-09-16T17-21-44-707Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 8.0 |
| site-events-2026-09-17T12-35-54-647Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 7.2 |
| site-events-2026-09-17T17-21-55-535Z | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 28.3 |
| site-events-2026-09-18T00-58-33-327Z | 1 | 100.0% | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 28.0 |
| site-events-2026-09-18T17-21-02-925Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 6.0 |
| site-events-2026-09-21T16-28-29-646Z | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 24.3 |
| site-events-2026-09-22T01-35-02-972Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 2.6 |
| site-events-2026-09-22T03-30-21-720Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 2.5 |
| site-events-2026-09-22T20-24-45-108Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0.8 |
| site-events-2026-09-24T04-31-00-588Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0.5 |
| site-full-2026-09-03T19-39-57-137Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0.5 |
| site-full-2026-09-04T10-24-34-539Z | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 41.6 |
| site-full-2026-09-04T21-59-53-828Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0.1 |
| site-full-2026-09-08T10-25-40-675Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 16.3 |
| site-full-2026-09-10T18-27-22-332Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 13.9 |
| site-full-2026-09-11T06-38-06-042Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0.7 |
| site-full-2026-09-11T22-22-46-804Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 12.8 |
| site-full-2026-09-12T02-32-06-143Z | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 33.9 |
| site-full-2026-09-13T22-22-22-594Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 10.8 |
| site-full-2026-09-14T18-28-51-741Z | 1 | 100.0% | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 31.2 |
| site-full-2026-09-17T22-23-29-038Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 6.8 |
| site-full-2026-09-21T06-51-18-117Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 3.4 |
| site-full-2026-09-23T22-24-27-914Z | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0.8 |
| site-full-2026-09-24T02-35-48-908Z | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 21.9 |
| site-full-2026-09-30T21-21-41-608Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 15.1 |
| site-full-2026-10-01T21-18-58-527Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 14.1 |
| site-full-2026-10-03T22-03-57-314Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0.4 |
| site-full-2026-10-07T21-19-13-034Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 8.1 |
| site-full-2026-10-08T21-19-06-034Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 7.1 |
| site-full-2026-10-10T06-16-01-318Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1.0 |
| site-full-2026-10-10T21-17-47-410Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 2.0 |
| site-full-2026-10-12T06-27-42-416Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0.6 |
| site-full-2026-10-12T21-17-00-479Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 3.1 |
| site-full-2026-10-13T06-19-11-463Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1.0 |
| site-full-2026-10-14T06-15-53-555Z | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0.6 |

Per observer check (`customFields.check`, or the filer's `customFields.observerCheck`):

| Check | Filed | Precision | Site change | Source change | Decision | False positive | Fixed elsewhere | Aged out | Retired or cleared | Unclassified | Open | Median days open |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| images-render | 52 | 0.0% | 0 | 0 | 0 | 3 | 0 | 0 | 2 | 47 | 47 | 1.1 |
| campus-info-packet-link-reachable | 45 | 6.7% | 0 | 0 | 3 | 18 | 0 | 0 | 0 | 24 | 3 | 4.3 |
| campus-page-stale-launch-media | 38 | 31.6% | 0 | 12 | 0 | 1 | 3 | 0 | 3 | 20 | 10 | 15.4 |
| public-event-sync | 38 | 2.6% | 0 | 1 | 0 | 12 | 10 | 4 | 5 | 7 | 0 | 8.3 |
| campus-image-identity-conflict | 34 | 5.9% | 0 | 0 | 2 | 6 | 4 | 0 | 0 | 22 | 2 | 0.1 |
| map-campus-missing-from-operations | 28 | 42.9% | 0 | 0 | 12 | 0 | 16 | 0 | 0 | 0 | 12 | 15.9 |
| campus-source-status-sentence | 26 | 88.5% | 7 | 16 | 0 | 0 | 0 | 0 | 0 | 3 | 5 | 2.8 |
| campus-layout-header-overlap | 21 | 4.8% | 0 | 0 | 1 | 18 | 0 | 0 | 1 | 1 | 1 | 16.8 |
| campus-page-grade-source-sync | 17 | 82.4% | 0 | 1 | 13 | 0 | 0 | 0 | 0 | 3 | 14 | 41.2 |
| campus-application-source-missing | 14 | 21.4% | 0 | 3 | 0 | 6 | 0 | 0 | 0 | 5 | 3 | 0.7 |
| preannouncement-community-host | 12 | 100.0% | 0 | 1 | 11 | 0 | 0 | 0 | 0 | 0 | 12 | 28.3 |
| preannouncement-community-url | 12 | 0.0% | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 11.7 |
| operations-map-address-conflict | 11 | 54.5% | 0 | 5 | 1 | 3 | 0 | 0 | 0 | 2 | 6 | 21.1 |
| route-reachable | 11 | 0.0% | 0 | 0 | 0 | 9 | 0 | 0 | 0 | 2 | 2 | 9.8 |
| campus-page-status-sentence | 8 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 7 | 1 | 1 | 1.0 |
| campus-event-filter | 7 | 0.0% | 0 | 0 | 0 | 3 | 2 | 0 | 1 | 1 | 0 | 0.5 |
| campus-registry-coverage | 6 | 16.7% | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 5 | 17.3 |
| event-registration-reachable | 6 | 0.0% | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 2 | 0 | 3.0 |
| provider-health | 6 | 66.7% | 0 | 0 | 4 | 0 | 0 | 0 | 1 | 1 | 4 | 27.9 |
| campus-schema-coordinates | 5 | 40.0% | 0 | 1 | 1 | 0 | 1 | 0 | 0 | 2 | 4 | 11.0 |
| event-page-reachable | 5 | 0.0% | 0 | 0 | 0 | 2 | 0 | 2 | 0 | 1 | 1 | 7.2 |
| campus-sister-brand-leak | 4 | 0.0% | 0 | 0 | 0 | 4 | 0 | 0 | 0 | 0 | 0 | 14.8 |
| campus-book-call-present | 3 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 3 | 21.1 |
| campus-school-schema | 3 | 33.3% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 2 | 3 | 0.1 |
| campus-application-finalsite-redirect | 2 | 100.0% | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 34.2 |
| campus-application-path | 2 | 50.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 2 | 28.1 |
| campus-calendar-link-reachable | 2 | 50.0% | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 1 | 10.5 |
| campus-image-crop-risk | 2 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 | 20.7 |
| campus-info-packet-present | 2 | 100.0% | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 41.7 |
| campus-layout-horizontal-overflow | 2 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 6.6 |
| campus-layout-offscreen-content | 2 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 6.6 |
| campus-page-source-fact-missing | 2 | 50.0% | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 2 | 10.1 |
| campus-schema-address | 2 | 100.0% | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 36.6 |
| campus-schema-name | 2 | 50.0% | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 21.0 |
| campus-schema-required-facts | 2 | 100.0% | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 2 | 31.4 |
| operations-campus-missing-from-map | 2 | 50.0% | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 14.0 |
| campus-enrollment-state-controls | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0.7 |
| campus-expired-seasonal-cta | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0.0 |
| campus-map-rendered | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1.1 |
| campus-operations-snapshot-fresh | 1 | 100.0% | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 40.8 |
| campus-page-application-source-sync | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 7.1 |
| campus-page-email-source-sync | 1 | 0.0% | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 12.8 |
| campus-page-tuition-source-sync | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 17.3 |
| duplicate-program-url | 1 | 0.0% | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0.0 |
| event-source-readable | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1.0 |
| wordpress-campus-missing-from-map | 1 | 0.0% | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 8.1 |

## Checks below the precision bar (pause candidates)

Bar from spec/filing-policy.json: at least 10 tickets filed in the last 28 days and precision under 50.0%. Open tickets count against precision on purpose. Pausing a check (row status advisory) is a recorded decision through agent/record-decision.mjs; this report never changes a row.

| Check | Filed | Precision | Ended in a change or decision | False positive | Still open | Closed with no resolution kind |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| images-render | 49 | 0.0% | 0 | 0 | 47 | 0 |
| campus-info-packet-link-reachable | 18 | 0.0% | 0 | 18 | 0 | 0 |
| campus-page-stale-launch-media | 15 | 0.0% | 0 | 1 | 10 | 1 |
| public-event-sync | 12 | 0.0% | 0 | 5 | 0 | 1 |

## What is not measured yet

Refusal reasons per decision (needs the intake agent to attach its outcome as a structured field), complete-evidence rate (needs the APEX evidence gate to record evidence profiles), and recovery time from transient failures (needs the retry taxonomy). Each is an APEX-side item in the improvement plan. Precision per shadow run (redesign workstream 8) needs the filer to write `resolutionKind: check-cleared` and the run id on auto-resolved tickets.
