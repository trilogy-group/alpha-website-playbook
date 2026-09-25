// tests/site-truth-report.mjs (QC loop repair plan 2026-09-25, repair 9): the weekly site truth report derived from a
// packet and the registries, never from tickets. Fixture: tests/fixtures/site-truth is the 2026-09-25 full-mode packet
// (run site-full-2026-09-25T10-27-41-079Z, GitHub run 36123781000) trimmed to eleven campus pages (Open: Boca Raton,
// Boston, East Bay, Greenwich with its two programs, Jamaica Plain, New York, Raleigh, South Bay LA; Announced:
// Lexington, Carrollton, Franklin) with their programs, map pins, findings, active incidents, the filer report's ticket
// references, and registry snapshots filtered to those campuses (registry/ under the fixture, so a later registry edit
// does not move these expectations).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  COLUMNS,
  COLOR_MARK,
  LAUNCH_WORDS,
  REPORT_VERSION,
  SiteTruthError,
  buildReport,
  canonicalUrl,
  cardCell,
  ctaException,
  loadPacket,
  loadRegistries,
  normalizeName,
  packetCell,
  programRows,
  renderMarkdown,
  sameName,
  sentenceCell,
  slugFor,
  teamCell,
} from './site-truth-report.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const FIXTURE = path.join(here, 'fixtures', 'site-truth')
const PACKET = path.join(FIXTURE, 'packet')
const NOW = new Date('2026-09-25T12:00:00Z')
const packet = loadPacket(PACKET)
const registries = loadRegistries(FIXTURE)
const report = buildReport(packet, registries, { now: NOW })
const row = (slug, hubspotId = null) => report.rows.find((r) => r.slug === slug && (!hubspotId || r.hubspotId === hubspotId))

test('packet and registries load; an events-mode packet (no sources) is refused with the reason', () => {
  assert.equal(packet.manifest.runId, 'site-full-2026-09-25T10-27-41-079Z')
  assert.equal(packet.sources.campusPages.length, 11)
  assert.ok(packet.filer, 'the filer report next to the packet is picked up')
  assert.equal(registries.root, path.resolve(FIXTURE))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-truth-'))
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ runId: 'site-events-x', mode: 'events' }))
  assert.throws(() => loadPacket(dir), (e) => e instanceof SiteTruthError && e.code === 'BAD_PACKET' && /events-mode/.test(e.message))
  assert.throws(() => loadPacket(undefined), (e) => e.code === 'MISSING_ARG')
  assert.throws(() => loadRegistries(dir), (e) => e.code === 'BAD_REGISTRY')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('helpers: canonical URLs, slugs from the registry, person names as pages and registries write them', () => {
  assert.equal(canonicalUrl('https://alpha.school/east-bay'), 'https://alpha.school/east-bay/')
  assert.equal(canonicalUrl('https://www.alpha.school/east-bay/?x=1'), 'https://alpha.school/east-bay/')
  assert.equal(canonicalUrl('not a url'), null)
  assert.equal(slugFor('https://alpha.school/new-york-city', registries.pages), 'new-york-city')
  assert.equal(slugFor('https://alpha.school/unregistered-campus/', registries.pages), 'unregistered-campus')
  assert.equal(normalizeName('Dr. Kori Riordan'), 'kori riordan')
  assert.equal(normalizeName('Pam Jackson, PhD'), 'pam jackson')
  assert.equal(normalizeName('Timothy Berry, M.Div.'), 'timothy berry')
  assert.ok(sameName('Dr. Tasha Arnold', 'Tasha Arnold'))
  assert.ok(!sameName('Tasha Arnold', 'Sarah Rettig'))
  assert.ok(LAUNCH_WORDS.some((re) => re.test('Alpha Franklin is coming soon.')))
  assert.ok(LAUNCH_WORDS.some((re) => re.test('Alpha Carrollton is launching in Fall 2026.')))
  assert.ok(!LAUNCH_WORDS.some((re) => re.test('Alpha Boston is open and enrolling.')))
})

test('rows come from HubSpot Programs on alpha.school only, one per program, Open and Announced', () => {
  const rows = programRows(packet.sources)
  assert.equal(rows.length, 12)
  assert.ok(rows.every((r) => r.source === 'hubspot-programs' && /^https:\/\/alpha\.school\//.test(r.url)))
  assert.equal(report.counts.open, 9); assert.equal(report.counts.announced, 3)
  const greenwich = report.rows.filter((r) => r.slug === 'greenwich')
  assert.equal(greenwich.length, 2, 'Greenwich Port Chester and Greenwich Armonk share one page and keep two rows')
  assert.ok(greenwich.every((r) => r.sharedPage && /\(HubSpot: Alpha Greenwich/.test(r.campus)))
  assert.equal(greenwich.find((r) => r.hubspotId === '49011192959').cells.state.reason, 'no-map', 'Port Chester is Open in HubSpot but not on the growth map')
  assert.equal(greenwich.find((r) => r.hubspotId === '60804396611').cells.state.reason, 'agree')
  const mapOnly = programRows({ hubspotPrograms: [], map: packet.sources.map })
  assert.ok(mapOnly.length >= 10 && mapOnly.every((r) => r.source === 'growth-map'), 'falls back to the growth map when the packet has no programs')
})

test('East Bay: state and sentence agree, the registry records the card as missing, the team is misordered, packet and CTAs are right', () => {
  const eb = row('east-bay')
  assert.equal(eb.state, 'Open'); assert.equal(eb.url, 'https://alpha.school/east-bay/'); assert.ok(eb.pageFetched)
  assert.deepEqual([eb.cells.state.color, eb.cells.state.reason], ['green', 'agree'])
  assert.deepEqual([eb.cells.sentence.color, eb.cells.sentence.reason], ['green', 'open'])
  assert.deepEqual([eb.cells.card.color, eb.cells.card.reason], ['red', 'missing'])
  assert.match(eb.cells.card.detail, /Coming Fall 2026 To Piedmont/)
  assert.deepEqual([eb.cells.team.color, eb.cells.team.reason], ['red', 'misordered'])
  assert.match(eb.cells.team.detail, /Head of Schools \(card 1\) before DoA\/DoP/)
  assert.deepEqual([eb.cells.packet.color, eb.cells.packet.reason], ['green', 'visible'])
  assert.deepEqual([eb.cells.ctas.color, eb.cells.ctas.reason], ['green', 'present'])
  assert.deepEqual([eb.cells.guide.color, eb.cells.guide.reason], ['grey', 'absent'])
})

test('card cell: no row is "no card recorded" (red unrecorded), a placed card matches the rendered slot, a video row without an exposed slot is unobserved', () => {
  assert.deepEqual([row('new-york-city').cells.card.color, row('new-york-city').cells.card.reason], ['red', 'unrecorded'])
  assert.match(row('new-york-city').cells.card.detail, /no card recorded for Open campus new-york-city/)
  assert.deepEqual([row('boca-raton').cells.card.color, row('boca-raton').cells.card.reason], ['green', 'placed'])
  assert.match(row('boca-raton').cells.card.detail, /attachment 9822/)
  assert.deepEqual([row('raleigh').cells.card.color, row('raleigh').cells.card.reason], ['grey', 'unobserved'])
  assert.deepEqual([row('carrollton').cells.card.color, row('carrollton').cells.card.reason], ['grey', 'not-open'])
  const page = packet.sources.campusPages.find((p) => p.url === 'https://alpha.school/boca-raton/')
  const mismatch = cardCell({ campuses: { 'boca-raton': { openMedia: 'card', attachmentId: 8550, status: 'placed' } } }, 'boca-raton', page, 'Open')
  assert.deepEqual([mismatch.color, mismatch.reason], ['red', 'mismatch'])
  assert.match(mismatch.detail, /registry attachment 8550; slot shows 9822/)
  assert.deepEqual([cardCell(registries.openMedia, 'boca-raton', null, 'Open').color, cardCell(registries.openMedia, 'boca-raton', null, 'Open').reason], ['grey', 'unfetched'])
})

test('sentence cell: Open pages need the open sentence, Announced pages a dated launch statement', () => {
  assert.deepEqual([row('new-york-city').cells.sentence.color, row('new-york-city').cells.sentence.reason], ['red', 'absent'])
  assert.deepEqual([row('carrollton').cells.sentence.color, row('carrollton').cells.sentence.reason], ['green', 'dated'])
  assert.deepEqual([row('franklin').cells.sentence.color, row('franklin').cells.sentence.reason], ['red', 'undated'])
  assert.deepEqual([row('boston-suburbs').cells.sentence.color, row('boston-suburbs').cells.sentence.reason], ['red', 'absent'])
  const launch = sentenceCell({ text: 'Attend an Info Session Alpha East Bay is launching in Fall 2026.' }, 'Open')
  assert.deepEqual([launch.color, launch.reason], ['red', 'launch'])
  const openOnAnnounced = sentenceCell({ text: 'Alpha Carrollton is open and enrolling.' }, 'Announced')
  assert.deepEqual([openOnAnnounced.color, openOnAnnounced.reason], ['red', 'open-wording'])
  assert.equal(row('carrollton').cells.state.reason, 'agree')
})

test('team cell: leadership present and in the decided order, missing people named, a registry row without leadership is grey', () => {
  assert.deepEqual([row('boston').cells.team.color, row('boston').cells.team.reason], ['red', 'missing'])
  assert.match(row('boston').cells.team.detail, /DoA Samantha Kravitz not on the page/)
  const page = packet.sources.campusPages.find((p) => p.url === 'https://alpha.school/east-bay/')
  const ordered = teamCell({ campuses: { 'east-bay': { 'director-of-admissions': ['Free Gary'], 'dean-of-parents': ['Kori Riordan'], 'head-of-schools': ['Tasha Arnold'] } } }, 'east-bay', { staff: [page.staff[5], page.staff[1], page.staff[0], ...page.staff.slice(2, 5)] })
  assert.deepEqual([ordered.color, ordered.reason], ['green', 'ordered'])
  assert.equal(ordered.detail, 'DoA@1 DoP@2 Head@3')
  const guideFirst = teamCell({ campuses: { 'east-bay': { 'director-of-admissions': ['Free Gary'] } } }, 'east-bay', { staff: [page.staff[2], page.staff[5]] })
  assert.deepEqual([guideFirst.color, guideFirst.reason], ['red', 'misordered'])
  assert.deepEqual([teamCell({ campuses: { austin: {} } }, 'austin', page).color, teamCell({ campuses: { austin: {} } }, 'austin', page).reason], ['grey', 'no-leadership'])
  assert.deepEqual([teamCell({ campuses: {} }, 'austin', page).color, teamCell({ campuses: {} }, 'austin', page).reason], ['grey', 'unrecorded'])
  assert.deepEqual([teamCell(registries.leadership, 'east-bay', { staff: [] }).color, teamCell(registries.leadership, 'east-bay', { staff: [] }).reason], ['red', 'no-cards'])
})

test('packet cell: visible and recorded, interim hidden buttons, a visible placeholder, and registry drift', () => {
  assert.deepEqual([row('east-bay').cells.packet.color, row('east-bay').cells.packet.reason], ['green', 'visible'])
  assert.deepEqual([row('boca-raton').cells.packet.color, row('boca-raton').cells.packet.reason], ['grey', 'interim'])
  assert.deepEqual([row('south-bay-la').cells.packet.color, row('south-bay-la').cells.packet.reason], ['red', 'placeholder'])
  assert.deepEqual([row('raleigh').cells.packet.color, row('raleigh').cells.packet.reason], ['red', 'drift'])
  const absent = packetCell(registries.packets, 'east-bay', { infoPacketLinks: [] })
  assert.deepEqual([absent.color, absent.reason], ['red', 'absent'])
})

test('CTA cell: presence, a recorded exception, and source-dependent controls on Announced pages', () => {
  assert.deepEqual([row('boston').cells.ctas.color, row('boston').cells.ctas.reason], ['red', 'missing'])
  assert.match(row('boston').cells.ctas.detail, /Book a Call missing/)
  assert.deepEqual([row('franklin').cells.ctas.color, row('franklin').cells.ctas.reason], ['grey', 'conditional'])
  const lexington = row('boston-suburbs')
  assert.deepEqual([lexington.cells.ctas.color, lexington.cells.ctas.reason], ['green', 'present'])
  assert.ok(ctaException(registries.ctaExceptions, 'boston-suburbs', 'book-a-call', { state: 'Announced', now: NOW }), 'the hidden Book a Call exception is active while Announced')
  assert.equal(ctaException(registries.ctaExceptions, 'boston-suburbs', 'book-a-call', { state: 'Open', now: NOW }), null, 'lifecycle:Open expires the exception on Open')
  assert.equal(ctaException({ campuses: { x: { apply: { rule: 'hidden', expires: '2026-09-01' } } } }, 'x', 'apply', { state: 'Open', now: NOW }), null)
  assert.ok(ctaException({ campuses: { x: { apply: { rule: 'hidden', expires: '2026-10-01' } } } }, 'x', 'apply', { state: 'Open', now: NOW }))
})

test('incidents and tickets: first-seen dates and ticket references land on the cell they belong to', () => {
  const boston = row('boston').cells.ctas
  assert.equal(boston.firstSeen, '2026-09-24')
  assert.deepEqual(boston.incidents, ['SITE-59C1A0E7D4'])
  assert.deepEqual(boston.tickets.map((t) => t.id), ['cmug3lrmc00040agmfrfr03q7'])
  assert.equal(boston.tickets[0].via, 'filer:MISSING_INFO')
  const sbla = row('south-bay-la').cells.packet
  assert.equal(sbla.firstSeen, '2026-09-02')
  assert.deepEqual(sbla.tickets.map((t) => t.id), ['cmtmn1ruo000104i23vxtvu2w'])
  assert.equal(row('east-bay').cells.card.firstSeen, null, 'no active incident for the card: the observer never saw it (the point of repair 1)')
  const resolved = packet.incidents.filter((i) => i.status === 'resolved')
  assert.ok(resolved.length >= 1)
  assert.ok(report.rows.every((r) => COLUMNS.every((c) => r.cells[c].incidents.every((id) => !resolved.some((i) => i.id === id)))), 'resolved incidents are never attached')
})

test('counts, header and markdown: run id, bundle version, generated time, both tables, footer counts', () => {
  assert.equal(report.reportVersion, REPORT_VERSION)
  assert.equal(report.packet.runId, 'site-full-2026-09-25T10-27-41-079Z')
  assert.equal(report.packet.bundleVersion, '1.1')
  assert.equal(report.packet.completedAt, '2026-09-25T10:36:26.041Z')
  assert.equal(report.generatedAt, NOW.toISOString())
  assert.equal(report.counts.red, report.rows.reduce((n, r) => n + COLUMNS.filter((c) => r.cells[c].color === 'red').length, 0))
  assert.equal(report.counts.byColumn.guide.red, 0, 'the guide column is advisory and never red')
  assert.equal(report.counts.openRedByColumn.card, 3, 'East Bay missing, Jamaica Plain missing, New York unrecorded')
  const markdown = renderMarkdown(report)
  assert.match(markdown, /^# Site truth report/)
  assert.match(markdown, /Packet run `site-full-2026-09-25T10-27-41-079Z` \(full mode, check bundle 1\.1, completed 2026-09-25T10:36:26\.041Z\)\. Report generated 2026-09-25T12:00:00\.000Z/)
  assert.match(markdown, /## Open campuses \(9\)/); assert.match(markdown, /## Announced campuses \(3\)/)
  assert.match(markdown, new RegExp(`\\| \\[Alpha East Bay\\]\\(https://alpha\\.school/east-bay/\\) \\| ${COLOR_MARK.green} agree \\| ${COLOR_MARK.green} open \\| ${COLOR_MARK.red} missing \\| ${COLOR_MARK.red} misordered \\| ${COLOR_MARK.green} visible \\| ${COLOR_MARK.green} present \\| ${COLOR_MARK.grey} absent \\|`))
  assert.match(markdown, /missing \(since 2026-09-24, ticket cmug3lrmc00040agmfrfr03q7\)/)
  assert.ok(!/present \(since/.test(markdown), 'a green cell prints only its reason')
  assert.match(markdown, /- Open campuses: 9; Announced campuses: 3; rows with a red cell: \d+; red cells: \d+\./)
  assert.match(markdown, /- Red by column \(Open only\): State 0, Status sentence 1, Intro card 3, Team section \d+, Packet 2, CTAs 2, Guide video 0\./)
  assert.match(markdown, /## Red cells, in detail/)
  assert.match(markdown, /Alpha East Bay \(Open\), Intro card: missing\./)
})

test('CLI: writes the markdown and JSON where asked and prints the headline', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-truth-cli-'))
  const out = execFileSync(process.execPath, [path.join(here, 'site-truth-report.mjs'), '--packet', PACKET, '--registry-root', FIXTURE, '--out', path.join(dir, 'report.md'), '--json', path.join(dir, 'report.json'), '--now', NOW.toISOString()], { encoding: 'utf8', cwd: root })
  assert.match(out, /^site truth: 9 Open, 3 Announced, \d+ red cells in \d+ rows;/)
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'))
  assert.equal(json.rows.length, 12); assert.equal(json.generatedAt, NOW.toISOString())
  assert.equal(fs.readFileSync(path.join(dir, 'report.md'), 'utf8'), renderMarkdown(report))
  fs.rmSync(dir, { recursive: true, force: true })
})
