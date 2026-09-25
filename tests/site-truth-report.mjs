#!/usr/bin/env node
/**
 * Site truth report (QC loop repair plan 2026-09-25, repair 9: "what MacKenzie sees"). One row per Open HubSpot
 * Program with an alpha.school campus page, and a second table for Announced programs, derived from the observer
 * packet's sources and the playbook registries, never from tickets. Each cell is green, red or grey with a one-word
 * reason; a red or grey cell that the packet carries an active incident for names the date the incident was first
 * seen and, when a ticket reference is known, the ticket it waits on.
 *
 *   node tests/site-truth-report.mjs --packet <dir> [--registry-root .] --out <report.md> [--json <report.json>]
 *       [--filer-report <filer-report.json>] [--now <ISO>]
 *
 * Inputs (all read-only):
 *   <packet>/manifest.json   run id, mode, bundle version, completedAt (header)
 *   <packet>/sources.json    hubspotPrograms (type, website), map.locations (programType), campusPages (text, staff,
 *                            media.images, links, bookCallLinks, applicationLinks, infoPacketLinks)
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
 *   sentence  Open: open | launch | absent | unfetched.  Announced: dated | undated | open-wording | absent | unfetched
 *   card      registry attachmentId vs the rendered intro slot: placed | video | mismatch | missing | unrecorded
 *             ("no card recorded": the registry has no row for an Open campus) | unobserved (the packet does not
 *             expose the slot) | not-open (Announced page with no row)
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
export const REPORT_VERSION = '0.1'
export const COLUMNS = ['state', 'sentence', 'card', 'team', 'packet', 'ctas', 'guide']
export const COLUMN_LABELS = { state: 'State', sentence: 'Status sentence', card: 'Intro card', team: 'Team section', packet: 'Packet', ctas: 'CTAs', guide: 'Guide video' }
export const COLORS = ['green', 'red', 'grey']
export const COLOR_MARK = { green: '\u{1F7E2}', red: '\u{1F534}', grey: '⚪' }
export const PUBLIC_HOSTS = ['alpha.school', 'www.alpha.school']
export const REGISTRY_FILES = {
  pages: 'registry/campus-pages.json',
  openMedia: 'registry/campus-open-media.json',
  leadership: 'registry/campus-leadership.json',
  packets: 'registry/campus-packets.json',
  ctaExceptions: 'registry/campus-cta-exceptions.json',
}
/** Launch-era wording (tests/page-check.mjs LAUNCH_WORDS) plus the sentence forms n8n writes on Announced pages. */
export const LAUNCH_WORDS = [/\bComing\s+Soon\b/i, /\bComing\s+(?:Fall|Spring|Winter|Summer)\b/i, /\bis\s+launching\b/i, /\bLaunching\s+(?:in\s+)?(?:Fall|Spring|Winter|Summer)\b/i, /\bOpening\s+(?:in\s+)?(?:Fall|Spring|Winter|Summer)\b/i, /\bopens\s+(?:in\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December|Fall|Spring|Winter|Summer)\b/i]
export const OPEN_SENTENCE = /\bis\s+(?:now\s+)?open\s+and\s+enrolling\b/i
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
  const filerReportFile = filerReport || path.join(dir, '..', 'filer-report.json')
  const filer = readJsonIf(filerReportFile)
  return { dir: path.resolve(dir), manifest, sources, incidents, findings, filer, filerReportFile: filer ? path.resolve(filerReportFile) : null }
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

export function sentenceCell(page, state) {
  if (!page) return cell('grey', 'unfetched', 'page not in the packet')
  const text = String(page.pageOwnedText || page.text || '')
  const open = text.match(OPEN_SENTENCE)
  const launch = LAUNCH_WORDS.map((re) => text.match(re)?.[0]).filter(Boolean)
  if (state === 'Open') {
    if (launch.length && !open) return cell('red', 'launch', `launch wording on an Open page: ${launch.join(', ')}`)
    if (launch.length && open) return cell('red', 'launch', `open sentence present but launch wording remains: ${launch.join(', ')}`)
    if (open) return cell('green', 'open', open[0])
    return cell('red', 'absent', 'no "is open and enrolling" sentence in the intro')
  }
  if (open) return cell('red', 'open-wording', `Announced page says "${open[0]}"`)
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
  return { attachmentId: id ? Number(id) : null, src: slot.src, file: String(slot.src || '').split('/').pop(), alt: slot.alt || '', staleLaunchSignal: Boolean(slot.staleLaunchSignal) }
}

export function cardCell(registry, slug, page, state) {
  const row = registry?.campuses?.[slug]
  const slot = renderedSlot(page)
  const hasVideo = Boolean(page?.media?.hasYouTubeVideo || page?.media?.youtubeVideos?.length)
  if (!row) {
    if (state !== 'Open') return cell('grey', 'not-open', 'no open-media row; Announced pages carry launch-stage media')
    return cell('red', 'unrecorded', `no card recorded for Open campus ${slug}${slot ? `; slot shows attachment ${slot.attachmentId ?? '?'} (${slot.file})` : ''}`)
  }
  if (row.status === 'missing' || row.openMedia === null) return cell('red', 'missing', row.current || row.note || 'registry: no approved asset yet')
  if (row.openMedia === 'video') {
    if (!page) return cell('grey', 'unfetched', 'approved video recorded; page not in the packet')
    if (hasVideo) return cell('green', 'video', row.note || 'approved campus video')
    if (slot) return cell('red', 'mismatch', `registry: approved video; slot shows attachment ${slot.attachmentId ?? '?'} (${slot.file})`)
    return cell('grey', 'unobserved', 'approved video recorded; the packet exposes no video or slot image')
  }
  if (!page) return cell('grey', 'unfetched', `card ${row.attachmentId} recorded; page not in the packet`)
  if (!slot) return cell('grey', 'unobserved', `card ${row.attachmentId} recorded; the packet exposes no intro slot image`)
  if (slot.attachmentId === row.attachmentId) return cell('green', 'placed', `attachment ${row.attachmentId} (${slot.file})`)
  return cell('red', 'mismatch', `registry attachment ${row.attachmentId}; slot shows ${slot.attachmentId ?? '?'} (${slot.file})`)
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
  const rows = programRows(sources).map((program) => {
    const slug = slugFor(program.url, registries.pages)
    const page = pagesByProgram.get(program.programId) || pagesByUrl.get(program.url) || null
    const mapLocation = mapById.get(program.programId) || null
    const sentence = sentenceCell(page, program.type)
    const cells = {
      state: stateCell(program, mapLocation, page, sentence),
      sentence,
      card: cardCell(registries.openMedia, slug, page, program.type),
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
  const counts = { open: 0, announced: 0, red: 0, byColumn: {} }
  for (const column of COLUMNS) counts.byColumn[column] = { green: 0, red: 0, grey: 0 }
  for (const row of rows) {
    if (row.state === 'Open') counts.open++; else counts.announced++
    for (const column of COLUMNS) { counts.byColumn[column][row.cells[column].color]++; if (row.cells[column].color === 'red') counts.red++ }
  }
  counts.redRows = rows.filter((r) => COLUMNS.some((c) => r.cells[c].color === 'red')).length
  counts.openRedByColumn = {}
  for (const column of COLUMNS) counts.openRedByColumn[column] = rows.filter((r) => r.state === 'Open' && r.cells[column].color === 'red').length
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

/** A green cell prints only its reason; the incident date and ticket belong to a red or grey cell (the JSON keeps them on every cell). */
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

function renderDetails(rows) {
  const lines = ['## Red cells, in detail', '']
  const reds = rows.flatMap((row) => COLUMNS.filter((c) => row.cells[c].color === 'red').map((c) => ({ row, column: c, cell: row.cells[c] })))
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
    `Derived from the packet's sources (HubSpot Programs, growth map, rendered campus pages) and the playbook registries, never from tickets. Programs from ${packet.programsSource}; ${packet.campusPages} campus pages in the packet. ${COLOR_MARK.green} as required, ${COLOR_MARK.red} defect, ${COLOR_MARK.grey} not observable, not required, or advisory; a dated cell names when the observer first saw the incident and the ticket it waits on when one is known.`,
    '',
    ...renderTable(open, 'Open campuses'),
    ...renderTable(announced, 'Announced campuses'),
    ...renderDetails(rows),
    '## Counts',
    '',
    `- Open campuses: ${counts.open}; Announced campuses: ${counts.announced}; rows with a red cell: ${counts.redRows}; red cells: ${counts.red}.`,
    `- Red by column (Open only): ${COLUMNS.map((c) => `${COLUMN_LABELS[c]} ${counts.openRedByColumn[c]}`).join(', ')}.`,
    `- All rows by column: ${COLUMNS.map((c) => `${COLUMN_LABELS[c]} ${COLOR_MARK.green}${counts.byColumn[c].green} ${COLOR_MARK.red}${counts.byColumn[c].red} ${COLOR_MARK.grey}${counts.byColumn[c].grey}`).join('; ')}.`,
    '',
    'Reason words: state agree | map:<type> | page:launch | page:open | no-map | unfetched. Sentence (Open) open | launch | absent; (Announced) dated | undated | open-wording | absent. Card placed | video | mismatch | missing | unrecorded (no card recorded) | unobserved | not-open. Team ordered | misordered | missing | no-cards | unrecorded | no-leadership. Packet visible | interim | placeholder | drift | absent | unrecorded. CTAs present | missing | conditional. Guide present | absent (advisory).',
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
  else io.log(`site truth: ${report.counts.open} Open, ${report.counts.announced} Announced, ${report.counts.red} red cells in ${report.counts.redRows} rows; ${typeof args.out === 'string' ? args.out : ''} ${typeof args.json === 'string' ? args.json : ''}`.trim())
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof SiteTruthError ? `${error.code}: ${error.message}` : error); process.exit(1) })
}
