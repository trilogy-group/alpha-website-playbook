# Accessibility, Performance, Browser, and Media Standards

Status: proposed operational baseline pending named approval  
Last updated: September 17, 2026

These standards close a documentation gap but do not claim prior leadership approval. They become enforced requirements only when their owner and source are recorded in `spec/site-rules.json`.

## Accessibility baseline

- Target WCAG 2.2 AA for public content and interactions.
- One semantic H1 per indexable page, followed by a logical heading order.
- All meaningful images have concise, context-specific alt text. Decorative images use empty alt text.
- Buttons and links have understandable accessible names.
- Keyboard users can reach and operate navigation, maps, carousels, accordions, forms, popups, media controls, and chat dismissal.
- Focus is visible and not hidden by sticky headers or overlays.
- Text and controls meet AA contrast.
- Form fields have labels, instructions, and understandable error messages.
- Video provides captions; substantive video-only content provides a transcript or equivalent text.
- Motion respects reduced-motion preferences where the component supports animation.

## Performance baseline

- Do not add a global script, widget, video, image, font, or third-party tag without identifying its owner and measured impact.
- Images use appropriate dimensions, modern formats where supported, compression, and lazy loading below the fold.
- Hero media has explicit dimensions and does not create avoidable layout shift.
- A change must not materially regress Core Web Vitals on the target page compared with the recorded baseline.
- Performance budgets and numeric pass thresholds remain an approval gap. Until set, record before and after Lighthouse or field metrics for global and media-heavy changes.

## Browser baseline

At minimum, verify the current stable versions of Chrome and Safari on desktop, plus iPhone Safari and Android Chrome for changes involving layout, forms, menus, maps, media, or popups. Firefox and Edge are required for global navigation, forms, and major templates until an approved support policy narrows the matrix.

Automated browser checks do not replace a visual review when the ticket affects presentation.

## Media standard

Every approved asset record must identify:

- Source and rights or approval owner
- Campus or subject
- Exact person mapping when applicable
- APEX asset ID or approved registry reference
- Source SHA-256 when uploaded by an agent
- Filename using stable, descriptive words
- Title and alt text
- Intended slot
- Required crop, aspect ratio, dimensions, and focal point
- Publication and expiration date when seasonal

Do not infer identity from appearance. Do not fetch unreviewed Slack or Drive assets directly in unattended version 1 execution. Attach them to APEX or an approved source record first.

## Visual QA

Check desktop and mobile for:

- Face and focal-point crop
- Broken or low-resolution media
- Text overlap and clipping
- Horizontal overflow
- Header overlap
- CTA visibility
- Carousel and scroll behavior
- Form labels and errors
- Focus and keyboard behavior
- Consent, chat, or popup obstruction

The media or layout ticket closes only after the canonical public page passes these checks.
