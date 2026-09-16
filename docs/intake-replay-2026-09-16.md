# Intake agent replay, September 16, 2026

Dry run of `agent/intake.mjs` over the open APEX website queue as saved at 2026-09-16 (no writes). Purpose: see what the agent would do to every open ticket before it is allowed to write.

## Staff-submitted website tickets (112 open)

| Outcome | Count | Meaning |
| --- | --- | --- |
| Ready for execution | 47 | Website class, inputs complete: staff cards, copy, links. These are the MCP backlog. |
| Routed | 46 | Not a page edit: 27 packets (packet owner), 7 events (HubSpot owner), 6 map and community (expansion), 7 program facts (Farhan), 5 platform (Yash), 1 mapping (Cristi). |
| Missing Info | 16 | 9 staff additions lack title or bio; 5 lack the page URL; 1 removal lacks the name; 1 application route lacks a page. |
| Unclassifiable | 3 | Two Texas Sports Academy tickets and one "Website Update" from April; stay with the operators with the reason. |

Owner distribution after routing: Matt 86 (website classes plus packets), Farhan 7, Hailey 7, Ashley Rahr 6, Yash 5, Cristi 1. Before routing every one of the 112 was on Matt and Yash.

## Observer tickets on alpha.school (84 open)

| Outcome | Count | Meaning |
| --- | --- | --- |
| Diagnosed, data defect | 12 | HubSpot field contradicts the state: Farhan. |
| Diagnosed, no defect | 22 | Page already matches its source (Greenwich, South Bay LA coordinates, grade tickets): For Review, closes on observer rerun. |
| Routed | 31 | 19 layout (Elementor owner, falls back to Yash), 7 observer health (Matt), 3 packets, 2 events. |
| Missing Info | 8 | 5 media identity and 3 launch copy without an approved asset in the registry. |
| Needs a rule | 10 | Link, brand-leak, and event elements have no expected-value rule in the requirements spec yet. |

## What the replay changed before it was trusted

- Five request classes did not exist: event requests, map and community buttons, bulk staff rosters from a deck, launch-copy requests, and platform work. Without them 45 tickets fell into "copy". After: 21.
- The form's "Other" type is the dominant source of misclassification; the classifier now reads the request text.
- Two roles had no registered person (Elementor owner, observer owner). Layout and health tickets now fall back to Yash and Matt.
- A page that already matches its source is no longer sent to the source owner; it goes to review and the observer rerun closes it.

## Not yet proven

Routing accuracy is judged by reading the decisions, not by comparison with historical resolutions, because APEX does not record who actually resolved a ticket. The first live batch, reviewed by Matt and Yash, is the accuracy test. Requester notification is not part of the agent: it depends on APEX clarification email being re-enabled.
