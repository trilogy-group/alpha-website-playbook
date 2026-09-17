# Forms and Admissions Runbook

Last verified: September 17, 2026  
HubSpot portal: `40051392`

## Scope

This runbook covers public inquiry, application, booking, confirmation, and payment-related paths that begin on `alpha.school`. These paths can create or route real parent records. Testing must avoid accidental submissions, emails, payments, or downstream automation.

## System model

```text
Website CTA or form
    -> HubSpot form or approved application route
    -> submission_campus and tracking context
    -> contact creation or update
    -> campus and admissions routing
    -> Finalsite, scheduling, payment, or confirmation destination
    -> downstream communication and reporting
```

The exact form inventory is `registry/forms.json`. Unknown form IDs, owners, destinations, and side effects remain blockers for mutation.

## Source rules

- Campus Apply URLs and related routing values come from HubSpot Program fields or the HubSpot Program administrator.
- `submission_campus` must use the approved value for the exact Program. Never infer it from the URL slug.
- Booking and calendar URLs come from the mapped HubSpot field or calendar owner.
- A confirmation page is part of the form contract. Do not change it without checking conversion, analytics, and follow-up dependencies.
- A payment or paygate destination requires the admissions or finance owner. A website ticket alone cannot invent pricing or payment behavior.

## Before changing a CTA or form

Record:

- Source page and canonical URL
- CTA or form label
- HubSpot portal and form ID
- Current and intended destination
- `submission_campus` value
- HubSpot Program object ID
- Finalsite or scheduling destination
- Confirmation page
- Contact, workflow, email, and analytics side effects
- UTM and referral parameters that must survive
- Owner approval
- Safe test identity and cleanup plan

If any of these are material to the requested path and unknown, stop and route to the form or HubSpot Program owner.

## Safe QA

1. Prefer a staging or test form that cannot enroll a real parent.
2. Use a clearly labeled approved test contact and non-deliverable or controlled inbox.
3. Disable or isolate emails, tasks, SMS, payments, and sales assignment where the owner confirms it is safe.
4. Verify hidden and query-derived values before submission.
5. Submit once.
6. Verify the browser destination, contact fields, Program routing, owner assignment, workflow enrollment, analytics event, and confirmation page.
7. Remove or label the test record according to HubSpot policy.
8. Restore any temporarily disabled workflow and verify its active version.

Do not test a live payment, send a real parent communication, or create a production admissions task without explicit approval.

## UTM behavior

Global JavaScript propagates UTM values across links and form journeys. QA must preserve the base destination while allowing legitimate tracking parameters such as `_gl`, `_ga`, and approved UTM values to appear.

Check:

- The base host and path remain correct.
- Campus identity is not replaced by a tracking parameter.
- UTMs survive the intended number of hops.
- Personal or sensitive data is not placed into query parameters.
- A redirect does not drop the application or campus selection.

## Failure diagnosis

| Failure | Likely layer |
| --- | --- |
| Wrong CTA URL stored on page | HubSpot Program, n8n mapping, or direct WordPress CTA |
| Correct CTA but wrong campus after submission | `submission_campus`, hidden field, or downstream routing |
| Form submits but no contact appears | HubSpot embed, consent, blocking script, portal or form ID |
| Contact exists but wrong owner or sequence | HubSpot workflow or campus mapping |
| Application opens but wrong school or grade | Program route or Finalsite mapping |
| Correct journey but analytics missing | GTM, Google tag, consent, or event configuration |
| Tracking parameters appear on the correct scheduling URL | Usually expected; compare the base URL before filing a defect |

## Production completion

A form or admissions ticket requires more than a reachable link. Verify the end-to-end outcome approved for the ticket. At minimum, verify logged-out reachability, exact campus route, safe test result or owner-provided evidence, confirmation behavior, and absence of unintended downstream actions.

## Inventory gaps

Before unattended form changes can be allowed, record:

- All active HubSpot form IDs and pages
- Form owners
- Approved `submission_campus` values
- Finalsite destinations
- Payment or paygate owners and routes
- Confirmation pages
- Workflow and communication side effects
- Safe QA identities and cleanup procedure
- Tracking and consent dependencies
