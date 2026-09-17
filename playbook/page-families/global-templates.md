# Global Templates, Navigation, Popups, and Scripts

## Known shared objects

| Object | ID |
| --- | ---: |
| Header template | 76 |
| Footer template | 77 |
| Campus SEO template | 6140 |

Resolve these again in the target environment before mutation.

## Requirements

- Global work uses a dedicated APEX ticket and named platform owner.
- Plugin, template, global CSS, script, form, popup, navigation, analytics, consent, and chat changes go through staging first unless an exact operation has current canary evidence.
- Preparation identifies every public surface expected to change.
- Header and footer preserve logo, navigation, Contact Us behavior, stylesheets, responsive menu, focus behavior, and supported links.
- Campus template changes preserve every n8n CSS ID and update the template used for new campus creation.
- Global scripts load only on their intended pages and respect consent requirements.
- Query-parameter behavior such as chat rollout or UTM propagation is tested explicitly.
- Rollback captures the complete template, menu, setting, or code version, not only a screenshot.

## Verification ring

Verify:

1. The ticketed global surface.
2. The homepage.
3. One canonical campus page using the main template.
4. One page from another affected family.
5. Desktop and mobile navigation, forms, overlays, and console behavior.

The standard ring-3 minimum of two untouched pages still applies. Add more representative pages when the component has broader reach.

## Unsupported routine work

The scheduled content agent does not create or restructure global templates, menus, popups, forms, or code. Route this work to the named platform owner.
