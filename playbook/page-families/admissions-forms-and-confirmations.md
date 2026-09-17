# Admissions, Forms, Applications, and Confirmation Pages

## Purpose

These pages convert a parent's interest into an inquiry, call, application, or payment step. They can create records and trigger communication, so their quality bar includes downstream behavior.

## Requirements

- Every entry page has one canonical URL, semantic H1, unique metadata, and clear next action.
- Every CTA and form identifies its HubSpot Program, `submission_campus`, destination, confirmation behavior, and owner.
- Application links resolve to the approved Finalsite or other application route for the exact campus.
- Booking links resolve to the approved scheduling route. Legitimate analytics query parameters do not make the base route wrong.
- Hidden fields and UTM values preserve campus identity through the journey.
- Confirmation pages state the completed action and next step without exposing private data.
- Internal confirmation or review pages are noindex unless explicitly approved for search.
- Payment or paygate pages display only approved amounts and owners, use the approved payment system, and are never tested with a real charge without explicit approval.
- Forms must remain usable with consent controls, keyboard navigation, supported browsers, and mobile layouts.
- Safe QA follows `playbook/integrations/forms-and-admissions.md`.

## Stop conditions

Stop when the form ID, Program object, `submission_campus`, downstream workflow, confirmation page, payment behavior, or safe test procedure is unknown.

## Completion

Link reachability is not enough. Evidence must cover the approved end-to-end journey, including destination, routing, contact or test record when allowed, confirmation, and absence of unintended emails, tasks, SMS, or payments.
