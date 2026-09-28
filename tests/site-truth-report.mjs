#!/usr/bin/env node
/**
 * Site truth report (QC loop repair plan 2026-09-25, repair 9: "what MacKenzie sees"). One row per Open HubSpot
 * Program with an alpha.school campus page, and a second table for Announced programs, derived from the observer
 * packet's sources and the playbook registries, never from tickets. Each cell is green, amber, red or grey with a
 * one-word reason; a red, amber or grey cell that the packet carries an active incident for names the date the
 * incident was first seen and, when a ticket reference is known, the ticket it waits on.
 *
 * Every cell's detail comes from the packet (the rendered slot image or video embed, the vision pass's OCR reading,
 * the HubSpot fields), never from a registry free-text note (2026-09-28: the registry's `current` note for Atlanta
 * described a card that had been replaced by a stock skyline; the report repeated it). A registry contributes only
 * the approval (attachmentId, openMedia, status). Amber is the third level: the slot or sentence is plausible but not
 * the decided one, and needs an approval or a rewording rather than a repair; amber never counts as red.
 *
 *   node tests/site-truth-report.mjs --packet <dir> [--registry-root .] --out <report.md> [--json <report.json>]
 *       [--filer-report <filer-report.json>] [--now <ISO>]
 *
 * Inputs (all read-only):
 *   <packet>/manifest.json   run id, mode, bundle version, completedAt (header)
 *   <packet>/sources.json    hubspotPrograms (type, website), map.locations (programType), campusPages (text, staff,
 *                            media.images and media.youtubeVideos, links, bookCallLinks, applicationLinks, infoPacketLinks)
 *   <packet>/vision.json     optional: the vision pass's OCR reading per slot image (images[].pageUrl, slot, visionText,
 *                            confidence); the intro-card reading is the card cell's text
 *   <packet>/browser.json    optional: rendered routes; only embeds[].url and title are read, to name a campus video
 *   <packet>/incidents.json  active incidents: firstSeenAt per cell (mapped by requirementId, else check name)
 *   <packet>/findings.json   decisionPending ticket references
 *   <packet>/../filer-report.json (or --filer-report): existing[].existing.id and decisionPending[].decisionTicket,
 *                            the filer's ticket references for the same observer ids (optional)
 *   registries: campus-pages (slug and display name), campus-open-media (intro card), campus-leadership (team),
 *               campus-packets (packet), campus-cta-exceptions (recorded CTA exceptions)
 *
 * Columns and the reason words:
 *   state     HubSpot type vs growth-map programType vs page sentence: agree | map:<type> | page:launch | page:open |
 *             no-map | unfetched
 *   sentence  Open: open (the decided sentence "<Campus> is open and enrolling.") | open-variant (amber: an open-state
 *             sentence in other words, "is open K-8 for Fall 2026", "is now open with rolling admissions") | launch
 *             (launching, coming or opening-in wording on an Open page) | absent | unfetched.
 *             Announced: dated | undated | open-wording | absent | unfetched
 *   card      the intro slot as the packet observes it, graded in three levels, then matched to the registry's approval:
 *             red   launch (launch words in the vision reading, alt, filename or the observer's stale-launch signal) |
 *                   other-campus (the slot names another campus) | placeholder | empty (no slot image and no campus
 *                   video in the packet) | mismatch (the registry approves a different asset than the one rendered)
 *             amber unapproved (plausible media, a campus video or a photo with no launch words, that no registry row
 *                   approves; the detail names what is there)
 *             green placed (the approved card is rendered) | video (the approved campus video is on the page)
 *             grey  unobserved (approved video recorded; the packet exposes neither a slot image nor a campus video) |
 *                   not-open (Announced page: launch-stage media is expected) | unfetched
 *   team      leadership registry DoA, DoP and Head of Schools on the page, in the decided order (DoA and DoP before
 *             the Head of Schools, all three before any guide): ordered | misordered | missing | no-cards |
 *             unrecorded | no-leadership | unfetched
 *   packet    registry status vs page link: visible | interim (only responsive-hidden buttons; approved interim
 *             state) | placeholder | drift | absent | unrecorded | unfetched
 *   ctas      Book a Call, Apply, Info Session present or a recorded exception: present | missing | conditional
 *             (Announced: booking and apply are source dependent) | unfetched
 *   guide     "Meet Your Alpha <Campus> Guides" section or a campus video (advisory, never red): present | absent |
 *             unfetched
 *
 * Writes markdown (and JSON with --json). Never writes to APEX, WordPress or HubSpot.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const REPORT_VERSION = '0.2'
export const COLUMNS = ['state', 'sentence', 'card', 'team', 'packet', 'ctas', 'guide']
export const COLUMN_LABELS = { state: 'State', sentence: 'Status sentence', card: 'Intro card', team: 'Team section', packet: 'Packet', ctas: 'CTAs', guide: 'Guide video' }
export const COLORS = ['green', 'amber', 'red', 'grey']
export const COLOR_MARK = { green: '\u{1F7E2}', amber: '\u{1F7E1}', red: '\u{1F534}', grey: '⚪' }
/** A YouTube video on this many campus pages or more is site-wide content (the "30 Days to a Different Kid" trio), not a campus video. */
export const SHARED_VIDEO_PAGES = 4
/** Below this tesseract confidence a vision reading is noise (a photo read at 25) and is neither quoted nor searched for launch words. */
export const VISION_MIN_CONFIDENCE = 60
export const PLACEHOLDER_MEDIA = /placeholder|\blorem\b|\bsample\b/i
export const PUBLIC_HOSTS = ['alpha.school', 'www.alpha.school']
export const REGISTRY_FILES = {
  pages: 'registry/campus-pages.json',
  openMedia: 'registry/campus-open-media.json',
  leadership: 'registry/campus-leadership.json',
  packets: 'registry/campus-packets.json',
  ctaExceptions: 'registry/campus-cta-exceptions.json',
}
/** Launch-era wording (tests/page-check.mjs LAUNCH_WORDS) plus the sentence forms n8n writes on Announced pages. */
export const LAUNCH_WORDS = [/\bComing\s+Soon\b/i, /\bComing\s+(?:in\s+|this\s+)?(?:Fall|Spring|Winter|Summer)\b/i, /\bis\s+launching\b/i, /\bLaunching\s+(?:in\s+)?(?:Fall|Spring|Winter|Summer)\b/i, /\bOpening\s+(?:in\s+)?(?:Fall|Spring|Winter|Summer)\b/i, /\bopens\s+(?:in\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December|Fall|Spring|Winter|Summer)\b/i]
/**
 * Launch words painted into a slot image (the check bundle's campus.intro.media.current literals.launchWords): the sentence
 * list plus the forms a launch card carries ("Opening Soon", "Now Enrolling Fall 2026", a bare season and year). Only the
 * card cell uses these; "for Fall 2026" in an open sentence is not launch wording.
 */
export const SLOT_LAUNCH_WORDS = [...LAUNCH_WORDS, /\bOpening\s+Soon\b/i, /\b(?:Now\s+)?Enrolling\s+(?:Fall|Spring|Winter|Summer)\b/i, /\bLaunching\b/i, /\b(?:Fall|Spring|Winter|Summer)\s*[.,]?\s*20\d\d\b/i]
/** The decided open sentence (docs/decisions.md: "<Campus> is open and enrolling."). */
export const OPEN_SENTENCE = /\bis\s+(?:now\s+)?open\s+and\s+enrolling\b/i
/** Any other open-state sentence about the campus: "Alpha Charlotte is open K-8 for Fall 2026", "Alpha Kirkland is now open with rolling admissions". */
export const OPEN_VARIANT = /\bAlpha\s+[A-Z][^.!?\n]{0,60}?\b(?:is|are)\s+(?:now\s+)?open\b[^.!?\n]*/
export const DATED_LAUNCH = /(?:opens|launching|opening|coming)\s+(?:in\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December|Fall|Spring|Winter|Summer)\s+20\d\d/i
export const PLACEHOLDER_PACKET = /update link|\[|placeholder/i
export const GUIDE_SECTION = /\bMeet\s+Your\s+Alpha\b[^.]{0,60}\bGuides?\b/i
/** Leadership roles the team cell checks, in the decided order (spec/campus-page-requirements.json campus.team.order). */
export const LEADERSHIP_ROLES = ['director-of-admissions', 'dean-of-parents', 'head-of-schools']
export const ROLE_LABELS = { 'director-of-admissions': 'DoA', 'dean-of-parents': 'DoP', 'head-of-schools': 'Head' }
/** Cell to incident mapping: bundle requirement id prefixes first, observer check name prefixes as the fallback. */
export const CELL_INCIDENTS = {
  state: { requirements: ['campus.lifecycle'], checks: ['operations-map-lifecycle-conflict', 'hubspot-map-sync'] },
  sentence: { requirements: ['campus.intro.status'], checks: ['campus-page-status-sentence', 'campus-source-status-sentence'] },
  card: { requirements: ['campus.intro.media'], checks: ['campus-page-stale-launch-media', 'campus-page-youtube-video'] },
  team: { requirements: ['campus.team'], checks: ['campus-staff-'] },
  packet: { requirements: ['campus.resources.packet'], checks: ['campus-info-packet-'] },
  ctas: { requirements: ['campus.resources.booking', 'campus.resources.apply', 'campus.hero.ctas'], checks: ['campus-book-call-', 'campus-application-', 'primary-cta-count'] },
  guide: { requirements: ['campus.guide-videos'], checks: [] },
}

export class SiteTruthError extends Error {
  /** @param {'MISSING_ARG'|'BAD_PACKET'|'BAD_REGISTRY'} code */
  constructor(code, message, extra = {}) { super(message); this.name = 'SiteTruthError'; this.code = code; Object.assign(this, extra) }
}

export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2); const next = argv[i + 1]
    out[key] = next === undefined || next.startsWith('--') ? true : (i++, next)
  }
  return out
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const readJsonIf = (file) => (file && fs.existsSync(file) ? readJson(file) : null)

// ---------- loading ----------

/** Read the packet directory: manifest and sources are required, incidents and findings optional. */
export function loadPacket(dir, { filerReport = null } = {}) {
  if (!dir || dir === true) throw new SiteTruthError('MISSING_ARG', '--packet <dir> is required')
  const manifestFile = path.join(dir, 'manifest.json'); const sourcesFile = path.join(dir, 'sources.json')
  if (!fs.existsSync(manifestFile)) throw new SiteTruthError('BAD_PACKET', `${dir} has no manifest.json`)
  if (!fs.existsSync(sourcesFile)) throw new SiteTruthError('BAD_PACKET', `${dir} has no sources.json (an events-mode packet carries no campus pages; the report needs a full-mode packet)`)
  const manifest = readJson(manifestFile)
  const sources = readJson(sourcesFile)
  if (!Array.isArray(sources.campusPages)) throw new SiteTruthError('BAD_PACKET', `${sourcesFile} has no campusPages[] (mode ${manifest.mode || 'unknown'})`)
  const incidents = readJsonIf(path.join(dir, 'incidents.json')) || []
  const findings = readJsonIf(path.join(dir, 'findings.json')) || []
  const vision = readJsonIf(path.join(dir, 'vision.json'))
  const browser = readJsonIf(path.join(dir, 'browser.json'))
  const filerReportFile = filerReport || path.join(dir, '..', 'filer-report.json')
  const filer = readJsonIf(filerReportFile)
  return { dir: path.resolve(dir), manifest, sources, incidents, findings, filer, filerReportFile: filer ? path.resolve(filerReportFile) : null, vision: visionIndex(vision), embeds: embedIndex(browser) }
}

/** vision.json images grouped by canonical page URL (the packet's OCR readings; absent on an events-mode or older packet). */
export function visionIndex(vision) {
  const index = new Map()
  for (const image of vision?.images || []) {
    const key = canonicalUrl(image.pageUrl)
    if (!key) continue
    if (!index.has(key)) index.set(key, [])
    index.get(key).push(image)
  }
  return index
}

/** browser.json embed titles keyed by canonical page URL then video id (only YouTube embeds are kept). */
export function embedIndex(browser) {
  const index = new Map()
  for (const entry of Array.isArray(browser) ? browser : []) {
    const key = canonicalUrl(entry.url || entry.finalUrl)
    if (!key) continue
    if (!index.has(key)) index.set(key, new Map())
    for (const embed of entry.embeds || []) {
      const id = videoId(embed.url)
      if (id && !index.get(key).has(id) && embed.title) index.get(key).set(id, String(embed.title).replace(/\s*-\s*YouTube\s*$/i, '').trim())
    }
  }
  return index
}

export function loadRegistries(root = path.join(here, '..')) {
  const out = {}
  for (const [key, relative] of Object.entries(REGISTRY_FILES)) {
    const file = path.join(root, relative)
    if (!fs.existsSync(file)) throw new SiteTruthError('BAD_REGISTRY', `${relative} not found under ${root}`)
    out[key] = readJson(file)
  }
  out.root = path.resolve(root)
  return out
}

// ---------- helpers ----------

/** https://alpha.school/east-bay -> https://alpha.school/east-bay/ (lower-case host, no www, trailing slash, no query). */
export function canonicalUrl(value) {
  if (!value || typeof value !== 'string') return null
  let url
  try { url = new URL(value.trim()) } catch { return null }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  let pathname = url.pathname.replace(/\/+$/, '')
  if (!pathname) pathname = ''
  return `https://${host}${pathname}/`
}

export function isPublicHost(url) {
  try { return PUBLIC_HOSTS.includes(new URL(url).hostname.toLowerCase()) } catch { return false }
}

/** Person names as the page and the registry write them: no honorific, no credential, lower case, single spaces. */
export function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/\b(?:dr|mr|mrs|ms|prof)\.?\s+/g, '').split(',')[0].replace(/\b(?:phd|m\.div\.?|ed\.d\.?|m\.ed\.?)\b/g, '').replace(/[^a-z\s'-]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function sameName(a, b) {
  const x = normalizeName(a), y = normalizeName(b)
  if (!x || !y) return false
  if (x === y) return true
  const xs = x.split(' '), ys = y.split(' ')
  return xs[0] === ys[0] && xs[xs.length - 1] === ys[ys.length - 1]
}

/** The registry slug for a canonical campus URL, else the last path segment. */
export function slugFor(url, pages) {
  const canonical = canonicalUrl(url)
  for (const [slug, entry] of Object.entries(pages.campuses || {})) if (canonicalUrl(entry.url) === canonical) return slug
  const segments = new URL(canonical).pathname.split('/').filter(Boolean)
  return segments[segments.length - 1] || null
}

export function displayNameFor(slug, pages, fallback) {
  const entry = pages.campuses?.[slug]
  return entry?.names?.[0] || fallback || slug
}

const first = (list, predicate) => (list || []).find(predicate)

/** An active CTA exception (registry/campus-cta-exceptions.json) for the campus and CTA, honouring expiry. */
export function ctaException(registry, slug, cta, { state, now }) {
  const entry = registry?.campuses?.[slug]?.[cta]
  if (!entry) return null
  if (entry.expires === 'lifecycle:Open') return state === 'Open' ? null : entry
  if (entry.expires && typeof entry.expires === 'string') {
    const ends = Date.parse(entry.expires)
    if (Number.isFinite(ends) && now.getTime() >= ends) return null
  }
  return entry
}

function cell(color, reason, detail = null) {
  if (!COLORS.includes(color)) throw new Error(`bad cell colour ${color}`)
  return { color, reason, detail: detail || null, firstSeen: null, tickets: [], incidents: [] }
}

// ---------- cells ----------

/**
 * Open: the decided sentence is green; launching, coming or opening-in wording is red whatever else the intro says; an
 * open-state sentence in other words is amber (a rewording, not a repair); nothing of the kind is red absent.
 */
export function sentenceCell(page, state) {
  if (!page) return cell('grey', 'unfetched', 'page not in the packet')
  const text = String(page.pageOwnedText || page.text || '')
  const open = text.match(OPEN_SENTENCE)
  const variant = open ? null : text.match(OPEN_VARIANT)
  const launch = LAUNCH_WORDS.map((re) => text.match(re)?.[0]).filter(Boolean)
  if (state === 'Open') {
    if (launch.length && !open && !variant) return cell('red', 'launch', `launch wording on an Open page: ${launch.join(', ')}`)
    if (launch.length) return cell('red', 'launch', `open sentence present but launch wording remains: ${launch.join(', ')}`)
    if (open) return cell('green', 'open', open[0])
    if (variant) {
      const sentence = variant[0].trim()
      const subject = sentence.match(/^(Alpha\s+.*?)\s+(?:is|are)\b/)?.[1] || 'the campus'
      return cell('amber', 'open-variant', `open, non-standard wording: "${sentence}."; the decided sentence is "${subject} is open and enrolling."`)
    }
    return cell('red', 'absent', 'no open-state sentence about the campus in the intro (decided: "<Campus> is open and enrolling.")')
  }
  if (open || variant) return cell('red', 'open-wording', `Announced page says "${(open || variant)[0].trim()}"`)
  if (DATED_LAUNCH.test(text)) return cell('green', 'dated', text.match(DATED_LAUNCH)[0])
  if (launch.length) return cell('red', 'undated', `${launch.join(', ')} names no month or season and year`)
  return cell('red', 'absent', 'no launch statement in the intro')
}

export function stateCell(program, mapLocation, page, sentence) {
  const hubspotType = program.type
  if (!mapLocation) return cell('grey', 'no-map', `HubSpot ${hubspotType}; program not on the growth map`)
  if (mapLocation.programType !== hubspotType) return cell('red', `map:${mapLocation.programType}`, `HubSpot ${hubspotType}, growth map ${mapLocation.programType}`)
  if (!page) return cell('grey', 'unfetched', `HubSpot ${hubspotType}, map ${mapLocation.programType}; page not in the packet`)
  if (hubspotType === 'Open' && sentence.reason === 'launch') return cell('red', 'page:launch', `HubSpot and map Open; page carries launch wording`)
  if (hubspotType === 'Announced' && sentence.reason === 'open-wording') return cell('red', 'page:open', `HubSpot and map Announced; page says open and enrolling`)
  return cell('green', 'agree', `HubSpot ${hubspotType}, map ${mapLocation.programType}, page sentence ${sentence.reason}`)
}

/** The intro card slot as the packet renders it: the content_image widget's attachment id, else null. */
export function renderedSlot(page) {
  const images = page?.media?.images || []
  const slot = first(images, (img) => img.containerId === 'content_image') || null
  if (!slot) return null
  const id = slot.classes?.match(/wp-image-(\d+)/)?.[1]
  return { attachmentId: id ? Number(id) : null, src: slot.src, file: String(slot.src || '').split('/').pop(), alt: slot.alt || '', nearbyText: slot.nearbyText || '', staleLaunchSignal: Boolean(slot.staleLaunchSignal) }
}

/** The YouTube id of a watch, share or embed URL, else null. */
export function videoId(href) {
  const value = String(href || '')
  const match = value.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/) || value.match(/[?&]v=([A-Za-z0-9_-]{6,})/) || value.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/)
  return match ? match[1] : null
}

/** Video ids that appear on SHARED_VIDEO_PAGES or more of the packet's campus pages: site-wide content, never a campus video. */
export function sharedVideoIds(campusPages, threshold = SHARED_VIDEO_PAGES) {
  const count = new Map()
  for (const page of campusPages || []) for (const id of new Set((page.media?.youtubeVideos || []).map((v) => videoId(v.href)).filter(Boolean))) count.set(id, (count.get(id) || 0) + 1)
  return new Set([...count.entries()].filter(([, n]) => n >= threshold).map(([id]) => id))
}

/** The same asset at any WordPress size: /2026/01/Piedmont-1024x704.webp and /2026/01/Piedmont.webp. */
function assetKey(src) {
  return String(src || '').replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, '').replace(/-scaled(?=\.[a-z0-9]+$)/i, '').toLowerCase()
}

const cleanVision = (text) => String(text || '').replace(/\s+/g, ' ').trim()
const fileWords = (file) => decodeURIComponent(String(file || '')).replace(/\.[a-z0-9]+$/i, '').replace(/-\d+x\d+$/, '').replace(/[-_]+/g, ' ')

const bareName = (name) => String(name).replace(/^Alpha\s+/i, '').trim()
const namePattern = (bare) => new RegExp(`(?<![a-z])${bare.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`, 'i')

/** The page's own campus is named in the text (any registry name for the slug, with or without "Alpha"). */
export function namesOwnCampus(text, slug, pages) {
  const haystack = String(text || '')
  return (pages?.campuses?.[slug]?.names || []).some((n) => bareName(n) && namePattern(bareName(n)).test(haystack))
}

/** Another registered campus named in the slot's alt, filename or reading; the page's own names (and names they contain) never count. */
export function otherCampusIn(texts, slug, pages) {
  const own = (pages?.campuses?.[slug]?.names || []).map((n) => bareName(n).toLowerCase())
  const haystack = texts.filter(Boolean).map((t) => String(t).toLowerCase()).join(' \n ')
  if (!haystack.trim()) return null
  for (const [other, entry] of Object.entries(pages?.campuses || {})) {
    if (other === slug) continue
    for (const name of entry.names || []) {
      const bare = bareName(name)
      if (!bare || own.some((o) => o.includes(bare.toLowerCase()))) continue
      if (namePattern(bare).test(haystack)) return { slug: other, name: String(name) }
    }
  }
  return null
}

/**
 * What the intro slot holds, from the packet alone: the rendered content_image (with the vision pass's reading when it
 * is confident), the page's campus videos (YouTube ids that are not site-wide, titled from browser.json embeds), and
 * the launch words, other-campus name or placeholder found in any of it.
 */
export function observeSlot(page, { vision = [], embeds = new Map(), shared = new Set(), pages = null, slug = null } = {}) {
  if (!page) return null
  const image = renderedSlot(page)
  if (image) {
    const reading = (vision || []).find((v) => v.slot === 'intro-card' && assetKey(v.src || v.url) === assetKey(image.src)) || (vision || []).find((v) => v.slot === 'intro-card') || null
    image.confidence = Number.isFinite(reading?.confidence) ? reading.confidence : null
    image.text = reading && image.confidence >= VISION_MIN_CONFIDENCE ? cleanVision(reading.visionText) : null
    image.read = Boolean(reading)
  }
  // A campus video: a YouTube id that is not site-wide and whose embed title (when known) does not name another campus only
  // (the Scottsdale testimonial embedded on other campus pages is Scottsdale's, however few pages a trimmed packet holds).
  const seen = new Set()
  const videos = []
  for (const v of page.media?.youtubeVideos || []) {
    const id = videoId(v.href)
    if (!id || shared.has(id) || seen.has(id)) continue
    seen.add(id)
    const title = embeds?.get?.(id) || null
    if (title && otherCampusIn([title], slug, pages) && !namesOwnCampus(title, slug, pages)) continue
    videos.push({ id, href: v.href, title })
  }
  const texts = image ? [image.text, image.alt, fileWords(image.file), image.nearbyText] : []
  const launch = []
  for (const text of texts.filter(Boolean)) for (const re of SLOT_LAUNCH_WORDS) { const hit = text.match(re)?.[0]; if (hit && !launch.includes(hit)) launch.push(hit) }
  if (image && (image.staleLaunchSignal || (page.media?.staleLaunchSignals || []).length)) launch.push('observer stale-launch signal')
  const otherCampus = image ? otherCampusIn([image.alt, fileWords(image.file), image.text], slug, pages) : null
  const placeholder = Boolean(image && (PLACEHOLDER_MEDIA.test(image.alt) || PLACEHOLDER_MEDIA.test(fileWords(image.file))))
  return { image, videos, launch, otherCampus, placeholder }
}

function describeImage(image) {
  const text = image.text ? `reads "${image.text}"` : (image.read ? `no text read (OCR confidence ${image.confidence ?? '?'})` : 'not read by the vision pass')
  return `attachment ${image.attachmentId ?? '?'} (${image.file}, alt ${image.alt ? `"${image.alt}"` : 'empty'}, ${text})`
}

const describeVideos = (videos) => videos.map((v) => (v.title ? `"${v.title}" (${v.id})` : v.id)).join(', ')

/**
 * Intro card cell: the observation is graded first (red when the slot shows launch words, another campus, a placeholder
 * or nothing; amber when it holds plausible media that no registry row approves; green when the registry approves what
 * is rendered), and the registry contributes the approval only. `observation` is observeSlot(page, ...) when the caller
 * has the packet's vision readings and shared-video set; without it the page alone is observed.
 */
export function cardCell(registry, slug, page, state, observation = undefined) {
  const row = registry?.campuses?.[slug]
  const approvedCard = row?.openMedia === 'card' && Number.isInteger(row.attachmentId) ? row.attachmentId : null
  const approvedVideo = row?.openMedia === 'video'
  if (!page) return cell('grey', 'unfetched', `${approvedCard ? `card ${approvedCard} recorded` : approvedVideo ? 'approved video recorded' : 'no approved media recorded'}; page not in the packet`)
  const obs = observation === undefined ? observeSlot(page, { slug }) : observation
  const image = obs?.image || null
  const videos = obs?.videos || []
  const there = image ? describeImage(image) : videos.length ? `campus video ${describeVideos(videos)}` : 'no slot image and no campus video'
  if (state !== 'Open') return cell('grey', 'not-open', `Announced page (launch-stage media expected): ${there}`)
  if (obs?.launch?.length) return cell('red', 'launch', `${there}; launch wording: ${obs.launch.join(', ')}`)
  if (obs?.otherCampus) return cell('red', 'other-campus', `${there} names ${obs.otherCampus.name}`)
  if (obs?.placeholder) return cell('red', 'placeholder', there)
  if (image) {
    if (approvedCard && image.attachmentId === approvedCard) return cell('green', 'placed', there)
    if (approvedCard) return cell('red', 'mismatch', `registry approves attachment ${approvedCard}; slot shows ${there}`)
    if (approvedVideo) return cell('red', 'mismatch', `registry approves a campus video; slot shows ${there}`)
    return cell('amber', 'unapproved', `${there}: no registry row approves it; approve it (record the attachment) or replace it with the Open and Enrolling card`)
  }
  if (videos.length) {
    if (approvedVideo) return cell('green', 'video', there)
    if (approvedCard) return cell('red', 'mismatch', `registry approves attachment ${approvedCard}; the slot shows no image and the page carries ${there}`)
    return cell('amber', 'unapproved', `${there} on the page and no slot image: no registry row approves it; approve it (record openMedia video) or place the Open and Enrolling card`)
  }
  if (approvedVideo) return cell('grey', 'unobserved', 'approved video recorded; the packet exposes neither a slot image nor a campus video')
  if (approvedCard) return cell('red', 'empty', `registry approves attachment ${approvedCard}; the packet renders no intro slot image`)
  return cell('red', 'empty', `${there} in the packet (an mp4 video widget is not visible to the packet); no registry row approves anything`)
}

export function teamCell(registry, slug, page) {
  const roster = registry?.campuses?.[slug]
  if (!roster) return cell('grey', 'unrecorded', 'no leadership row in the registry')
  const expected = LEADERSHIP_ROLES.flatMap((role) => (roster[role] || []).map((name) => ({ role, name })))
  if (!expected.length) return cell('grey', 'no-leadership', 'registry row names no DoA, DoP or Head of Schools')
  if (!page) return cell('grey', 'unfetched', 'page not in the packet')
  const staff = page.staff || []
  if (!staff.length) return cell('red', 'no-cards', 'the page renders no team cards')
  const placed = expected.map((e) => ({ ...e, index: staff.findIndex((card) => sameName(card.name, e.name)) }))
  const missing = placed.filter((p) => p.index < 0)
  if (missing.length) return cell('red', 'missing', missing.map((m) => `${ROLE_LABELS[m.role]} ${m.name}`).join(', ') + ' not on the page')
  const top = placed.filter((p) => p.role !== 'head-of-schools').map((p) => p.index)
  const heads = placed.filter((p) => p.role === 'head-of-schools').map((p) => p.index)
  const firstGuide = staff.findIndex((card) => /\bguide\b/i.test(card.title || ''))
  const lastLeader = Math.max(...placed.map((p) => p.index))
  const problems = []
  if (top.length && heads.length && Math.max(...top) > Math.min(...heads)) problems.push(`Head of Schools (card ${Math.min(...heads) + 1}) before DoA/DoP (card ${Math.max(...top) + 1})`)
  if (firstGuide >= 0 && firstGuide < lastLeader) problems.push(`guide card ${firstGuide + 1} before leadership card ${lastLeader + 1}`)
  const order = placed.map((p) => `${ROLE_LABELS[p.role]}@${p.index + 1}`).join(' ')
  if (problems.length) return cell('red', 'misordered', `${problems.join('; ')} (${order})`)
  return cell('green', 'ordered', order)
}

export function packetCell(registry, slug, page) {
  const row = registry?.campuses?.[slug]
  if (!page) return cell('grey', 'unfetched', 'page not in the packet')
  const links = page.infoPacketLinks || []
  const visible = links.filter((l) => !l.hiddenOnAllViewports)
  const visiblePlaceholder = visible.find((l) => PLACEHOLDER_PACKET.test(l.text || '') || /\/\.\.\.\/?$/.test(l.href || ''))
  if (visiblePlaceholder) return cell('red', 'placeholder', `visible "${visiblePlaceholder.text}"`)
  const real = visible.filter((l) => !PLACEHOLDER_PACKET.test(l.text || ''))
  if (!links.length) return cell('red', 'absent', 'no info packet control on the page')
  if (!real.length) {
    if (!row) return cell('grey', 'interim', 'only responsive-hidden packet buttons; no registry row')
    return cell('grey', 'interim', 'only responsive-hidden packet buttons (approved interim state)')
  }
  if (!row) return cell('grey', 'unrecorded', `page shows "${real[0].text}"; no registry row`)
  const recorded = (row.packets || []).filter((p) => !p.hidden && !p.placeholder)
  const same = real.filter((l) => recorded.some((p) => canonicalUrl(p.url) === canonicalUrl(l.href)))
  if (same.length === real.length && recorded.length) return cell('green', 'visible', `${real.map((l) => l.text).join(', ')} (registry agrees)`)
  if (!recorded.length) return cell('red', 'drift', `page shows "${real[0].text}" ${real[0].href}; registry records no visible packet (asOf ${registry.asOf || '?'})`)
  return cell('red', 'drift', `page ${real.map((l) => l.href).join(', ')}; registry ${recorded.map((p) => p.url).join(', ')}`)
}

export function ctasCell(exceptions, slug, page, { state, now }) {
  if (!page) return cell('grey', 'unfetched', 'page not in the packet')
  const checks = [
    { cta: 'book-a-call', label: 'Book a Call', present: (page.bookCallLinks || []).length > 0 },
    { cta: 'apply', label: 'Apply', present: (page.applicationLinks || []).length > 0 },
    { cta: 'info-session', label: 'Info Session', present: (page.links || []).some((l) => /info session/i.test(l.text || '')) },
  ]
  const missing = []; const excepted = []; const conditional = []
  for (const c of checks) {
    if (c.present) continue
    const exception = ctaException(exceptions, slug, c.cta, { state, now })
    if (exception) { excepted.push(`${c.label} (${exception.rule}: ${exception.decidedBy || 'recorded'})`); continue }
    if (state !== 'Open' && c.cta !== 'info-session') { conditional.push(c.label); continue }
    missing.push(c.label)
  }
  const detail = [checks.filter((c) => c.present).map((c) => c.label).join(', ') + ' present', excepted.length ? 'exception: ' + excepted.join('; ') : '', conditional.length ? 'source dependent while Announced: ' + conditional.join(', ') : ''].filter(Boolean).join('; ')
  if (missing.length) return cell('red', 'missing', `${missing.join(', ')} missing; ${detail}`)
  if (conditional.length) return cell('grey', 'conditional', detail)
  return cell('green', 'present', detail)
}

export function guideCell(page) {
  if (!page) return cell('grey', 'unfetched', 'page not in the packet')
  const text = String(page.text || '')
  const heading = (page.headings || []).find((h) => GUIDE_SECTION.test(h)) || text.match(GUIDE_SECTION)?.[0]
  const videos = page.media?.youtubeVideos?.length || 0
  if (heading) return cell('green', 'present', `${heading}${videos ? `; ${videos} video(s)` : ''}`)
  if (videos) return cell('green', 'present', `${videos} campus video(s); no Meet Your Guides heading`)
  return cell('grey', 'absent', 'no "Meet Your Alpha <Campus> Guides" section (advisory)')
}

// ---------- incidents and tickets ----------

function incidentMatchesCell(incident, column) {
  const map = CELL_INCIDENTS[column]
  const requirement = String(incident.requirementId || '')
  if (requirement && map.requirements.some((prefix) => requirement === prefix || requirement.startsWith(prefix + '.'))) return true
  const check = String(incident.check || incident.observerCheck || '')
  return map.checks.some((prefix) => check === prefix || check.startsWith(prefix))
}

/** Ticket references keyed by observer incident id: findings' decisionPending and the filer report's existing tickets. */
export function ticketIndex(findings, filer) {
  const index = new Map()
  const add = (id, ticket, via) => { if (!id || !ticket) return; const list = index.get(id) || []; if (!list.some((t) => t.id === ticket)) list.push({ id: ticket, via }); index.set(id, list) }
  for (const f of findings || []) add(f.id, f.decisionPending, 'decisionPending')
  for (const group of filer?.existing || []) for (const id of group.observerIds || []) add(id, group.existing?.id, `filer:${group.existing?.status || 'open'}`)
  for (const group of filer?.decisionPending || []) for (const id of group.observerIds || []) add(id, group.decisionTicket, 'decisionTicket')
  return index
}

export function attachIncidents(cells, { programId, pageUrl, incidents, tickets }) {
  const canonical = canonicalUrl(pageUrl)
  const mine = (incidents || []).filter((i) => i.status !== 'resolved' && ((programId && i.programId === programId) || (canonical && canonicalUrl(i.url) === canonical)))
  for (const column of COLUMNS) {
    const hits = mine.filter((i) => incidentMatchesCell(i, column))
    if (!hits.length) continue
    const c = cells[column]
    c.incidents = hits.map((i) => i.id)
    const seen = hits.map((i) => Date.parse(i.firstSeenAt || i.firstSeen || '')).filter(Number.isFinite)
    c.firstSeen = seen.length ? new Date(Math.min(...seen)).toISOString().slice(0, 10) : null
    c.tickets = [...new Map(hits.flatMap((i) => tickets.get(i.id) || []).map((t) => [t.id, t])).values()]
  }
  return cells
}

// ---------- rows ----------

/** Open and Announced HubSpot Programs with an alpha.school page. Falls back to the growth map when the packet has no programs. */
export function programRows(sources) {
  const programs = Array.isArray(sources.hubspotPrograms) ? sources.hubspotPrograms : []
  const rows = []
  if (programs.length) {
    for (const p of programs) {
      const props = p.properties || {}
      const type = props.type
      if (!['Open', 'Announced'].includes(type)) continue
      const url = canonicalUrl(props.website)
      if (!url || !isPublicHost(url)) continue
      rows.push({ programId: `program-${p.id}`, hubspotId: String(p.id), name: props.display_name || props.name, type, url, source: 'hubspot-programs' })
    }
  } else {
    for (const loc of sources.map?.locations || []) {
      if (!['Open', 'Announced'].includes(loc.programType)) continue
      const url = canonicalUrl(loc.url)
      if (!url || !isPublicHost(url)) continue
      rows.push({ programId: loc.id, hubspotId: String(loc.id).replace(/^program-/, ''), name: loc.name, type: loc.programType, url, source: 'growth-map' })
    }
  }
  return rows.sort((a, b) => a.url.localeCompare(b.url) || a.hubspotId.localeCompare(b.hubspotId))
}

export function buildReport(packet, registries, { now = new Date() } = {}) {
  const { manifest, sources, incidents, findings, filer } = packet
  const mapById = new Map((sources.map?.locations || []).map((l) => [l.id, l]))
  const pagesByProgram = new Map((sources.campusPages || []).map((p) => [p.program?.id, p]))
  const pagesByUrl = new Map((sources.campusPages || []).map((p) => [canonicalUrl(p.finalUrl || p.url), p]))
  const tickets = ticketIndex(findings, filer)
  const shared = sharedVideoIds(sources.campusPages)
  const vision = packet.vision instanceof Map ? packet.vision : visionIndex(packet.vision)
  const embeds = packet.embeds instanceof Map ? packet.embeds : embedIndex(packet.embeds)
  const rows = programRows(sources).map((program) => {
    const slug = slugFor(program.url, registries.pages)
    const page = pagesByProgram.get(program.programId) || pagesByUrl.get(program.url) || null
    const mapLocation = mapById.get(program.programId) || null
    const sentence = sentenceCell(page, program.type)
    const pageKey = page ? canonicalUrl(page.finalUrl || page.url) : null
    const observation = page ? observeSlot(page, { vision: vision.get(pageKey) || vision.get(program.url) || [], embeds: embeds.get(pageKey) || embeds.get(program.url) || new Map(), shared, pages: registries.pages, slug }) : null
    const cells = {
      state: stateCell(program, mapLocation, page, sentence),
      sentence,
      card: cardCell(registries.openMedia, slug, page, program.type, observation),
      team: teamCell(registries.leadership, slug, page),
      packet: packetCell(registries.packets, slug, page),
      ctas: ctasCell(registries.ctaExceptions, slug, page, { state: program.type, now }),
      guide: guideCell(page),
    }
    attachIncidents(cells, { programId: program.programId, pageUrl: program.url, incidents, tickets })
    return { slug, campus: displayNameFor(slug, registries.pages, program.name), programId: program.programId, hubspotId: program.hubspotId, hubspotName: program.name, state: program.type, url: program.url, pageFetched: Boolean(page), pageStatus: page?.status ?? null, cells }
  })
  // Two programs on one page (Greenwich Port Chester and Greenwich Armonk): keep both rows, name the program on each.
  const perSlug = new Map()
  for (const row of rows) perSlug.set(row.slug, (perSlug.get(row.slug) || 0) + 1)
  for (const row of rows) if (perSlug.get(row.slug) > 1) { row.sharedPage = true; row.campus = `${row.campus} (HubSpot: ${row.hubspotName})` }
  const counts = { open: 0, announced: 0, red: 0, amber: 0, byColumn: {} }
  for (const column of COLUMNS) counts.byColumn[column] = { green: 0, amber: 0, red: 0, grey: 0 }
  for (const row of rows) {
    if (row.state === 'Open') counts.open++; else counts.announced++
    for (const column of COLUMNS) { const color = row.cells[column].color; counts.byColumn[column][color]++; if (color === 'red') counts.red++; if (color === 'amber') counts.amber++ }
  }
  counts.redRows = rows.filter((r) => COLUMNS.some((c) => r.cells[c].color === 'red')).length
  counts.amberRows = rows.filter((r) => COLUMNS.some((c) => r.cells[c].color === 'amber')).length
  counts.openRedByColumn = {}
  counts.openAmberByColumn = {}
  for (const column of COLUMNS) {
    counts.openRedByColumn[column] = rows.filter((r) => r.state === 'Open' && r.cells[column].color === 'red').length
    counts.openAmberByColumn[column] = rows.filter((r) => r.state === 'Open' && r.cells[column].color === 'amber').length
  }
  return {
    reportVersion: REPORT_VERSION,
    generatedAt: now.toISOString(),
    packet: { dir: packet.dir, runId: manifest.runId || null, mode: manifest.mode || null, bundleVersion: manifest.bundleVersion || manifest.checkBundle?.version || null, completedAt: manifest.completedAt || manifest.generatedAt || null, programsSource: rows[0]?.source || (Array.isArray(sources.hubspotPrograms) && sources.hubspotPrograms.length ? 'hubspot-programs' : 'growth-map'), campusPages: (sources.campusPages || []).length, filerReport: packet.filerReportFile },
    registries: { root: registries.root, files: REGISTRY_FILES },
    columns: COLUMNS.map((c) => ({ id: c, label: COLUMN_LABELS[c], advisory: c === 'guide' })),
    rows,
    counts,
  }
}

// ---------- markdown ----------

/** A green cell prints only its reason; the incident date and ticket belong to a red, amber or grey cell (the JSON keeps them on every cell). */
function renderCell(c) {
  const parts = [`${COLOR_MARK[c.color]} ${c.reason}`]
  if (c.color === 'green') return parts[0]
  const extra = []
  if (c.firstSeen) extra.push(`since ${c.firstSeen}`)
  if (c.tickets?.length) extra.push(`ticket ${c.tickets.map((t) => t.id).join(', ')}`)
  if (extra.length) parts.push(`(${extra.join(', ')})`)
  return parts.join(' ')
}

const esc = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

function renderTable(rows, title) {
  const lines = [`## ${title} (${rows.length})`, '']
  if (!rows.length) { lines.push('_none_', ''); return lines }
  lines.push(`| Campus | ${COLUMNS.map((c) => COLUMN_LABELS[c]).join(' | ')} |`)
  lines.push(`| --- | ${COLUMNS.map(() => '---').join(' | ')} |`)
  for (const row of rows) lines.push(`| [${esc(row.campus)}](${row.url}) | ${COLUMNS.map((c) => esc(renderCell(row.cells[c]))).join(' | ')} |`)
  lines.push('')
  return lines
}

function renderDetails(rows, color, title) {
  const lines = [`## ${title}`, '']
  const reds = rows.flatMap((row) => COLUMNS.filter((c) => row.cells[c].color === color).map((c) => ({ row, column: c, cell: row.cells[c] })))
  if (!reds.length) { lines.push('_none_', ''); return lines }
  for (const { row, column, cell: c } of reds) {
    const refs = [c.firstSeen ? `first seen ${c.firstSeen}` : 'no incident in the packet', c.incidents?.length ? c.incidents.join(', ') : '', c.tickets?.length ? 'ticket ' + c.tickets.map((t) => `${t.id} (${t.via})`).join(', ') : ''].filter(Boolean).join('; ')
    lines.push(`- ${esc(row.campus)} (${row.state}), ${COLUMN_LABELS[column]}: ${c.reason}. ${esc(c.detail || '')} [${refs}]`)
  }
  lines.push('')
  return lines
}

export function renderMarkdown(report) {
  const { packet, counts, rows } = report
  const open = rows.filter((r) => r.state === 'Open'); const announced = rows.filter((r) => r.state === 'Announced')
  const lines = [
    '# Site truth report',
    '',
    `Packet run \`${packet.runId || 'unknown'}\` (${packet.mode || 'unknown'} mode, check bundle ${packet.bundleVersion || 'unknown'}, completed ${packet.completedAt || 'unknown'}). Report generated ${report.generatedAt} by tests/site-truth-report.mjs ${report.reportVersion}.`,
    '',
    `Derived from the packet's sources (HubSpot Programs, growth map, rendered campus pages, the vision pass's readings) and the playbook registries, never from tickets or registry notes. Programs from ${packet.programsSource}; ${packet.campusPages} campus pages in the packet. ${COLOR_MARK.green} as decided, ${COLOR_MARK.amber} plausible but not approved or not the decided wording (needs an approval or a rewording, never counted as red), ${COLOR_MARK.red} defect, ${COLOR_MARK.grey} not observable, not required, or advisory; a dated cell names when the observer first saw the incident and the ticket it waits on when one is known.`,
    '',
    ...renderTable(open, 'Open campuses'),
    ...renderTable(announced, 'Announced campuses'),
    ...renderDetails(rows, 'red', 'Red cells, in detail'),
    ...renderDetails(rows, 'amber', 'Amber cells (needs approval or rewording), in detail'),
    '## Counts',
    '',
    `- Open campuses: ${counts.open}; Announced campuses: ${counts.announced}; rows with a red cell: ${counts.redRows}; red cells: ${counts.red}; rows with an amber cell: ${counts.amberRows}; amber cells (needs approval): ${counts.amber}.`,
    `- Red by column (Open only): ${COLUMNS.map((c) => `${COLUMN_LABELS[c]} ${counts.openRedByColumn[c]}`).join(', ')}.`,
    `- Needs approval by column (Open only, amber): ${COLUMNS.map((c) => `${COLUMN_LABELS[c]} ${counts.openAmberByColumn[c]}`).join(', ')}.`,
    `- All rows by column: ${COLUMNS.map((c) => `${COLUMN_LABELS[c]} ${COLOR_MARK.green}${counts.byColumn[c].green} ${COLOR_MARK.amber}${counts.byColumn[c].amber} ${COLOR_MARK.red}${counts.byColumn[c].red} ${COLOR_MARK.grey}${counts.byColumn[c].grey}`).join('; ')}.`,
    '',
    'Reason words: state agree | map:<type> | page:launch | page:open | no-map | unfetched. Sentence (Open) open | open-variant (amber: open-state wording other than "<Campus> is open and enrolling.") | launch | absent; (Announced) dated | undated | open-wording | absent. Card (from the observed slot) launch | other-campus | placeholder | empty | mismatch (red) | unapproved (amber: plausible media with no registry approval) | placed | video (green) | unobserved | not-open (grey). Team ordered | misordered | missing | no-cards | unrecorded | no-leadership. Packet visible | interim | placeholder | drift | absent | unrecorded. CTAs present | missing | conditional. Guide present | absent (advisory).',
    '',
  ]
  return lines.join('\n')
}

// ---------- CLI ----------

export async function main(argv = process.argv.slice(2), io = { log: console.log, error: console.error }) {
  const args = parseArgs(argv)
  const packet = loadPacket(args.packet, { filerReport: typeof args['filer-report'] === 'string' ? args['filer-report'] : null })
  const registries = loadRegistries(typeof args['registry-root'] === 'string' ? args['registry-root'] : path.join(here, '..'))
  const now = typeof args.now === 'string' ? new Date(args.now) : new Date()
  if (Number.isNaN(now.getTime())) throw new SiteTruthError('MISSING_ARG', `--now must be an ISO time, got ${args.now}`)
  const report = buildReport(packet, registries, { now })
  const markdown = renderMarkdown(report)
  if (typeof args.out === 'string') { fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true }); fs.writeFileSync(args.out, markdown) }
  if (typeof args.json === 'string') { fs.mkdirSync(path.dirname(path.resolve(args.json)), { recursive: true }); fs.writeFileSync(args.json, JSON.stringify(report, null, 2) + '\n') }
  if (typeof args.out !== 'string' && typeof args.json !== 'string') io.log(markdown)
  else io.log(`site truth: ${report.counts.open} Open, ${report.counts.announced} Announced, ${report.counts.red} red cells in ${report.counts.redRows} rows, ${report.counts.amber} amber cells in ${report.counts.amberRows} rows; ${typeof args.out === 'string' ? args.out : ''} ${typeof args.json === 'string' ? args.json : ''}`.trim())
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof SiteTruthError ? `${error.code}: ${error.message}` : error); process.exit(1) })
}
