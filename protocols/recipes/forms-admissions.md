# Recipe: Forms and Admissions Paths

## Inputs

- Source and destination URLs
- HubSpot portal and form ID
- HubSpot Program and `submission_campus`
- Confirmation page
- Downstream workflows, messages and ownership
- UTM behavior
- Approved safe test identity and cleanup

## Procedure

1. Read `registry/forms.json` and the source-authority row.
2. Identify whether the requested change belongs in HubSpot, the Program record, WordPress, Finalsite, scheduling or another application.
3. Use staging or an approved isolated test path.
4. Prepare the narrowest source or link change.
5. Submit once with the approved test identity when end-to-end testing is authorized.
6. Verify route, hidden values, contact result, assignment, workflow enrollment, confirmation, analytics and absence of unintended communication or charge.
7. Clean up or label the test record and restore disabled workflows.

## Stop conditions

Unknown form ID, Program, campus value, side effects, confirmation, payment behavior, owner or cleanup procedure stops the work.

## Production rule

Reachable URL alone is not completion. Attach safe end-to-end evidence or owner-provided downstream evidence.
