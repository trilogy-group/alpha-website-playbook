# From a completed website request to reusable cloud execution

The goal is one shared operating procedure usable by either operator and by the APEX hosted worker. Shared assignment makes a request available; the first valid claim owns its execution. A model is not retrained when a completion note or PR is added.

## What each record changes

| Record | Purpose | How it becomes active |
| --- | --- | --- |
| APEX request, source decisions and assets | The approved outcome and exact scope for that request | Current revision and active claim/lease checked during execution |
| APEX execution, artifacts and evidence | What was prepared, applied and actually verified | Durable checkpoints and provider receipts; incomplete work stays open |
| Playbook recipe | A reusable method and its stop conditions | An operator reads it; the hosted planner/provider must implement and test the same method |
| Registry, requirements and compiled checks | Approved facts and the expected public result | Approved merge, rebuilt bundle and adoption by the consuming observer/release |
| APEX runtime change | Ability to execute a method unattended | Tested release, enabled capability, valid request claim and successful verification |

Updating one row does not automatically update the others. Open PR prose is review material, not instructions to execute. The hosted worker does not automatically import this repository's PRs or completion notes. Each runtime change must cite the procedure it implements and distinguish isolated verification from an actual live canary.

## Concrete traces

### Kirkland biography preservation

[APEX cmvd53aca000508jwe0n8a56v](https://apex.2hourlearning.com/intake?taskId=cmvd53aca000508jwe0n8a56v) requested a new biography and preservation of the quote. The October 18 operator record says Claude Code applied the biography; Grok reviewed and closed it October 19. The reusable lesson is to recognize ordinary preservation directions, preserve every unrequested field and verify the complete biography. It is not permission to approve every staff update or to replay this completed request.

[APEX PR 518](https://github.com/trilogy-group/alpha-event-task-management/pull/518) adds a regression for “quote stays the same” and “Updated version is below”, keeps preservation placeholders out of patch values, and exercises scheduled Alpha MCP execution without a model or legacy connection. The follow-up is a candidate until its release and evidence are recorded; this document does not declare it deployed.

### Plano approved enrollment change

[PR 106](https://github.com/trilogy-group/alpha-website-playbook/pull/106) records an approved change of expected enrollment state and public-surface execution evidence. It was open when inspected October 19. Its pending registry/check changes are separate from the WordPress and HubSpot writes already made. Read the PR's current execution record for the unfinished map and QA work; do not treat a corrected campus page as completion of the full request. This document does not merge PR 106, approve its other changes, authorize a general no-APEX workflow, or change the source system for enrollment state.

## Required proof before declaring a method automatic

1. Reproduce the unsupported request shape with original requester scope, independently of later operator completion prose.
2. Implement the reusable procedure in the existing hosted path with unchanged claim, source, scope and receipt checks.
3. Verify permitted changes and rejected extra scope in tests; verify recovery and preserved fields.
4. Record the APEX implementation release and an eligible live request's claimed run, artifacts and full public result. An isolated passing test is not a live canary; a green scan completing zero requests is not execution proof.
5. Update recipes or approved expected facts when the work changes them. Routine execution evidence remains on the APEX request. Never mark the full request complete while another requested page, system or required verification remains unfinished.

Outstanding families include reorder-only intake admission, approved-asset headshot fallback, and independent review/closure of externally completed work. They need their own verified execution paths rather than a blanket bulk-staff release.
