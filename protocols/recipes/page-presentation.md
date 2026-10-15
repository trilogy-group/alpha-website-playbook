# Recipe: Existing-content presentation

Class: `page-presentation`.

Source: Yash Chitneni, Codex conversation, 2026-10-15: the Locations waitlist request changes how existing text is displayed, and routine presentation work must have a usable pathway instead of an unmatched-class hold.

An existing notice's text alignment is page presentation. It does not require replacement copy or new brand wording approval. Intake routes a complete request directly to website operations, rather than treating it as an unclassified design decision. The operator records the exact requested outcome and prepared diff on the existing ticket; a separate design approval round is unnecessary for alignment alone.

The initial classifier recognizes explicit text-alignment requests, including those submitted through `layout_other`. It does not interpret arbitrary layout work as a routine fix. Requests mentioning structural, shared, functional, or sensitive changes retain internal review. A mixed request must be separated into its bounded presentation change and remaining work before execution.

## Prepare and apply

1. Confirm canonical page, requester, desired outcome and source ownership. Derive the exact target from the page; do not ask the requester for Elementor IDs or a CSS implementation.
2. Confirm the existing text, links and component behavior. Preserve all of them. Resolve the unique target and take a complete rollback snapshot before preparing the smallest page-local style diff.
3. Use only an actor and operation supported by `spec/actor-capabilities.json`, with the current ticket claim, collision control and expected hashes. A recognized class does not authorize an unsupported write.
4. An HTML widget containing an embed or script must not be made generally editable to fix one style. For the Locations waitlist example, the desired diff is only `text-align:center` on `.alpha-waitlist-notice`; map markup, scripts, text and all campus destinations must be preserved. Until a tested bounded style operation exists, website operations owns the capability gap. Do not enable arbitrary HTML replacement or bypass a lost claim.
5. Any browser work uses only the built-in Codex browser (`iab`), including authentication and verification. Unattended browser mutation remains unsupported.

## Verify and close

Read back the write and compare the exact diff against the snapshot. Verify the display outcome on the canonical public URL at desktop and mobile sizes, including wrapping and absence of horizontal overflow. Compare visible text and every link destination before and after. Verify embedded controls and the whole page; verify two untouched pages if a shared template or site-wide cache action was involved. Attach screenshots, snapshot reference, diff and verification results to the ticket. Close only after verified pass.

## Automation status

This class repairs classification and ownership, not scheduled publishing. It remains in the owner queue and is absent from the scheduled Alpha MCP allowlist. Promotion requires a tested bounded presentation operation in Alpha MCP, APEX worker integration, rollback/readback and desktop/mobile evidence, followed by the actor matrix and release manifest update. Classification, tool support and release promotion must agree; do not mark a capability integrated before it is tested.
