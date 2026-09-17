# Legal, Campaign, Review, and Sandbox Pages

## Legal pages

- A named legal or executive owner approves the exact text.
- The page has a canonical URL, semantic H1, effective or reviewed date, and change history.
- Legal text is not paraphrased by an agent.
- Indexability and navigation placement are explicit.
- A legal change is verified on desktop and mobile and does not break consent, forms, or footer links.

The legal owner and review cadence are not yet recorded. Unattended legal edits therefore fail closed.

## Campaign landing pages

- Campaign owner, audience, claim source, conversion action, start date, end date, and archival behavior are recorded.
- Forms and UTMs follow the admissions and forms runbook.
- Seasonal copy and popups expire on the approved date.
- The page has one canonical and an explicit index or noindex decision.
- Expired campaigns are redirected, archived, or retained according to an approved rule, not left ambiguous.

## Review pages and sandboxes

- Draft review pages remain unpublished or noindex.
- They do not enter sitemaps, Markdown exports, `llms.txt`, or `llms-full.txt`.
- A review URL is clearly labeled and cannot be confused with public completion evidence.
- Test forms, analytics, emails, webhooks, and external writes are disabled or isolated.
- Review artifacts have an owner and expiration date.
- Publishing requires a separate eligibility and production check.

## Confirmation pages

Internal application or form confirmation pages are normally noindex and excluded from LLM exports unless a documented page-family requirement says otherwise. They must remain reachable through the intended journey and must not expose submitted values.
