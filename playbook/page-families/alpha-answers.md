# Alpha Answers Requirements

## Purpose

Alpha Answers turns approved source content into clear parent-facing answers and machine-readable material. The index should organize parent questions, while detail experiences can combine related pages, video, transcript, and navigation.

## Source

Airtable is the documented upstream source for Alpha Answers imports. Every public answer needs an approved source record, stable identity, canonical entry, and import evidence.

## Requirements

- One parent question or answer collection creates one clear top-level Alpha Answers entry.
- A seven-part conversation may have one index entry with internal navigation across seven pages or sections. It should not create seven indistinguishable entries at the top level unless an approved content model calls for that.
- Titles tell parents the answer directly. Avoid meta phrasing such as “What should you know” when approved direction calls for the actual takeaway.
- Parent education content uses the intended parent perspective and approved voice.
- Video pages expose a readable title, summary, transcript or structured excerpts, speaker and source, publication date, and related answers where approved.
- Content is navigable by people without requiring an LLM interface.
- Canonical, sitemap, schema, Markdown, and LLM-export behavior are defined for the collection and internal pages.
- Draft, noindex, duplicate, or unapproved Airtable records do not publish.
- Import validation checks required fields, IDs, duplicate canonicals, broken media, navigation, and public index count.

## Structural change rule

Changing grouping, index cardinality, or multi-page navigation is a product and template change. It requires an approved model, staging, migration and rollback plan, and validation against existing Alpha Answers entries. It is not a routine copy ticket.

## Completion

Verify the index entry, detail navigation, readable text, video or media, canonical behavior, metadata, sitemap and LLM export, desktop and mobile, and absence of duplicate top-level entries.
