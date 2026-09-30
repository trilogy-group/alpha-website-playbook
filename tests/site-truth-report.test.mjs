// tests/site-truth-report.mjs (QC loop repair plan 2026-09-25, repair 9): the weekly site truth report derived from a
// packet and the registries, never from tickets or registry notes. Fixture: tests/fixtures/site-truth is the 2026-09-28
// full-mode packet (run site-full-2026-09-28T06-22-58-124Z, GitHub run 36386076572) trimmed to eighteen campus pages
// (Open: Atlanta, Boca Raton, Boston, Charlotte, East Bay, Fort Worth, Greenwich with its two programs, Jamaica Plain,
// Kirkland, Miami, New York, Raleigh, South Bay LA, The Woodlands; Announced: Lexington, Carrollton, Franklin, Lake
// Travis) with their programs, map pins, findings, active incidents, vision readings, browser embeds, the filer report's
// ticket references, and registry snapshots filtered to those campuses (registry/ under the fixture, so a later registry
// edit does not move these expectations; campus-pages is kept whole so other campuses' names resolve).
//
// The three 2026-09-28 corrections Matt asked for after reading the first report against the live pages:
//   1. the card cell's detail is the observation (slot image, OCR reading, campus video), never the registry's note;
//   2. an unrecorded slot with plausible media is amber "unapproved", not red, and amber is counted separately;
//   3. "Alpha Charlotte is open K-8 for Fall 2026." is amber "open-variant", not red "absent".
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
  campusCityIn,
  launchAssetPatterns,
  launchCardPattern,
  SLOT_LAUNCH_WORDS,
  REPORT_VERSION,
  SiteTruthError,
  buildReport,
  canonicalUrl,
  cardCell,
  ctaException,
  embedIndex,
  loadPacket,
  loadRegistries,
  normalizeName,
  observeSlot,
  otherCampusIn,
  packetCell,
  programRows,
  renderMarkdown,
  sameName,
  sentenceCell,
  sharedHeadsOfSchools,
  sharedVideoIds,
  slugFor,
  teamCell,
  videoId,
  visionIndex,
} from './site-truth-report.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const FIXTURE = path.join(here, 'fixtures', 'site-truth')
const PACKET = path.join(FIXTURE, 'packet')
const NOW = new Date('2026-09-28T12:00:00Z')
const packet = loadPacket(PACKET)
const registries = loadRegistries(FIXTURE)
const report = buildReport(packet, registries, { now: NOW })
const row = (slug, hubspotId = null) => report.rows.find((r) => r.slug === slug && (!hubspotId || r.hubspotId === hubspotId))
const pageFor = (slug) => packet.sources.campusPages.find((p) => p.url === `https://alpha.school/${slug}/`)
const observe = (slug) => observeSlot(pageFor(slug), { vision: packet.vision.get(`https://alpha.school/${slug}/`) || [], embeds: packet.embeds.get(`https://alpha.school/${slug}/`) || new Map(), shared: sharedVideoIds(packet.sources.campusPages), pages: registries.pages, slug })
const colorReason = (c) => [c.color, c.reason]

test('packet and registries load; vision readings and browser embeds are indexed by page; an events-mode packet (no sources) is refused with the reason', () => {
  assert.equal(packet.manifest.runId, 'site-full-2026-09-28T06-22-58-124Z')
  assert.equal(packet.sources.campusPages.length, 19, 'eighteen pages, Greenwich fetched once per program')
  assert.ok(packet.filer, 'the filer report next to the packet is picked up')
  assert.equal(packet.vision.get('https://alpha.school/east-bay/')[0].visionText, 'Coming Fall 2026\nTo Piedmont')
  assert.equal(packet.embeds.get('https://alpha.school/charlotte/').get('iPidNvq5SNM'), 'The Future of Education is Now in Charlotte')
  assert.equal(registries.root, path.resolve(FIXTURE))
  assert.equal(visionIndex(null).size, 0); assert.equal(embedIndex(null).size, 0)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-truth-'))
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ runId: 'site-events-x', mode: 'events' }))
  assert.throws(() => loadPacket(dir), (e) => e instanceof SiteTruthError && e.code === 'BAD_PACKET' && /events-mode/.test(e.message))
  assert.throws(() => loadPacket(undefined), (e) => e.code === 'MISSING_ARG')
  assert.throws(() => loadRegistries(dir), (e) => e.code === 'BAD_REGISTRY')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('helpers: canonical URLs, slugs from the registry, person names, video ids, launch words for sentences and for slot images', () => {
  assert.equal(canonicalUrl('https://alpha.school/east-bay'), 'https://alpha.school/east-bay/')
  assert.equal(canonicalUrl('https://www.alpha.school/east-bay/?x=1'), 'https://alpha.school/east-bay/')
  assert.equal(canonicalUrl('not a url'), null)
  assert.equal(slugFor('https://alpha.school/new-york-city', registries.pages), 'new-york-city')
  assert.equal(slugFor('https://alpha.school/unregistered-campus/', registries.pages), 'unregistered-campus')
  assert.equal(normalizeName('Dr. Kori Riordan'), 'kori riordan')
  assert.equal(normalizeName('Pam Jackson, PhD'), 'pam jackson')
  assert.ok(sameName('Dr. Tasha Arnold', 'Tasha Arnold'))
  assert.ok(!sameName('Tasha Arnold', 'Sarah Rettig'))
  assert.equal(videoId('https://youtu.be/iPidNvq5SNM/'), 'iPidNvq5SNM')
  assert.equal(videoId('https://www.youtube.com/watch/?v=KMvjR0NfTMs'), 'KMvjR0NfTMs')
  assert.equal(videoId('https://www.youtube.com/embed/eGB0P702a5U?controls=1'), 'eGB0P702a5U')
  assert.equal(videoId('https://alpha.school/'), null)
  assert.ok(LAUNCH_WORDS.some((re) => re.test('Alpha Franklin is coming soon.')))
  assert.ok(LAUNCH_WORDS.some((re) => re.test('Alpha Carrollton is launching in Fall 2026.')))
  assert.ok(LAUNCH_WORDS.some((re) => re.test('Coming in Fall 2026 to The Woodlands!')), 'the Woodlands card wording')
  assert.ok(!LAUNCH_WORDS.some((re) => re.test('Alpha Boston is open and enrolling.')))
  assert.ok(!LAUNCH_WORDS.some((re) => re.test('Alpha Charlotte is open K-8 for Fall 2026.')), 'a season and year in an open sentence is not launch wording')
  assert.ok(SLOT_LAUNCH_WORDS.some((re) => re.test('Now Enrolling Fall 2026')), 'but painted into a card it is')
  assert.ok(!SLOT_LAUNCH_WORDS.some((re) => re.test('Open and Enrolling!')))
  const shared = sharedVideoIds(packet.sources.campusPages)
  assert.ok(shared.has('CuSijUisnyE') && shared.has('lFrGQmg0yc4') && shared.has('KMvjR0NfTMs'), 'the site-wide trio is shared')
  assert.ok(!shared.has('iPidNvq5SNM'), 'the Charlotte video is not')
  assert.deepEqual(otherCampusIn(['Classroom at Alpha private school in Miami'], 'boston-suburbs', registries.pages), { slug: 'miami', name: 'Alpha Miami' })
  assert.equal(otherCampusIn(['Miami Beach'], 'miami-beach', registries.pages), null, 'the page\'s own name never counts')
  assert.equal(otherCampusIn(['Miami Beach'], 'miami', registries.pages)?.slug, 'miami-beach')
  assert.equal(otherCampusIn(['San Diego'], 'la-jolla', registries.pages), null, 'a city that is not a campus name')
})

test('rows come from HubSpot Programs on alpha.school only, one per program, Open and Announced', () => {
  const rows = programRows(packet.sources)
  assert.equal(rows.length, 19)
  assert.ok(rows.every((r) => r.source === 'hubspot-programs' && /^https:\/\/alpha\.school\//.test(r.url)))
  assert.equal(report.counts.open, 15); assert.equal(report.counts.announced, 4)
  const greenwich = report.rows.filter((r) => r.slug === 'greenwich')
  assert.equal(greenwich.length, 2, 'Greenwich Port Chester and Greenwich Armonk share one page and keep two rows')
  assert.ok(greenwich.every((r) => r.sharedPage && /\(HubSpot: Alpha Greenwich/.test(r.campus)))
  assert.equal(greenwich.find((r) => r.hubspotId === '49011192959').cells.state.reason, 'no-map', 'Port Chester is Open in HubSpot but not on the growth map')
  assert.equal(greenwich.find((r) => r.hubspotId === '60804396611').cells.state.reason, 'agree')
  const mapOnly = programRows({ hubspotPrograms: [], map: packet.sources.map })
  assert.ok(mapOnly.length >= 10 && mapOnly.every((r) => r.source === 'growth-map'), 'falls back to the growth map when the packet has no programs')
})

test('observation: the slot as the packet shows it (image with its OCR reading, campus videos titled from the embeds, launch words), never the registry', () => {
  const eastBay = observe('east-bay')
  assert.deepEqual([eastBay.image.attachmentId, eastBay.image.file, eastBay.image.alt, eastBay.image.text, eastBay.image.confidence], [8550, 'Piedmont-1024x704.webp', '', 'Coming Fall 2026 To Piedmont', 95])
  assert.deepEqual(eastBay.launch, ['Coming Fall', 'Fall 2026'])
  const atlanta = observe('atlanta')
  assert.deepEqual([atlanta.image.attachmentId, atlanta.image.file, atlanta.image.alt, atlanta.image.text, atlanta.image.read], [8790, 'Best-things-to-do-in-Atlanta-Header-1024x576.webp', '', null, true], 'a stock skyline read at confidence 25 has no text')
  assert.deepEqual([atlanta.launch, atlanta.otherCampus, atlanta.placeholder, atlanta.videos], [[], null, false, []])
  const charlotte = observe('charlotte')
  assert.equal(charlotte.image, null, 'no content_image in the slot')
  assert.deepEqual(charlotte.videos.map((v) => [v.id, v.title]), [['iPidNvq5SNM', 'The Future of Education is Now in Charlotte']], 'the site-wide trio and the Scottsdale testimonial are not Charlotte\'s video')
  assert.equal(observe('fort-worth').videos.length, 4)
  assert.equal(observe('kirkland').image.attachmentId, 9818)
  assert.equal(observeSlot(null), null)
  assert.equal(observeSlot(pageFor('raleigh')).videos.length, 1, 'without a shared set every non-site-wide video counts; Raleigh has its own')
})

test('card cell, three levels from the observation: East Bay red with the OCR text, Atlanta amber with the skyline detail, Charlotte amber video, Kirkland green', () => {
  const eb = row('east-bay')
  assert.deepEqual(colorReason(eb.cells.card), ['red', 'launch'])
  assert.match(eb.cells.card.detail, /^attachment 8550 \(Piedmont-1024x704\.webp, alt empty, reads "Coming Fall 2026 To Piedmont"\); launch wording: Coming Fall, Fall 2026$/)
  assert.deepEqual(colorReason(row('the-woodlands').cells.card), ['red', 'launch'])
  assert.match(row('the-woodlands').cells.card.detail, /reads "Coming in Fall 2026 to The Woodlands!"/)
  const atlanta = row('atlanta')
  assert.deepEqual(colorReason(atlanta.cells.card), ['amber', 'unapproved'])
  assert.match(atlanta.cells.card.detail, /^attachment 8790 \(Best-things-to-do-in-Atlanta-Header-1024x576\.webp, alt empty, no text read \(OCR confidence 25\)\): no registry row approves it; approve it \(record the attachment\) or replace it with the Open and Enrolling card$/)
  assert.ok(!/Roswell|stale card|8630/.test(atlanta.cells.card.detail), 'the registry\'s 2026-09-15 note about a card that is no longer there never reaches the cell')
  const charlotte = row('charlotte')
  assert.deepEqual(colorReason(charlotte.cells.card), ['amber', 'unapproved'])
  assert.match(charlotte.cells.card.detail, /^campus video "The Future of Education is Now in Charlotte" \(iPidNvq5SNM\) on the page and no slot image: no registry row approves it; approve it \(record openMedia video\) or place the Open and Enrolling card$/)
  assert.deepEqual(colorReason(row('fort-worth').cells.card), ['amber', 'unapproved'])
  assert.match(row('fort-worth').cells.card.detail, /"Alpha Fort Worth - Learning Reimagined" \(Ybc-R8PAu68\)/)
  assert.deepEqual(colorReason(row('miami').cells.card), ['amber', 'unapproved'])
  assert.deepEqual(colorReason(row('jamaica-plain').cells.card), ['amber', 'unapproved'])
  assert.match(row('jamaica-plain').cells.card.detail, /attachment 4044 \(Website-Alpha-School-0016-1024x683\.webp, alt empty, no text read \(OCR confidence 45\)\)/)
  assert.deepEqual(colorReason(row('kirkland').cells.card), ['green', 'placed'])
  assert.match(row('kirkland').cells.card.detail, /^attachment 9818 \(9228-Kirkland-Open-and-Enrolling-1024x704\.png, alt "Kirkland"/)
  assert.deepEqual(colorReason(row('boston').cells.card), ['green', 'placed'])
  assert.match(row('boston').cells.card.detail, /reads "Open and Enrolling!"/)
  assert.deepEqual(colorReason(row('raleigh').cells.card), ['green', 'video'])
  assert.match(row('raleigh').cells.card.detail, /^campus video "This Is Alpha School\. \(2 Hours\. Top 1% Scores\.\)" \(eGB0P702a5U\)$/)
  assert.deepEqual(colorReason(row('carrollton').cells.card), ['grey', 'not-open'])
  assert.match(row('carrollton').cells.card.detail, /reads "Coming Fall 2026 To Carrollton"/, 'an Announced page names what it shows and is not graded')
  assert.deepEqual(colorReason(row('lake-travis').cells.card), ['grey', 'not-open'])
})

test('card cell, a launch-card file name plus an alt naming another campus city is red launch when OCR read nothing; the pattern alone is evidence in the detail', () => {
  // The bundle row's assetPatterns come with the registries (the repository bundle when the fixture root has none).
  assert.ok(registries.assetPatterns.some((p) => /Subtitle-/.test(p)), 'the Subtitle-<n> export naming is a launch-card pattern')
  assert.deepEqual(launchAssetPatterns(FIXTURE), registries.assetPatterns)
  assert.deepEqual(launchAssetPatterns(fs.mkdtempSync(path.join(os.tmpdir(), 'no-bundle-'))), registries.assetPatterns, 'a root with no bundle falls back to the repository bundle')
  assert.equal(launchCardPattern('https://alpha.school/wp-content/uploads/2026/06/Subtitle-8-1024x704.webp', registries.assetPatterns), registries.assetPatterns[0])
  assert.equal(launchCardPattern('https://alpha.school/wp-content/uploads/2026/09/9228-Kirkland-Open-and-Enrolling-1024x704.png', registries.assetPatterns), null, 'the Open and Enrolling cards never match')
  assert.equal(launchCardPattern('https://alpha.school/wp-content/uploads/2026/01/Santa-Monica%E2%80%8B-1024x704.png', registries.assetPatterns), registries.assetPatterns[2], 'Santa Monica with its zero-width space')
  assert.equal(launchCardPattern('', registries.assetPatterns), null)
  assert.equal(campusCityIn('San Diego', registries.pages), 'San Diego', 'La Jolla\'s own alias is a campus city')
  assert.equal(campusCityIn('Open and Enrolling', registries.pages), null)

  // The 2026-09-28 packet: the La Jolla slot, Subtitle-8.webp with alt "San Diego", read as noise at 25 by the raw OCR step.
  const src = 'https://alpha.school/wp-content/uploads/2026/06/Subtitle-8-1024x704.webp'
  const laJolla = (alt) => ({ program: { id: 'program-51235904641' }, url: 'https://alpha.school/la-jolla/', finalUrl: 'https://alpha.school/la-jolla/', status: 200, text: 'Alpha La Jolla is open and enrolling.', media: { images: [{ src, alt, title: '', classes: 'attachment-large size-large wp-image-9226', containerId: 'content_image', nearbyText: '', isPrimaryCampusVisual: true, staleLaunchSignal: false }], youtubeVideos: [], hasYouTubeVideo: false, staleLaunchSignals: [] } })
  const noise = [{ slot: 'intro-card', src, url: 'https://alpha.school/wp-content/uploads/2026/06/Subtitle-8.webp', alt: 'San Diego', visionText: 'P— SL Et Ta\n" 2 valine', confidence: 25 }]
  const options = { vision: noise, pages: registries.pages, slug: 'la-jolla', assetPatterns: registries.assetPatterns }
  const obs = observeSlot(laJolla('San Diego'), options)
  assert.equal(obs.image.launchAsset, registries.assetPatterns[0])
  assert.equal(obs.image.text, null, 'noise at 25 is not quoted')
  assert.deepEqual(obs.launch, [`launch-card file Subtitle-8-1024x704.webp (pattern ${registries.assetPatterns[0]}) with alt "San Diego"`])
  assert.equal(obs.otherCampus, null, 'San Diego is La Jolla\'s own alias, not another campus')
  const red = cardCell({ campuses: {} }, 'la-jolla', laJolla('San Diego'), 'Open', obs)
  assert.deepEqual(colorReason(red), ['red', 'launch'])
  assert.match(red.detail, /^attachment 9226 \(Subtitle-8-1024x704\.webp, alt "San Diego", no text read \(OCR confidence 25\), file matches launch-card pattern .*Subtitle.*\); launch wording: launch-card file Subtitle-8-1024x704\.webp \(pattern .*\) with alt "San Diego"$/)
  assert.deepEqual(colorReason(cardCell({ campuses: { 'la-jolla': { openMedia: 'card', attachmentId: 9226, status: 'placed' } } }, 'la-jolla', laJolla('San Diego'), 'Open', obs)), ['red', 'launch'], 'red whatever the registry approves')
  // The pattern alone: an empty alt, or the page's own city, stays amber with the pattern named in the detail.
  for (const alt of ['', 'La Jolla']) {
    const evidenceOnly = observeSlot(laJolla(alt), options)
    assert.deepEqual(evidenceOnly.launch, [], `alt ${JSON.stringify(alt)}`)
    const amber = cardCell({ campuses: {} }, 'la-jolla', laJolla(alt), 'Open', evidenceOnly)
    assert.deepEqual(colorReason(amber), ['amber', 'unapproved'])
    assert.match(amber.detail, /file matches launch-card pattern/)
  }
  // Without the bundle's patterns (a caller that observes the page alone) nothing changes.
  assert.deepEqual(colorReason(cardCell({ campuses: {} }, 'la-jolla', laJolla('San Diego'), 'Open')), ['amber', 'unapproved'])
  // Read by the observer's preprocessing ladder: red by the words, the pattern no longer needed in the detail.
  const read = observeSlot(laJolla('San Diego'), { ...options, vision: [{ ...noise[0], visionText: 'Coming Fall 2026\nTo San Diego', confidence: 95 }] })
  assert.deepEqual(read.launch, ['Coming Fall', 'Fall 2026', `launch-card file Subtitle-8-1024x704.webp (pattern ${registries.assetPatterns[0]}) with alt "San Diego"`])
  const readCell = cardCell({ campuses: {} }, 'la-jolla', laJolla('San Diego'), 'Open', read)
  assert.deepEqual(colorReason(readCell), ['red', 'launch'])
  assert.match(readCell.detail, /reads "Coming Fall 2026 To San Diego"/)
  assert.doesNotMatch(readCell.detail, /file matches launch-card pattern/)
  // The fixture's East Bay card matches a pattern too (empty alt); its detail is the words read, unchanged.
  const eastBay = observeSlot(pageFor('east-bay'), { vision: packet.vision.get('https://alpha.school/east-bay/'), pages: registries.pages, slug: 'east-bay', assetPatterns: registries.assetPatterns })
  assert.equal(eastBay.image.launchAsset, registries.assetPatterns[1])
  assert.deepEqual(eastBay.launch, ['Coming Fall', 'Fall 2026'])
  assert.doesNotMatch(cardCell({ campuses: {} }, 'east-bay', pageFor('east-bay'), 'Open', eastBay).detail, /file matches launch-card pattern/)
})

test('card cell, the registry contributes the approval only: mismatch, other-campus, placeholder, empty, unobserved, unfetched', () => {
  const boca = pageFor('boca-raton')
  const mismatch = cardCell({ campuses: { 'boca-raton': { openMedia: 'card', attachmentId: 8550, status: 'placed' } } }, 'boca-raton', boca, 'Open')
  assert.deepEqual(colorReason(mismatch), ['red', 'mismatch'])
  assert.match(mismatch.detail, /^registry approves attachment 8550; slot shows attachment 9822 \(9233-BocaRaton-Open-and-Enrolling-1024x704\.png/)
  const videoRowWithCard = cardCell({ campuses: { 'boca-raton': { openMedia: 'video', attachmentId: null, status: 'placed' } } }, 'boca-raton', boca, 'Open')
  assert.deepEqual(colorReason(videoRowWithCard), ['red', 'mismatch'])
  assert.match(videoRowWithCard.detail, /^registry approves a campus video; slot shows attachment 9822/)
  const cardRowWithVideo = cardCell({ campuses: { charlotte: { openMedia: 'card', attachmentId: 9999, status: 'placed' } } }, 'charlotte', pageFor('charlotte'), 'Open', observe('charlotte'))
  assert.deepEqual(colorReason(cardRowWithVideo), ['red', 'mismatch'])
  assert.match(cardRowWithVideo.detail, /registry approves attachment 9999; the slot shows no image and the page carries campus video "The Future of Education is Now in Charlotte"/)
  // Launch words, another campus's name or a placeholder in the slot are red whatever the registry says, even for an approved attachment.
  const approvedLaunch = cardCell({ campuses: { 'east-bay': { openMedia: 'card', attachmentId: 8550, status: 'placed' } } }, 'east-bay', pageFor('east-bay'), 'Open', observe('east-bay'))
  assert.deepEqual(colorReason(approvedLaunch), ['red', 'launch'])
  const otherCampus = cardCell({ campuses: {} }, 'boston-suburbs', pageFor('boston-suburbs'), 'Open', observe('boston-suburbs'))
  assert.deepEqual(colorReason(otherCampus), ['red', 'other-campus'])
  assert.match(otherCampus.detail, /alt "Classroom at Alpha private school in Miami".* names Alpha Miami$/)
  const placeholderPage = { ...boca, media: { ...boca.media, images: boca.media.images.map((i) => (i.containerId === 'content_image' ? { ...i, src: 'https://alpha.school/wp-content/uploads/placeholder-card.png', classes: 'wp-image-1', alt: '' } : i)) } }
  assert.deepEqual(colorReason(cardCell({ campuses: {} }, 'boca-raton', placeholderPage, 'Open')), ['red', 'placeholder'])
  // Nothing observed: red empty without an approval, grey unobserved for an approved video the packet cannot see, red empty for an approved card that does not render.
  const bare = { ...pageFor('lake-travis'), media: { images: [], youtubeVideos: [{ href: 'https://youtu.be/CuSijUisnyE/' }], hasYouTubeVideo: true, staleLaunchSignals: [] } }
  const bareObs = observeSlot(bare, { shared: sharedVideoIds(packet.sources.campusPages) })
  assert.deepEqual([bareObs.image, bareObs.videos], [null, []], 'the site-wide video is not a campus video')
  assert.deepEqual(colorReason(cardCell({ campuses: {} }, 'lake-travis', bare, 'Open', bareObs)), ['red', 'empty'])
  assert.deepEqual(colorReason(cardCell({ campuses: { 'lake-travis': { openMedia: null, attachmentId: null, status: 'missing' } } }, 'lake-travis', bare, 'Open', bareObs)), ['red', 'empty'], 'a null row is no approval')
  assert.deepEqual(colorReason(cardCell({ campuses: { 'lake-travis': { openMedia: 'video', attachmentId: null, status: 'placed' } } }, 'lake-travis', bare, 'Open', bareObs)), ['grey', 'unobserved'])
  assert.deepEqual(colorReason(cardCell({ campuses: { 'lake-travis': { openMedia: 'card', attachmentId: 9000, status: 'placed' } } }, 'lake-travis', bare, 'Open', bareObs)), ['red', 'empty'])
  assert.deepEqual(colorReason(cardCell(registries.openMedia, 'boca-raton', null, 'Open')), ['grey', 'unfetched'])
  assert.match(cardCell(registries.openMedia, 'boca-raton', null, 'Open').detail, /^card 9822 recorded; page not in the packet$/)
})

test('sentence cell: the decided sentence is green, an open-state variant is amber, launch wording is red, nothing is red absent; Announced pages need a dated launch statement', () => {
  assert.deepEqual(colorReason(row('east-bay').cells.sentence), ['green', 'open'])
  const charlotte = row('charlotte').cells.sentence
  assert.deepEqual(colorReason(charlotte), ['amber', 'open-variant'])
  assert.equal(charlotte.detail, 'open, non-standard wording: "Alpha Charlotte is open K-8 for Fall 2026."; the decided sentence is "Alpha Charlotte is open and enrolling."')
  const kirkland = row('kirkland').cells.sentence
  assert.deepEqual(colorReason(kirkland), ['amber', 'open-variant'])
  assert.match(kirkland.detail, /"Alpha Kirkland is now open with rolling admissions\."/)
  assert.deepEqual(colorReason(row('new-york-city').cells.sentence), ['red', 'absent'])
  assert.match(row('new-york-city').cells.sentence.detail, /no open-state sentence/)
  assert.deepEqual(colorReason(sentenceCell({ text: 'Attend an Info Session Alpha East Bay is launching in Fall 2026.' }, 'Open')), ['red', 'launch'])
  assert.deepEqual(colorReason(sentenceCell({ text: 'Alpha East Bay is open K-8 for Fall 2026. Alpha East Bay is coming soon.' }, 'Open')), ['red', 'launch'], 'launch wording outranks an open variant')
  assert.deepEqual(colorReason(sentenceCell({ text: 'Alpha Nashville is now open and welcoming students.' }, 'Open')), ['amber', 'open-variant'])
  assert.deepEqual(colorReason(sentenceCell({ text: 'Alpha Boston is now open and enrolling.' }, 'Open')), ['green', 'open'])
  assert.deepEqual(colorReason(sentenceCell({ text: 'Our office is open Monday to Friday.' }, 'Open')), ['red', 'absent'], 'an open sentence must be about the campus')
  assert.equal(row('charlotte').cells.state.reason, 'agree', 'a variant does not contradict HubSpot')
  assert.deepEqual(colorReason(row('carrollton').cells.sentence), ['green', 'dated'])
  assert.deepEqual(colorReason(row('lake-travis').cells.sentence), ['green', 'dated'])
  assert.deepEqual(colorReason(row('franklin').cells.sentence), ['red', 'undated'])
  assert.deepEqual(colorReason(row('boston-suburbs').cells.sentence), ['red', 'absent'])
  assert.deepEqual(colorReason(sentenceCell({ text: 'Alpha Carrollton is open and enrolling.' }, 'Announced')), ['red', 'open-wording'])
  assert.deepEqual(colorReason(sentenceCell({ text: 'Alpha Carrollton is open K-8 for Fall 2026.' }, 'Announced')), ['red', 'open-wording'], 'a variant is open wording on an Announced page too')
})

test('team cell: leadership present and in the decided order (DoA and DoP first, campus staff, the shared Head of Schools last), missing people named, a registry row without leadership is grey', () => {
  assert.deepEqual(colorReason(row('boston').cells.team), ['red', 'missing'])
  assert.match(row('boston').cells.team.detail, /DoA Samantha Kravitz not on the page/)
  assert.deepEqual(colorReason(row('atlanta').cells.team), ['green', 'ordered'], 'Tasha Arnold as the only card is last')
  const eb = row('east-bay')
  assert.deepEqual(colorReason(eb.cells.team), ['red', 'misordered'])
  assert.match(eb.cells.team.detail, /Head of Schools \(card 1\) before campus staff \(card 11\); guide card 3 before leadership card 6 \(DoA@6 DoP@2 Head@1\)/)
  assert.deepEqual(colorReason(row('kirkland').cells.team), ['red', 'misordered'], 'DoA at card 2 after Tasha at card 1: Tasha is not last')
  const page = pageFor('east-bay')
  const staff = page.staff
  const byName = (name) => staff.find((s) => sameName(s.name, name))
  const others = staff.filter((s) => !['Free Gary', 'Kori Riordan', 'Tasha Arnold'].some((n) => sameName(s.name, n)))
  const ordered = teamCell(registries.leadership, 'east-bay', { staff: [byName('Free Gary'), byName('Kori Riordan'), ...others, byName('Tasha Arnold')] })
  assert.deepEqual(colorReason(ordered), ['green', 'ordered'])
  assert.equal(ordered.detail, 'DoA@1 DoP@2 Head@11')
  const dopFirst = teamCell(registries.leadership, 'east-bay', { staff: [byName('Kori Riordan'), byName('Free Gary'), ...others, byName('Tasha Arnold')] })
  assert.deepEqual(colorReason(dopFirst), ['green', 'ordered'], 'DoA and DoP are not ranked against each other')
  const tashaSecond = teamCell(registries.leadership, 'east-bay', { staff: [byName('Free Gary'), byName('Tasha Arnold'), byName('Kori Riordan'), ...others] })
  assert.deepEqual(colorReason(tashaSecond), ['red', 'misordered'], 'the 2026-09-25 reading (Tasha after DoA and DoP, before the guides) is misordered since the 2026-09-30 clarification')
  assert.equal(tashaSecond.detail, 'Head of Schools (card 2) before campus staff (card 11) (DoA@1 DoP@3 Head@2)')
  const guideFirst = teamCell({ campuses: { 'east-bay': { 'director-of-admissions': ['Free Gary'] } } }, 'east-bay', { staff: [byName('Sarah Rettig'), byName('Free Gary')] })
  assert.deepEqual(colorReason(guideFirst), ['red', 'misordered'])
  assert.match(guideFirst.detail, /^guide card 1 before leadership card 2/)
  // A campus's own head of school (listed on that campus only) is campus-present: leadership row, before the guides, not last.
  const own = { campuses: { brownsville: { 'head-of-schools': ['Paige L. Fults'], 'dean-of-parents': ['Heather McMahan'] }, ...registries.leadership.campuses } }
  assert.deepEqual(sharedHeadsOfSchools(own), ['tasha arnold'])
  const guide = (name) => ({ name, title: 'Guide' })
  const brownsville = teamCell(own, 'brownsville', { staff: [{ name: 'Heather McMahan', title: 'Dean of Parents' }, { name: 'Paige L. Fults', title: 'Head of School' }, guide('Morgan Swain'), guide('A Guide')] })
  assert.deepEqual([colorReason(brownsville), brownsville.detail], [['green', 'ordered'], 'DoP@1 Head@2'])
  const ownAfterGuide = teamCell(own, 'brownsville', { staff: [{ name: 'Heather McMahan', title: 'Dean of Parents' }, guide('Morgan Swain'), { name: 'Paige L. Fults', title: 'Head of School' }] })
  assert.deepEqual(colorReason(ownAfterGuide), ['red', 'misordered'], 'a campus-present head of school below a guide is a leadership card out of place')
  assert.match(ownAfterGuide.detail, /^guide card 2 before leadership card 3/)
  assert.deepEqual(colorReason(teamCell({ campuses: { austin: {} } }, 'austin', page)), ['grey', 'no-leadership'])
  assert.deepEqual(colorReason(teamCell({ campuses: {} }, 'austin', page)), ['grey', 'unrecorded'])
  assert.deepEqual(colorReason(teamCell(registries.leadership, 'east-bay', { staff: [] })), ['red', 'no-cards'])
})

test('packet cell: visible and recorded, interim hidden buttons, a visible placeholder, and registry drift', () => {
  assert.deepEqual(colorReason(row('east-bay').cells.packet), ['green', 'visible'])
  assert.deepEqual(colorReason(row('boca-raton').cells.packet), ['grey', 'interim'])
  assert.deepEqual(colorReason(row('south-bay-la').cells.packet), ['red', 'placeholder'])
  assert.deepEqual(colorReason(row('raleigh').cells.packet), ['red', 'drift'])
  assert.deepEqual(colorReason(packetCell(registries.packets, 'east-bay', { infoPacketLinks: [] })), ['red', 'absent'])
})

test('CTA cell: presence, a recorded exception, and source-dependent controls on Announced pages', () => {
  assert.ok(report.rows.filter((r) => r.state === 'Open').every((r) => r.cells.ctas.reason === 'present'), 'every Open page in this packet carries Book a Call, Apply and Info Session')
  assert.deepEqual(colorReason(row('franklin').cells.ctas), ['grey', 'conditional'])
  assert.deepEqual(colorReason(row('boston-suburbs').cells.ctas), ['green', 'present'])
  assert.ok(ctaException(registries.ctaExceptions, 'boston-suburbs', 'book-a-call', { state: 'Announced', now: NOW }), 'the hidden Book a Call exception is active while Announced')
  assert.equal(ctaException(registries.ctaExceptions, 'boston-suburbs', 'book-a-call', { state: 'Open', now: NOW }), null, 'lifecycle:Open expires the exception on Open')
  assert.equal(ctaException({ campuses: { x: { apply: { rule: 'hidden', expires: '2026-09-01' } } } }, 'x', 'apply', { state: 'Open', now: NOW }), null)
  assert.ok(ctaException({ campuses: { x: { apply: { rule: 'hidden', expires: '2026-10-01' } } } }, 'x', 'apply', { state: 'Open', now: NOW }))
})

test('incidents and tickets: first-seen dates and ticket references land on the cell they belong to, amber cells included', () => {
  const atlanta = row('atlanta').cells.card
  assert.equal(atlanta.firstSeen, '2026-09-02')
  assert.deepEqual(atlanta.incidents, ['SITE-13F7C2AABD'])
  assert.deepEqual(atlanta.tickets, [{ id: 'cmuep7wd000070agml9fxaia4', via: 'filer:IN_PROGRESS' }])
  const eastBay = row('east-bay').cells.card
  assert.equal(eastBay.firstSeen, '2026-09-02')
  assert.deepEqual(eastBay.tickets.map((t) => t.id), ['cmubrkkm800000agmvukxsioc'])
  assert.deepEqual([row('charlotte').cells.card.firstSeen, row('charlotte').cells.card.tickets], ['2026-09-25', []])
  assert.deepEqual([row('charlotte').cells.sentence.firstSeen, row('charlotte').cells.sentence.incidents], ['2026-09-25', ['SITE-AA527ED701']])
  const sbla = row('south-bay-la').cells.packet
  assert.equal(sbla.firstSeen, '2026-09-02')
  assert.deepEqual(sbla.tickets.map((t) => [t.id, t.via]), [['cmtmn1ruo000104i23vxtvu2w', 'filer:BLOCKED']])
  const resolved = packet.incidents.filter((i) => i.status === 'resolved')
  assert.ok(resolved.length >= 1)
  assert.ok(report.rows.every((r) => COLUMNS.every((c) => r.cells[c].incidents.every((id) => !resolved.some((i) => i.id === id)))), 'resolved incidents are never attached')
})

test('counts, header and markdown: amber counted apart from red, both detail sections, footer lines', () => {
  assert.equal(report.reportVersion, REPORT_VERSION)
  assert.equal(report.packet.runId, 'site-full-2026-09-28T06-22-58-124Z')
  assert.equal(report.packet.bundleVersion, '1.5')
  assert.equal(report.packet.completedAt, '2026-09-28T06:35:56.214Z')
  assert.equal(report.generatedAt, NOW.toISOString())
  const tally = (color) => report.rows.reduce((n, r) => n + COLUMNS.filter((c) => r.cells[c].color === color).length, 0)
  assert.equal(report.counts.red, tally('red')); assert.equal(report.counts.amber, tally('amber'))
  assert.equal(report.counts.byColumn.guide.red, 0, 'the guide column is advisory and never red')
  assert.deepEqual(report.counts.openRedByColumn, { state: 0, sentence: 1, card: 2, team: 14, packet: 2, ctas: 0, guide: 0 }, 'red cards: East Bay and The Woodlands (launch words in the picture)')
  assert.deepEqual(report.counts.openAmberByColumn, { state: 0, sentence: 2, card: 6, team: 0, packet: 0, ctas: 0, guide: 0 }, 'amber: Charlotte and Kirkland sentences; Atlanta, Charlotte, Fort Worth, Jamaica Plain, Miami and New York cards')
  assert.equal(report.counts.amberRows, 7); assert.equal(report.counts.redRows, 17)
  const markdown = renderMarkdown(report)
  assert.match(markdown, /^# Site truth report/)
  assert.match(markdown, /Packet run `site-full-2026-09-28T06-22-58-124Z` \(full mode, check bundle 1\.5, completed 2026-09-28T06:35:56\.214Z\)\. Report generated 2026-09-28T12:00:00\.000Z/)
  assert.match(markdown, /## Open campuses \(15\)/); assert.match(markdown, /## Announced campuses \(4\)/)
  assert.match(markdown, new RegExp(`\\| \\[Alpha East Bay\\]\\(https://alpha\\.school/east-bay/\\) \\| ${COLOR_MARK.green} agree \\| ${COLOR_MARK.green} open \\| ${COLOR_MARK.red} launch \\(since 2026-09-02, ticket cmubrkkm800000agmvukxsioc\\) \\| ${COLOR_MARK.red} misordered \\| ${COLOR_MARK.green} visible \\| ${COLOR_MARK.green} present \\| ${COLOR_MARK.green} present \\|`))
  assert.match(markdown, new RegExp(`\\| \\[Alpha Atlanta\\]\\(https://alpha\\.school/atlanta/\\) \\| ${COLOR_MARK.green} agree \\| ${COLOR_MARK.green} open \\| ${COLOR_MARK.amber} unapproved \\(since 2026-09-02, ticket cmuep7wd000070agml9fxaia4\\) \\|`))
  assert.match(markdown, new RegExp(`\\| \\[Alpha Charlotte\\]\\(https://alpha\\.school/charlotte/\\) \\| ${COLOR_MARK.green} agree \\| ${COLOR_MARK.amber} open-variant \\(since 2026-09-25\\) \\| ${COLOR_MARK.amber} unapproved \\(since 2026-09-25\\) \\|`))
  assert.ok(!/present \(since/.test(markdown), 'a green cell prints only its reason')
  assert.match(markdown, /## Red cells, in detail\n\n(?:.*\n)*- Alpha East Bay \(Open\), Intro card: launch\. attachment 8550 \(Piedmont-1024x704\.webp, alt empty, reads "Coming Fall 2026 To Piedmont"\); launch wording: Coming Fall, Fall 2026 \[first seen 2026-09-02; SITE-8137AC4FE6; ticket cmubrkkm800000agmvukxsioc \(filer:IN_PROGRESS\)\]/)
  assert.match(markdown, /## Amber cells \(needs approval or rewording\), in detail\n\n- Alpha Atlanta \(Open\), Intro card: unapproved\. attachment 8790 \(Best-things-to-do-in-Atlanta-Header-1024x576\.webp, alt empty, no text read \(OCR confidence 25\)\)/)
  assert.match(markdown, /- Alpha Charlotte \(Open\), Status sentence: open-variant\. open, non-standard wording: "Alpha Charlotte is open K-8 for Fall 2026\."/)
  assert.ok(!/Coming Fall 2026 To Roswell/.test(markdown), 'the registry note is gone from the report')
  assert.match(markdown, /- Open campuses: 15; Announced campuses: 4; rows with a red cell: 17; red cells: 24; rows with an amber cell: 7; amber cells \(needs approval\): 8\./)
  assert.match(markdown, /- Red by column \(Open only\): State 0, Status sentence 1, Intro card 2, Team section 14, Packet 2, CTAs 0, Guide video 0\./)
  assert.match(markdown, /- Needs approval by column \(Open only, amber\): State 0, Status sentence 2, Intro card 6, Team section 0, Packet 0, CTAs 0, Guide video 0\./)
  assert.match(markdown, new RegExp(`Intro card ${COLOR_MARK.green}7 ${COLOR_MARK.amber}6 ${COLOR_MARK.red}2 ${COLOR_MARK.grey}4`))
})

test('CLI: writes the markdown and JSON where asked and prints the headline with both counts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-truth-cli-'))
  const out = execFileSync(process.execPath, [path.join(here, 'site-truth-report.mjs'), '--packet', PACKET, '--registry-root', FIXTURE, '--out', path.join(dir, 'report.md'), '--json', path.join(dir, 'report.json'), '--now', NOW.toISOString()], { encoding: 'utf8', cwd: root })
  assert.match(out, /^site truth: 15 Open, 4 Announced, 24 red cells in 17 rows, 8 amber cells in 7 rows;/)
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'))
  assert.equal(json.rows.length, 19); assert.equal(json.generatedAt, NOW.toISOString())
  assert.equal(json.counts.amber, 8)
  assert.equal(fs.readFileSync(path.join(dir, 'report.md'), 'utf8'), renderMarkdown(report))
  fs.rmSync(dir, { recursive: true, force: true })
})
