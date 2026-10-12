# Google Business Profile (GBP) ownership

Sources: Cristi Constantin (Technical Product Owner, Trilogy), Slack DM to Matt Barge, 2026-10-12. Yash Chitneni, 2026-10-09.

## Who owns GBP

- All Alpha School and specialty school GBP profiles are centrally managed through two GBP location groups:
  - https://business.google.com/u/1/groups/108386661412932747161/locations
  - https://business.google.com/u/1/groups/112677782509705641177/locations
- Access is not granted to other people (campus staff, partnerships, etc.). Manual edits get overwritten by the n8n automation that syncs GBP data.
- Yash Chitneni has access to both groups and decides who is added, removed, or set as manager, admin, or primary owner. Role: `gbp-access-owner` in `spec/responsibilities.json`.

## How listings reach Google

- Campus GBP listings are pushed to Google by RioSEO from the HubSpot campus record (Yash, 2026-10-09).
- RioSEO rejects a campus whose HubSpot record lacks a street address or phone number. Park City had no listing for that reason.
- Fix path: get the street address and phone into the HubSpot campus record. It flows to RioSEO, then to Google. Do not edit the GBP by hand.

## Handling requests

Example: Carolyn Hopper, Park City Chamber listing in Locl, Oct 2026, could not connect the GBP because her Google account was not an owner or manager.

1. Do not add requesters to GBP listings, and do not ask them to claim a listing.
2. Route any access or ownership question to Yash.
3. GBP fact changes (name, address, phone, hours, website) go through the source data that n8n and RioSEO sync (the HubSpot campus record), not manual GBP edits.
4. Third-party listings (Chamber, Locl, Apple Maps, etc.) copy name, address, phone and website from the GBP or the HubSpot source. They can be published without connecting Google. Connect a third-party tool to a GBP only if Yash approves.
