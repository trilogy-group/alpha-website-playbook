# Credential access for Codex website work

Status: operator runbook and proposed migration plan, October 14, 2026. Owner for review: website operations (Yash Chitneni). This document applies the existing credential rules in [Environments and Identities](environments-and-identities.md); it does not grant access or expand the Alpha MCP allowlist.

## What lives where

| Material | Location | Repository contents |
| --- | --- | --- |
| Local API keys and WordPress application passwords | macOS login Keychain, enrolled through the local `yash-ops` utility | Credential identifier, environment, exact destination host, and enrollment instructions only |
| Credentials for a hosted worker | That worker's approved secret manager or environment secrets | Secret reference and purpose only; a local Keychain entry is not available to a cloud worker |
| Browser login | Authenticated session in the Codex in-app browser | Login URL and actor requirement; never cookies or session exports |
| Shared access inventory | Restricted access directory or credential manager | Site, owner, login URL, approved identity, secret reference, and verification date |

Do not put passwords, tokens, recovery codes, cookies, or signed login links in the playbook, tickets, screenshots, command arguments, logs, or tool output. Do not commit generated connection `.env` files. A secret reference is not permission to execute a change.

## Existing local setup

On Yash's Mac, `~/.config/yash-ops/README.md` describes the non-secret pack registry and Keychain enrollment utility. The `alpha-web` pack defines separate credential purposes for APEX, Alpha WordPress, HubSpot, Slack, and n8n. Check availability without displaying values:

```bash
~/.config/yash-ops/bin/ops show alpha-web
~/.config/yash-ops/bin/ops doctor alpha-web
```

To enroll an existing pack entry, run the utility interactively and enter the value only into its hidden Keychain prompt:

```bash
~/.config/yash-ops/bin/ops enroll alpha-web wordpress-production-application-password
```

The existing Alpha WordPress credential is an application password for API use, not the ordinary admin login password. Use the configured credential reader in the authorized adapter; do not run a command that prints the secret into a Codex transcript. Readers must use the exact registered service and account and pass credentials only to the registered HTTPS destination. Do not follow cross-host redirects while forwarding authentication.

`doctor` reporting `present` confirms local availability only. Authentication, capabilities, environment, source ownership, ticket authorization, and verification still need their normal checks.

## Codex browser sessions

Use the Codex in-app browser when the operator wants work separate from their regular browser. A login in Chrome or another browser does not establish a login in the Codex browser. Open the exact site's admin URL in Codex and verify the authenticated actor before editing. The operator may sign in there; keep password fields masked and exclude credentials from captures.

Keep a browser tab intended for later work open using the browser tool's handoff mechanism, then recheck authentication on the next turn. Do not promise permanent login persistence or copy cookies between profiles. After sign-in, background navigation can keep the operator's regular browser free.

Browser access does not replace the production-write policy. In particular, a missing adapter or rejected site URL does not authorize an unattended browser mutation.

## Adding another website

1. Verify the site's exact host, environment, owner, and approved actor. Resolve the page's source of truth before deciding which system needs credentials.
2. Define a separate non-secret pack entry for that site and environment. Record its credential ID, provider, exact destination, Keychain service/account reference, owner, purpose, and verification date. Never reuse Alpha credentials on a sister-brand host merely because both use WordPress.
3. Have the owner provision an appropriate identity. Prefer a dedicated, revocable WordPress application password for supported API work, with capabilities limited by the associated WordPress user. An application password does not itself narrow that user's capabilities. New identities or credentials need the applicable access approval; this runbook does not provision them.
4. Enroll the value through the approved secret manager's protected input. Confirm presence without showing the value, then verify the actor with a read-only request to the exact host.
5. Validate the site's adapter and operation, rollback, audit receipts, and public verification before enabling writes. Update machine-readable actor and site rules only through a reviewed pull request.
6. Record revocation and rotation responsibility. When a credential changes, update its secret-store entry and verify the replacement without committing the value.

Waypoint is a separate site. The connected Alpha MCP rejects Waypoint canonical URLs; storing a Waypoint credential alone does not make that adapter support Waypoint.

## Moving credentials out of an access spreadsheet

Proposed sequence for owner review:

1. Inventory site names, login URLs, owners, and environments using only non-secret columns. Inspect only the specific credential needed for an authorized operation; do not bulk-export the spreadsheet into chat or the repository.
2. Select the team's designated secret manager for shared credentials. Local Keychain supports this Mac; shared operators and hosted workers need independently provisioned access to an appropriate team or runtime secret store.
3. For each site, have the owner create or migrate the dedicated credential, enroll it securely, and test read-only authentication. Keep separate production and staging entries.
4. Replace spreadsheet password cells with secret references only after the owner approves the migration and verifies access. Preserve unrelated sheet data and sharing settings.
5. If the goal includes removing access to historical passwords, the owner must also address spreadsheet revision history, copies, exports, and backups. Clearing a cell alone does not remove old values from history. Rotate migrated credentials where the owner determines prior exposure requires it.

No spreadsheet passwords were migrated or removed when this runbook was prepared. No new credential or site execution capability was created.

## Evidence behind this runbook

- User request, October 14, 2026: use Codex's browser for the Waypoint event correction and explain secure credential storage for playbook-driven work.
- Existing policy: [Environments and Identities](environments-and-identities.md), credential rules and production-write policy.
- Local observation, October 14: the `alpha-web` credential pack and `ops doctor` support the availability checks above. Secret values were not printed.
- Restricted Google Sheet `2HL Master Access`, `Websites` tab: header columns identify Website, Login, Email, Username, and Password; row 12 identifies Waypoint's admin URL. Only the header and site/login columns were inspected. The sheet is an access inventory, not a source of website execution authority.
- HubSpot event `566100148133` and APEX event `cmqptpnop000204kvg1ye2jxj` already show “Fall Festival at Waypoint Academy.” The matching public Waypoint card still showed the old title during diagnosis. This requires investigation of Waypoint delivery or cache behavior, rather than another source-title edit.
