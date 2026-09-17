# Recipe: SEO, Canonical, Schema, and Redirects

## Inputs

- Page family and canonical URL
- Exact SEO or redirect field
- Current and approved value
- Authoritative layer
- Indexability, sitemap, Markdown and LLM-export expectations
- Owner and evidence source

## Procedure

1. Determine whether WordPress, Yoast, n8n, a template, Redirection, WP Engine, Cloudflare or application code owns the field.
2. Search all redirect layers before adding a rule.
3. Resolve the canonical WordPress object.
4. Use Alpha MCP post-field or content tools only when the actor matrix permits the operation.
5. Preserve block structure and unrelated metadata.
6. Verify browser and Googlebot status, canonical, unique title, meta description, H1, schema, sitemap, redirect chain, social fields, Markdown and LLM exports.

A redirected or noindex page must not remain in LLM exports unless an explicit rule allows it.

## Stop conditions

- Two layers claim the redirect.
- The canonical destination is not approved.
- Campus metadata is n8n-controlled.
- Legal, claims or application routing is affected without its owner.
- The scheduled actor is not integrated for the required tool.

## Rollback

Restore the prior field snapshot or redirect configuration and recheck every discovery surface. A redirect loop or accidental indexing change is an incident.
