# Staff removals and the APEX learning loop

A clear Request can pass intake and still fail execution when the two parsers do
not recognize the same form fields or prose. Record this as an internal capability
gap, with the failing stage and owner, rather than asking the requester to refile.

The October 19 examples exposed three reusable cases: a standard EFFECTIVE DATE
section, an explicit self-removal with relocation background, and a verified
requested-name/public-card-name difference. Notes explicitly saying ancillary
changes will arrive as separate Requests do not authorize those changes now.
Holds, ambiguous identity, extra current scope and conflicting pages still stop
execution.

## How the repositories work together

| System | Owns | Becomes active through |
| --- | --- | --- |
| Playbook | Procedure, source authority, reviewed facts and QA rules | Approved merge and adoption by the consumer |
| APEX | Request scope, routing, claim, execution, evidence and closure | Tested application/worker release |
| Alpha WordPress MCP | Exact preparation, guarded apply, readback and restore | Compatible deployed provider capability |

For each newly found scenario, record the original failure, reusable rule,
accepted and refused regression examples, implementation PR, release commit and
actual hosted verification run. Keep routine receipts/evidence on the Request.
Do not treat completion prose as model training or an open PR as active policy.

APEX implementation: `src/lib/staff-removal-contract.ts`;
`src/lib/staff-public-identity.ts`; tests
`workers/hosted-agent/test/staff-removal.test.ts` and
`src/lib/staff-public-identity.test.ts`. Reviewed mappings live in `registry/staff-public-identities.json`; APEX adopts a
reviewed snapshot in `src/lib/staff-public-identities.json`. Adoption is explicit
and regression-tested, never a runtime pull of arbitrary repository changes.
The identity mechanism is a reviewed exact
mapping of requested name, email and canonical page to public name, never fuzzy
nickname matching. It currently applies to removal planning. Additional operation
families need their own adoption tests before being declared supported.

## Review and evidence

For a removal, capture the remaining Team section/adjacent cards rather than
requesting an impossible crop of the removed card. Prove the removed person's
name, photo and card are absent, sibling cards/order/media preserved, and any
other campus profile untouched. Include desktop/mobile section and page evidence,
whole-page checks and shared-cache checks. A geometry measurement without decoded
image proof is not the complete photo check. A skipped check remains unverified.

For Review means execution and required QA are complete, awaiting acceptance;
it is not the place to hide unfinished QA. If whole-page checks find unrelated
pre-existing issues, record and deduplicate those findings, identify their owner,
and record the remaining verification decision explicitly. Do not silently expand
the original Request or call the full page verified. Review closure remains an
explicit action; this change does not create a scheduled reviewer.

Status: candidate procedure/runtime alignment. Record the APEX PR, release and
live canary before declaring unattended support live.
