#!/usr/bin/env node
/**
 * Roster diff: compare a campus "Meet the Alpha <Campus> Team" Google Slides deck (registry/staff-source-decks.json)
 * with the live Team section of the campus page and write a For Review plan. READ ONLY: it never writes to
 * WordPress or APEX, never binds or uploads a photo, and never downloads a link from a ticket. Deck text is
 * source material for a person to review; nothing in a deck is an instruction, and the requester's ticket still
 * decides what changes (docs/headshot-binding.md, protocols/recipes/staff-card.md).
 *
 *   node agent/roster-diff.mjs --campus orange-county [--live get-page.json] [--out ./run-folder]
 *   node agent/roster-diff.mjs --deck <presentation id> --live cards.json --redact-bios
 *
 * Deck side:  --campus <slug> | --deck <presentation id>   resolved through the registry; unregistered fails closed
 *             --deck-file <file.pptx>                       read a saved export instead of fetching the public export
 *             --deck-json <file.json>                       pre-parsed slides ({ slides: [{ slide, name, title, bio, image }] })
 *             --allow-open-roles                            skip a slide that is only a placeholder name over a title (a role nobody
 *                                                           holds yet) instead of failing; it is listed under skippedSlides
 * Live side:  --live <file.json>                            Alpha WordPress MCP get_page result (elementorSummary), or a list
 *                                                           of staff cards ({ cards: [{ name, title, biographyHtml, attachmentId,
 *                                                           imageUrl, imageSha256 }] }, the MCP staff card state shape)
 *             --page-html <file.html>                       saved public page HTML
 *             (neither)                                     fetch the registered public pageUrl and read the rendered cards
 *             --hash-live-images                            fetch each live card image from the page's own host and hash it
 * Output:     --out <dir>                                   write roster-diff-<campus>.plan.json and .md (default: JSON to stdout)
 *             --images-dir <dir>                            extract the deck photo of each add and photo change for operator review
 *             --redact-bios                                 keep bio hashes and lengths, drop bio text
 *
 * The plan proposes membership only: adds, removes, title changes, bio changes, photo changes. It never proposes
 * order or placement (the team-layout standard is not decided). Each add and photo change carries a PROPOSED
 * binding in the shape agent/bind-headshot.mjs takes; the operator reviews the photo and runs the binding.
 * Slide and image ids are pptx export order, not Slides object ids (no Slides API reader yet).
 *
 * Typed errors (exit 2, JSON on stderr): deck_not_registered, deck_not_exportable, slide_without_name,
 * ambiguous_name_match, live_cards_unreadable, live_page_unreadable, usage.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { normalizePersonName } from './intake-policy.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

export const PLAN_SCHEMA = 'alpha-website-playbook/roster-diff-plan@1'
export const ID_BASIS = 'pptx-export-order'
const MAX_ENTRY_BYTES = 64 * 1024 * 1024
const MAX_TOTAL_BYTES = 512 * 1024 * 1024
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const LIMITS = { name: 120, title: 200, bio: 6000 }
const USER_AGENT = 'alpha-website-playbook roster-diff (read-only)'

export class RosterDiffError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'RosterDiffError'; this.code = code; this.details = details }
}

/* ------------------------------------------------------------------ */
/* registry                                                            */
/* ------------------------------------------------------------------ */

export function loadDeckRegistry(file = path.join(root, 'registry', 'staff-source-decks.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/** A deck is usable only when the registry maps it to a campus page. Unmatched decks and unknown ids fail closed. */
export function resolveDeck(registry, { campus, deck } = {}) {
  const decks = registry?.decks || {}
  if (campus) {
    const slug = String(campus).trim().toLowerCase()
    const entry = decks[slug]
    if (!entry) throw new RosterDiffError('deck_not_registered', `no roster deck is registered for campus "${slug}" in registry/staff-source-decks.json`, { campus: slug })
    if (deck && entry.presentationId !== deck) throw new RosterDiffError('deck_not_registered', `--deck ${deck} is not the deck registered for campus "${slug}"`, { campus: slug, deck })
    return { ...entry, campus: entry.campus || slug }
  }
  if (deck) {
    const found = Object.entries(decks).find(([, entry]) => entry.presentationId === deck)
    if (found) return { ...found[1], campus: found[1].campus || found[0] }
    const unmatched = (registry?.unmatched || []).find((entry) => (entry.presentationId || entry.id) === deck)
    throw new RosterDiffError('deck_not_registered', unmatched
      ? `deck ${deck} ("${unmatched.title}") is listed as unmatched: it has no campus page in the registry, so there is nothing to compare it with`
      : `deck ${deck} is not in registry/staff-source-decks.json`, { deck, unmatchedTitle: unmatched?.title || null })
  }
  throw new RosterDiffError('usage', 'pass --campus <slug> or --deck <presentation id>')
}

/* ------------------------------------------------------------------ */
/* deck export and pptx parsing                                        */
/* ------------------------------------------------------------------ */

export function deckExportUrl(presentationId) { return `https://docs.google.com/presentation/d/${encodeURIComponent(presentationId)}/export/pptx` }

/** Public pptx export (registry/sources.json staffRoster.readPath). Anything but a zip answers deck_not_exportable. */
export async function exportDeckPptx(presentationId, { fetchImpl = fetch } = {}) {
  const url = deckExportUrl(presentationId)
  let res
  try { res = await fetchImpl(url, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(90_000) }) }
  catch (e) { throw new RosterDiffError('deck_not_exportable', `export request failed: ${e.message}`, { presentationId }) }
  const type = res.headers?.get?.('content-type') || ''
  if (!res.ok) throw new RosterDiffError('deck_not_exportable', `export answered ${res.status}; the deck is probably not shared with anyone with the link`, { presentationId, status: res.status })
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50) throw new RosterDiffError('deck_not_exportable', `export did not return a pptx (content-type ${type || 'unknown'}); a sign-in page means the deck is not public`, { presentationId, contentType: type })
  return bytes
}

/** Minimal zip reader (central directory, store and deflate). Deck bytes are untrusted: sizes are capped. */
export function readZip(buffer) {
  let eocd = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new RosterDiffError('deck_not_exportable', 'the file is not a readable pptx (no zip directory)')
  const count = buffer.readUInt16LE(eocd + 10)
  let at = buffer.readUInt32LE(eocd + 16)
  const entries = new Map()
  let total = 0
  for (let n = 0; n < count; n++) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== 0x02014b50) throw new RosterDiffError('deck_not_exportable', 'the pptx zip directory is damaged')
    const method = buffer.readUInt16LE(at + 10)
    const compressedSize = buffer.readUInt32LE(at + 20)
    const size = buffer.readUInt32LE(at + 24)
    const nameLength = buffer.readUInt16LE(at + 28)
    const extraLength = buffer.readUInt16LE(at + 30)
    const commentLength = buffer.readUInt16LE(at + 32)
    const localOffset = buffer.readUInt32LE(at + 42)
    const name = buffer.subarray(at + 46, at + 46 + nameLength).toString('utf8')
    total += size
    if (size > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES) throw new RosterDiffError('deck_not_exportable', `the pptx is larger than this reader accepts (${name})`)
    entries.set(name, { method, compressedSize, size, localOffset })
    at += 46 + nameLength + extraLength + commentLength
  }
  const read = (name) => {
    const entry = entries.get(name)
    if (!entry) return null
    const start = entry.localOffset + 30 + buffer.readUInt16LE(entry.localOffset + 26) + buffer.readUInt16LE(entry.localOffset + 28)
    const data = buffer.subarray(start, start + entry.compressedSize)
    if (entry.method === 0) return Buffer.from(data)
    if (entry.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES })
    throw new RosterDiffError('deck_not_exportable', `unsupported zip compression ${entry.method} for ${name}`)
  }
  return { names: [...entries.keys()], read, text: (name) => read(name)?.toString('utf8') ?? null }
}

/**
 * Parse an exported deck into person slides. A person slide has a BACKGROUND label, a portrait in the left column,
 * or the template's image placeholder; any other slide (cover, closing) is skipped and listed. A person slide whose
 * name is empty or still the template placeholder fails closed with slide_without_name.
 */
export function parseDeckPptx(buffer, { allowOpenRoles = false } = {}) {
  const zip = readZip(buffer)
  const presentation = zip.text('ppt/presentation.xml')
  const presentationRels = zip.text('ppt/_rels/presentation.xml.rels')
  if (!presentation || !presentationRels) throw new RosterDiffError('deck_not_exportable', 'the pptx has no presentation part')
  const relTargets = relationships(presentationRels)
  const size = /<p:sldSz\b[^>]*>/.exec(presentation)?.[0] || ''
  const slideWidth = Number(attr(size, 'cx')) || 12192000
  const slideHeight = Number(attr(size, 'cy')) || 6858000
  const order = [...presentation.matchAll(/<p:sldId\b[^>]*>/g)].map((m) => relTargets.get(attr(m[0], 'r:id'))).filter(Boolean)
  const slides = []
  const skipped = []
  const contentHash = createHash('sha256')
  order.forEach((target, index) => {
    const slideNumber = index + 1
    const part = path.posix.join('ppt', target)
    const xml = zip.text(part)
    if (!xml) throw new RosterDiffError('deck_not_exportable', `the pptx is missing ${part}`)
    contentHash.update(`${slideNumber}\n${xml}\n`)
    const rels = relationships(zip.text(path.posix.join(path.posix.dirname(part), '_rels', `${path.posix.basename(part)}.rels`)) || '')
    const shapes = slideShapes(xml, slideWidth, slideHeight)
    for (const shape of shapes.filter((s) => s.kind === 'pic' && s.embed)) {
      const mediaPath = rels.get(shape.embed) ? path.posix.normalize(path.posix.join(path.posix.dirname(part), rels.get(shape.embed))) : null
      const bytes = mediaPath ? zip.read(mediaPath) : null
      if (bytes) { shape.mediaPath = mediaPath; shape.bytes = bytes; shape.sha256 = sha256(bytes); contentHash.update(`${shape.sha256}\n`) }
    }
    const parsed = personSlide(shapes, slideNumber, { allowOpenRoles })
    if (parsed.person) slides.push(parsed.person)
    else if (parsed.openRole) skipped.push({ slide: slideNumber, reason: 'open role: placeholder name with a title and no bio or photo; skipped because --allow-open-roles was passed', openRoleTitle: parsed.openRole })
    else if (parsed.template) skipped.push({ slide: slideNumber, reason: 'unfilled template slide (placeholder name and title, no bio, no photo); remove it from the deck', firstText: parsed.template })
    else skipped.push({ slide: slideNumber, reason: 'not a person slide (no BACKGROUND label, portrait, or image placeholder)', firstText: clip(shapes.find((s) => s.text)?.text || '', 80) })
  })
  return { slides, skipped, slideCount: order.length, exportSha256: sha256(buffer), contentSha256: contentHash.digest('hex'), idBasis: ID_BASIS }
}

const LABELS = { background: /^background$/i, interests: /^passions\s*(&|and)\s*interests$/i }
const IMAGE_PLACEHOLDER = /^(insert|upload|add)\s*\/\s*(copy|paste) image$/i
const UNFILLED = /^\[[^\]]*\]$/

function personSlide(shapes, slideNumber, { allowOpenRoles = false } = {}) {
  const texts = shapes.filter((s) => s.kind === 'sp' && s.text)
  const backgroundLabel = texts.find((s) => LABELS.background.test(s.text))
  const interestsLabel = texts.find((s) => LABELS.interests.test(s.text))
  const placeholder = texts.some((s) => IMAGE_PLACEHOLDER.test(s.text))
  const pictures = shapes.filter((s) => s.kind === 'pic' && s.bytes)
  const portraits = pictures.filter((s) => s.left)
  if (!backgroundLabel && !placeholder && !(portraits.length && texts.some((s) => s.left))) return { person: null }

  // Name and title are the two lowest short text boxes in the left column. Text typed into the tall portrait frame
  // (the image placeholder, or stray words) is not a name.
  const leftTexts = texts.filter((s) => s.left && !s.tall && !IMAGE_PLACEHOLDER.test(s.text)).sort((a, b) => a.y - b.y)
  const [nameShape, titleShape] = leftTexts.length > 1 ? leftTexts.slice(-2) : [leftTexts[0], null]
  const name = cleanLine(nameShape?.text || '', LIMITS.name)
  const rawTitle = cleanLine(titleShape?.text || '', LIMITS.title)
  const below = (label) => label ? texts.filter((s) => !s.left && s !== label && s.y > label.y && !Object.values(LABELS).some((re) => re.test(s.text))).sort((a, b) => a.y - b.y)[0] : null
  const bio = filled(cleanBlock(below(backgroundLabel)?.text || '', LIMITS.bio))
  const interests = filled(cleanBlock(below(interestsLabel)?.text || '', LIMITS.bio))
  if (!name || UNFILLED.test(name)) {
    // The untouched template slide names no one and carries nothing; anything else without a name fails closed.
    const empty = name && !bio && !interests && !pictures.length
    if (empty && !filled(rawTitle)) return { person: null, template: name }
    // A placeholder name over a real title is an open role. It still fails closed unless the operator says so.
    if (empty && allowOpenRoles) return { person: null, openRole: rawTitle }
    throw new RosterDiffError('slide_without_name', `slide ${slideNumber} looks like a team member slide but has no name${name ? ` (still the template text "${name}")` : ''}; fix the deck or remove the slide${empty ? ', or pass --allow-open-roles if it is a role nobody holds yet' : ''}, then run again`, { slide: slideNumber, found: name || null, title: filled(rawTitle), openRole: Boolean(empty) })
  }
  const title = filled(rawTitle)
  const candidates = portraits.length ? portraits : pictures
  const warnings = []
  let image = null
  if (candidates.length === 1) {
    const pic = candidates[0]
    const mimeType = sniffImage(pic.bytes)
    image = {
      slide: slideNumber, imageOrder: pic.picOrder, slideId: `pptx-slide-${slideNumber}`, imageObjectId: `pptx-slide-${slideNumber}-image-${pic.picOrder}`,
      idBasis: ID_BASIS, shapeName: pic.name || null, mediaPath: pic.mediaPath, sizeBytes: pic.bytes.length, mimeType, sha256: pic.sha256, cropped: pic.cropped,
      bytes: pic.bytes,
    }
    if (!mimeType) warnings.push('the slide image is not a JPEG, PNG, or WebP; bind-headshot will refuse it')
  } else if (candidates.length > 1) warnings.push(`slide has ${candidates.length} pictures; the portrait cannot be chosen mechanically`)
  if (leftTexts.length > 2) warnings.push('extra text in the name column; check the name and title on the slide')
  if (/[^\p{L}\p{M}\s.'’,-]/u.test(name)) warnings.push('the name has unusual characters; read it on the slide before using it')
  return { person: { slide: slideNumber, name, title, bio, interests, image, warnings } }
}

function slideShapes(xml, slideWidth, slideHeight) {
  const shapes = []
  let picOrder = 0
  for (const match of xml.matchAll(/<p:(sp|pic)>([\s\S]*?)<\/p:\1>/g)) {
    const [, kind, body] = match
    const off = /<a:off\b[^>]*>/.exec(body)?.[0] || ''
    const ext = /<a:ext\b[^>]*\bcx=[^>]*>/.exec(body)?.[0] || ''
    const x = off ? Number(attr(off, 'x')) : null
    const y = off ? Number(attr(off, 'y')) : null
    const cx = ext ? Number(attr(ext, 'cx')) : 0
    const cy = ext ? Number(attr(ext, 'cy')) : 0
    const paragraphs = [...body.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)].map((p) => decodeXml(
      [...p[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/?>/g)].map((t) => (t[0].startsWith('<a:br') ? '\n' : t[1])).join(''),
    ))
    const shape = {
      kind, name: decodeXml(attr(/<p:cNvPr\b[^>]*>/.exec(body)?.[0] || '', 'name') || ''), x, y,
      // Left column: the shape's centre sits in the left third of the slide (the deck template's portrait and name panel).
      left: x !== null && x + cx / 2 < slideWidth * 0.36,
      tall: cy > slideHeight * 0.3,
      text: paragraphs.map((p) => p.trim()).filter(Boolean).join('\n'),
    }
    if (kind === 'pic') { shape.picOrder = ++picOrder; shape.embed = attr(/<a:blip\b[^>]*>/.exec(body)?.[0] || '', 'r:embed'); shape.cropped = /<a:srcRect\b[^>]*\b[lrtb]="/.test(body) }
    shapes.push(shape)
  }
  return shapes
}

function relationships(xml) {
  const map = new Map()
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) if (attr(m[0], 'TargetMode') !== 'External') map.set(attr(m[0], 'Id'), attr(m[0], 'Target'))
  return map
}
function attr(tag, name) { return new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}="([^"]*)"`).exec(tag)?.[1] ?? null }
function decodeXml(value) {
  return String(value).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
}

/** Pre-parsed slides (tests, a future Slides API or sheet reader). Same fail-closed rule for a missing name. */
export function deckFromJson(json) {
  const list = Array.isArray(json) ? json : json?.slides
  if (!Array.isArray(list)) throw new RosterDiffError('deck_not_exportable', 'the --deck-json file has no slides array')
  const slides = list.map((raw, index) => {
    const slide = Number(raw.slide) || index + 1
    const name = cleanLine(raw.name || '', LIMITS.name)
    if (!name || UNFILLED.test(name)) throw new RosterDiffError('slide_without_name', `slide ${slide} has no name`, { slide, found: name || null })
    const image = raw.image?.sha256 ? {
      slide, imageOrder: Number(raw.image.imageOrder) || 1, slideId: raw.image.slideId || `pptx-slide-${slide}`, imageObjectId: raw.image.imageObjectId || `pptx-slide-${slide}-image-${Number(raw.image.imageOrder) || 1}`,
      idBasis: raw.image.idBasis || json.idBasis || ID_BASIS, shapeName: raw.image.shapeName || null, mediaPath: raw.image.mediaPath || null,
      sizeBytes: raw.image.sizeBytes ?? null, mimeType: raw.image.mimeType || null, sha256: raw.image.sha256, cropped: Boolean(raw.image.cropped), bytes: null,
    } : null
    return { slide, name, title: filled(cleanLine(raw.title || '', LIMITS.title)), bio: filled(cleanBlock(raw.bio || '', LIMITS.bio)), interests: filled(cleanBlock(raw.interests || '', LIMITS.bio)), image, warnings: [] }
  })
  return { slides, skipped: json?.skipped || [], slideCount: json?.slideCount || slides.length, exportSha256: null, contentSha256: json?.contentSha256 || sha256(Buffer.from(JSON.stringify(list))), idBasis: json?.idBasis || ID_BASIS }
}

/* ------------------------------------------------------------------ */
/* live team section                                                   */
/* ------------------------------------------------------------------ */

/**
 * Accepts what the Alpha WordPress MCP returns for reads (optionally still inside the MCP envelope):
 *  - get_page: { elementorSummary: [{ path, widgetType, settings: { title | editor | image } }] }; a staff card is a
 *    heading "Name | Title" with the image and text-editor that share its nearest container (staff-card recipe);
 *  - staff cards: [{ name, title, biographyHtml, attachmentId }] (the plugin's staff card state), bare, or under
 *    cards / staffCards, optionally with imageUrl and imageSha256.
 * get_page_inventory and find_elementor_component results carry no heading text, so they cannot name the cards.
 */
export function parseLiveCards(input) {
  const json = unwrapMcp(input)
  const list = Array.isArray(json) ? json : json?.cards || json?.staffCards
  if (Array.isArray(list)) {
    const cards = list.map((card, index) => {
      const heading = splitHeading(card.heading || '')
      const name = cleanLine(card.name || card.personName || heading.name || '', LIMITS.name)
      if (!name) throw new RosterDiffError('live_cards_unreadable', `live card ${index + 1} has no name`, { index })
      const image = card.image && typeof card.image === 'object' ? card.image : {}
      return liveCard({
        name, title: card.title ?? heading.title, bioHtml: card.biographyHtml ?? card.bioHtml ?? card.bio ?? null, attachmentId: card.attachmentId ?? image.id ?? null,
        imageUrl: card.imageUrl ?? image.url ?? null, imageSha256: card.imageSha256 ?? image.sha256 ?? null, pointer: card.pointer ?? card.path ?? null,
      })
    })
    return { source: 'staff-cards-file', cards, pageHashes: json?.hashes || null }
  }
  if (Array.isArray(json?.elementorSummary)) return { source: 'mcp-get-page', cards: cardsFromSummary(json.elementorSummary), pageHashes: json.hashes || null, canonicalUrl: json.canonicalUrl || null, objectId: json.id || null }
  if (Array.isArray(json?.widgets) && Array.isArray(json?.images)) throw new RosterDiffError('live_cards_unreadable', 'this is a get_page_inventory result: it lists widgets and images but not heading text, so it cannot name the staff cards; pass the get_page result (elementorSummary) or a staff cards list')
  if (json?.match) throw new RosterDiffError('live_cards_unreadable', 'this is a find_elementor_component result: it describes one node without its text; pass the get_page result (elementorSummary) or a staff cards list')
  throw new RosterDiffError('live_cards_unreadable', 'the --live file is neither a get_page result (elementorSummary) nor a list of staff cards')
}

function unwrapMcp(input) {
  let json = input
  if (json?.result && (json.result.structuredContent || json.result.content)) json = json.result
  if (json?.structuredContent) return json.structuredContent
  if (Array.isArray(json?.content) && json.content[0]?.type === 'text') { try { return JSON.parse(json.content[0].text) } catch { /* fall through */ } }
  return json
}

function cardsFromSummary(summary) {
  const nodes = summary.filter((n) => typeof n?.path === 'string')
  const under = (ancestor, n) => n.path === ancestor || n.path.startsWith(`${ancestor}/`)
  const headings = nodes.filter((n) => n.widgetType === 'heading' && splitHeading(stripTags(n.settings?.title || '')).title !== null)
  return headings.map((heading) => {
    const { name, title } = splitHeading(stripTags(heading.settings.title))
    // Walk up until a container holds the widget we need; trust it only while it still holds exactly one staff heading.
    const nearest = (widgetType) => {
      let ancestor = heading.path
      while (ancestor.includes('/elements/')) {
        ancestor = ancestor.slice(0, ancestor.lastIndexOf('/elements/'))
        if (headings.filter((h) => under(ancestor, h)).length > 1) return null
        const found = nodes.filter((n) => n.widgetType === widgetType && under(ancestor, n))
        if (found.length) return found.length === 1 ? found[0] : null
      }
      return null
    }
    const image = nearest('image')?.settings?.image
    const bio = nearest('text-editor')?.settings?.editor
    return liveCard({ name: cleanLine(name, LIMITS.name), title, bioHtml: bio ?? null, attachmentId: image?.id ?? null, imageUrl: image?.url ?? null, imageSha256: null, pointer: heading.path })
  })
}

/** Public rendered page fallback: Elementor widgets in document order; a staff card is image, "Name | Title" heading, bio. */
export function parseRenderedTeam(html) {
  const widgets = []
  const marker = /data-widget_type="(image|heading|text-editor)\.default"/g
  const marks = [...html.matchAll(marker)]
  marks.forEach((m, i) => {
    const chunk = html.slice(m.index, marks[i + 1]?.index ?? Math.min(html.length, m.index + 20000))
    if (m[1] === 'image') { const img = /<img\b[^>]*>/.exec(chunk)?.[0]; if (img) widgets.push({ type: 'image', url: decodeXml(attr(img, 'src') || attr(img, 'data-src') || ''), attachmentId: Number(/wp-image-(\d+)/.exec(img)?.[1]) || null }) }
    if (m[1] === 'heading') { const text = /<h[1-6]\b[^>]*class="[^"]*elementor-heading-title[^"]*"[^>]*>([\s\S]*?)<\/h[1-6]>/.exec(chunk)?.[1]; if (text) widgets.push({ type: 'heading', ...splitHeading(stripTags(text)) }) }
    if (m[1] === 'text-editor') { const body = /<div class="elementor-widget-container">([\s\S]*?)<\/div>\s*<\/div>/.exec(chunk)?.[1] ?? /<div class="elementor-widget-container">([\s\S]*)/.exec(chunk)?.[1]; widgets.push({ type: 'text', html: body || '' }) }
  })
  const cards = []
  widgets.forEach((w, i) => {
    if (w.type !== 'heading' || w.title === null || !w.name) return
    let image = null
    for (let j = i - 1; j >= 0 && !(widgets[j].type === 'heading' && widgets[j].title !== null); j--) if (widgets[j].type === 'image') { image = widgets[j]; break }
    let bio = null
    for (let j = i + 1; j < widgets.length && widgets[j].type !== 'image' && !(widgets[j].type === 'heading' && widgets[j].title !== null); j++) if (widgets[j].type === 'text') { bio = widgets[j].html; break }
    cards.push(liveCard({ name: cleanLine(w.name, LIMITS.name), title: w.title, bioHtml: bio, attachmentId: image?.attachmentId ?? null, imageUrl: image?.url || null, imageSha256: null, pointer: null }))
  })
  return { source: 'rendered-page', cards, pageHashes: null }
}

function liveCard({ name, title, bioHtml, attachmentId, imageUrl, imageSha256, pointer }) {
  const bioText = bioHtml === null || bioHtml === undefined ? null : cleanBlock(stripTags(String(bioHtml)), LIMITS.bio * 2)
  return {
    name, title: title === null || title === undefined ? null : cleanLine(String(title), LIMITS.title), bio: bioText || null,
    bioTruncated: typeof bioHtml === 'string' && bioHtml.endsWith('…'), attachmentId: Number(attachmentId) || null, imageUrl: imageUrl || null, imageSha256: imageSha256 || null, pointer: pointer || null,
  }
}

function splitHeading(text) {
  const clean = String(text).replace(/[\u200b-\u200d\ufeff]/g, '')
  const at = clean.indexOf('|')
  if (at < 0) return { name: clean.trim(), title: null }
  return { name: clean.slice(0, at).trim(), title: clean.slice(at + 1).trim() }
}

export async function fetchRenderedPage(pageUrl, { fetchImpl = fetch } = {}) {
  let res
  try { res = await fetchImpl(pageUrl, { redirect: 'follow', headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, signal: AbortSignal.timeout(60_000) }) }
  catch (e) { throw new RosterDiffError('live_page_unreadable', `could not fetch ${pageUrl}: ${e.message}`, { pageUrl }) }
  if (!res.ok) throw new RosterDiffError('live_page_unreadable', `${pageUrl} answered ${res.status}`, { pageUrl, status: res.status })
  return res.text()
}

/** Optional: hash each live card image. Only URLs on the registered page's own host are fetched. */
export async function hashLiveImages(cards, pageUrl, { fetchImpl = fetch } = {}) {
  const host = new URL(pageUrl).hostname
  for (const card of cards) {
    if (card.imageSha256 || !card.imageUrl) continue
    let url
    try { url = new URL(card.imageUrl, pageUrl) } catch { continue }
    if (url.protocol !== 'https:' || url.hostname !== host) { card.imageHashNote = 'image is not on the page host; not fetched'; continue }
    // WordPress serves uploads over 2560 px as a -scaled copy; the original sits beside it (staff-card recipe, known limits).
    const variants = [url.href, url.href.replace(/-scaled(\.[a-z0-9]+)$/i, '$1')].filter((v, i, all) => all.indexOf(v) === i)
    card.imageSha256Variants = []
    for (const variant of variants) {
      try {
        const res = await fetchImpl(variant, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) })
        if (!res.ok) continue
        const bytes = Buffer.from(await res.arrayBuffer())
        if (bytes.length <= MAX_IMAGE_BYTES && sniffImage(bytes)) card.imageSha256Variants.push({ url: variant, sha256: sha256(bytes), sizeBytes: bytes.length })
      } catch { /* an unreadable image stays unknown */ }
    }
    card.imageSha256 = card.imageSha256Variants[0]?.sha256 || null
  }
  return cards
}

/* ------------------------------------------------------------------ */
/* name, title, and bio normalization                                  */
/* ------------------------------------------------------------------ */

const HONORIFICS = new Set(['dr', 'mr', 'mrs', 'ms', 'miss', 'mx', 'prof', 'professor', 'coach', 'rev', 'sir'])
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'edd'])
const CREDENTIALS = new Set([...SUFFIXES, 'md', 'med', 'ma', 'ms', 'msed', 'mat', 'mba', 'mfa', 'ba', 'bs', 'esq', 'cpa', 'lcsw', 'bcba', 'rn', 'jd'])

/** Builds on intake's normalizePersonName (HTML, case, whitespace) and adds honorifics, credentials, accents, and middle names. */
export function personKey(value) {
  const base = normalizePersonName(String(value ?? '')).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/[’‘`]/g, "'")
  const tokenize = (text) => text.replace(/\./g, '').replace(/[^\p{L}\p{N}'\s-]/gu, ' ').split(/\s+/).filter(Boolean)
  const comma = base.indexOf(',')
  let tokens = tokenize(comma < 0 ? base : base.slice(0, comma))
  if (comma >= 0) { const tail = tokenize(base.slice(comma + 1)); if (!tail.every((t) => CREDENTIALS.has(t))) tokens = tokens.concat(tail) }
  let honorific = false
  while (tokens.length > 1 && HONORIFICS.has(tokens[0])) { tokens.shift(); honorific = true }
  while (tokens.length > 2 && SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop()
  return { full: tokens.join(' '), firstLast: tokens.length > 1 ? `${tokens[0]} ${tokens[tokens.length - 1]}` : tokens[0] || '', tokens, honorific }
}

export function normalizeTitle(value) {
  return stripTags(String(value ?? '')).normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}
export function normalizeProse(value) {
  return String(value ?? '').normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…$/, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function stripTags(value) { return decodeXml(String(value).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<[^>]*>/g, '')) }
function stripControl(value) { return String(value).replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200d\u2028\u2029\ufeff]/g, ' ') }
function clip(value, max) { const text = String(value); return text.length > max ? `${text.slice(0, max - 1)}…` : text }
function cleanLine(value, max) { return clip(stripControl(String(value).replace(/\s+/g, ' ')).replace(/\s+/g, ' ').trim(), max) }
function cleanBlock(value, max) { return clip(stripControl(value).split(/\n+/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n'), max) }
function filled(value) { return value && !UNFILLED.test(value) ? value : null }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }
function sniffImage(b) {
  if (!b || b.length < 12) return null
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  return null
}
function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i
    for (let j = 1; j <= b.length; j++) { const keep = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = keep }
  }
  return row[b.length]
}

/* ------------------------------------------------------------------ */
/* matching and the plan                                               */
/* ------------------------------------------------------------------ */

/**
 * Match deck slides to live cards by normalized name. Exact (honorific-insensitive) first; then one loose pass for
 * a dropped middle or extra name. Anything that could be two people fails closed with ambiguous_name_match.
 */
export function matchRoster(deckSlides, liveCards) {
  const deck = deckSlides.map((slide) => ({ slide, key: personKey(slide.name) }))
  const live = liveCards.map((card) => ({ card, key: personKey(card.name) }))
  for (const [side, items, label] of [['deck', deck, (d) => `slide ${d.slide.slide} "${d.slide.name}"`], ['live', live, (l) => `"${l.card.name}"`]]) {
    const seen = new Map()
    for (const item of items) {
      if (!item.key.full) continue
      if (seen.has(item.key.full)) throw new RosterDiffError('ambiguous_name_match', `${side === 'deck' ? 'the deck' : 'the live page'} has two entries that normalize to the same person: ${label(seen.get(item.key.full))} and ${label(item)}`, { side, key: item.key.full })
      seen.set(item.key.full, item)
    }
  }
  const pairs = []
  const liveLeft = new Set(live)
  const deckLeft = []
  for (const d of deck) {
    const exact = [...liveLeft].find((l) => l.key.full === d.key.full)
    if (exact) { pairs.push({ deck: d, live: exact, matchedBy: 'name' }); liveLeft.delete(exact) } else deckLeft.push(d)
  }
  const loose = (a, b) => a.tokens.length && b.tokens.length && a.tokens[0] === b.tokens[0] && (a.tokens.length > 1 || b.tokens.length > 1)
    && (a.firstLast === b.firstLast || a.tokens.every((t) => b.tokens.includes(t)) || b.tokens.every((t) => a.tokens.includes(t)))
  const claims = new Map()
  const stillDeck = []
  for (const d of deckLeft) {
    const candidates = [...liveLeft].filter((l) => loose(d.key, l.key))
    if (candidates.length > 1) throw new RosterDiffError('ambiguous_name_match', `deck slide ${d.slide.slide} "${d.slide.name}" could be more than one live card: ${candidates.map((c) => `"${c.card.name}"`).join(', ')}`, { slide: d.slide.slide, deckName: d.slide.name, candidates: candidates.map((c) => c.card.name) })
    if (candidates.length === 1) {
      const other = claims.get(candidates[0])
      if (other) throw new RosterDiffError('ambiguous_name_match', `live card "${candidates[0].card.name}" could be more than one deck slide: "${other.slide.name}" (slide ${other.slide.slide}) and "${d.slide.name}" (slide ${d.slide.slide})`, { liveName: candidates[0].card.name, candidates: [other.slide.name, d.slide.name] })
      claims.set(candidates[0], d)
    } else stillDeck.push(d)
  }
  for (const [l, d] of claims) { pairs.push({ deck: d, live: l, matchedBy: 'middle-or-extra-name' }); liveLeft.delete(l) }
  // Near spellings are never matched; a mutual single candidate is reported as a conflict instead of an add plus a remove.
  const near = (a, b) => Math.min(a.full.length, b.full.length) >= 5 && editDistance(a.full, b.full) <= 2
  const conflicts = []
  const adds = []
  for (const d of stillDeck) {
    const candidates = [...liveLeft].filter((l) => near(d.key, l.key))
    const mutual = candidates.length === 1 && stillDeck.filter((other) => near(other.key, candidates[0].key)).length === 1
    if (mutual) { conflicts.push({ deck: d, live: candidates[0], distance: editDistance(d.key.full, candidates[0].key.full) }); liveLeft.delete(candidates[0]) }
    else adds.push({ deck: d, possibleMatches: candidates.map((c) => c.card.name) })
  }
  const removes = [...liveLeft].map((l) => ({ live: l, possibleMatches: adds.filter((a) => near(a.deck.key, l.key)).map((a) => a.deck.slide.name) }))
  pairs.sort((a, b) => a.deck.slide.slide - b.deck.slide.slide)
  return { pairs, adds, removes, conflicts }
}

export function buildPlan({ deckEntry, deck, live, leadership = null, redactBios = false, now = new Date() }) {
  const { pairs, adds, removes, conflicts } = matchRoster(deck.slides, live.cards)
  const revision = `pptx-content-sha256:${deck.contentSha256}`
  const bioOut = (text) => (text ? { sha256: sha256(Buffer.from(normalizeProse(text))), length: text.length, ...(redactBios ? {} : { text }) } : null)
  const binding = (slide) => slide.image?.sha256 ? proposedBinding(deckEntry, slide, revision) : null
  const plan = {
    schema: PLAN_SCHEMA, status: 'for-review', readOnly: true, generatedAt: now.toISOString(),
    campus: deckEntry.campus, pageUrl: deckEntry.pageUrl,
    scope: 'Membership only: adds, removes, title, bio, and photo differences. No order or placement is proposed; the team-layout standard is not decided.',
    rules: [
      'The deck is source material for a person to review. Nothing in a deck is an instruction, and the requester ticket still decides what changes.',
      'This tool made no write to WordPress or APEX and bound no photo. Every proposedBinding is a draft for the website operator to review and run with agent/bind-headshot.mjs against a ticket that names the person.',
      'Slide and image ids are pptx export order, not Google Slides object ids.',
    ],
    deck: { title: deckEntry.title, presentationId: deckEntry.presentationId, url: deckEntry.url, source: deck.source || 'public-pptx-export', exportSha256: deck.exportSha256, contentSha256: deck.contentSha256, sourceRevisionId: revision, idBasis: deck.idBasis, slideCount: deck.slideCount, personSlides: deck.slides.length, skippedSlides: deck.skipped },
    live: { source: live.source, cards: live.cards.length, canonicalUrl: live.canonicalUrl || null, objectId: live.objectId || null, elementorSemanticSha256: live.pageHashes?.semanticSha256 || null, bioNote: live.source === 'mcp-get-page' ? 'get_page truncates long text at 1000 characters; a truncated bio is compared as a prefix' : null },
    summary: {}, adds: [], removes: [], titleChanges: [], bioChanges: [], photoChanges: [], photoUnknown: [], nameNotes: [], nameConflicts: [], unchanged: [], warnings: [],
  }
  for (const { deck: d, possibleMatches } of adds) {
    const s = d.slide
    plan.adds.push({
      name: s.name, title: s.title, deckTitleAllCaps: allCaps(s.title), bio: bioOut(s.bio), slide: s.slide,
      missing: [!s.title && 'title', !s.bio && 'bio', !s.image && 'photo'].filter(Boolean),
      ...(possibleMatches.length ? { possibleMatches, note: 'a live card has a similar name; confirm this is a new person before treating it as an add' } : {}),
      photo: s.image ? 'deck-photo-needs-operator-binding' : 'no-photo-on-slide', proposedBinding: binding(s),
    })
    for (const w of s.warnings) plan.warnings.push({ slide: s.slide, name: s.name, warning: w })
  }
  for (const { live: l, possibleMatches } of removes) {
    const roles = leadershipRoles(leadership, deckEntry.campus, l.key)
    plan.removes.push({
      name: l.card.name, title: l.card.title, attachmentId: l.card.attachmentId, pointer: l.card.pointer,
      note: roles.length ? `on the page, not in the deck; registry/campus-leadership.json lists this person as ${roles.join(', ')} for the campus, and a campus deck may leave out shared leadership` : 'on the page, not in the deck; a removal needs a ticket with the name and the effective date',
      ...(possibleMatches.length ? { possibleMatches } : {}),
    })
  }
  for (const { deck: d, live: l, distance } of conflicts) {
    plan.nameConflicts.push({ deckName: d.slide.name, deckTitle: d.slide.title, slide: d.slide.slide, liveName: l.card.name, liveTitle: l.card.title, editDistance: distance, note: 'spelling differs between the deck and the page; not treated as an add or a remove until a person confirms which is right' })
  }
  for (const { deck: d, live: l, matchedBy } of pairs) {
    const s = d.slide
    const c = l.card
    let changed = false
    if (matchedBy !== 'name') plan.nameNotes.push({ kind: 'middle-or-extra-name', deckName: s.name, liveName: c.name, slide: s.slide })
    else if (d.key.honorific !== l.key.honorific) plan.nameNotes.push({ kind: 'honorific', deckName: s.name, liveName: c.name, slide: s.slide, note: 'the heading uses the submitted name exactly (staff-card recipe); confirm the honorific with the campus' })
    else if (cleanLine(s.name, LIMITS.name) !== c.name) plan.nameNotes.push({ kind: 'formatting', deckName: s.name, liveName: c.name, slide: s.slide })
    if (s.title && c.title !== null && normalizeTitle(s.title) !== normalizeTitle(c.title)) {
      changed = true
      plan.titleChanges.push({ name: c.name, liveTitle: c.title, deckTitle: s.title, deckTitleAllCaps: allCaps(s.title), slide: s.slide, ...(allCaps(s.title) ? { note: 'deck titles are all caps; title case follows the page (staff-card recipe)' } : {}) })
    }
    const bio = compareBio(s, c)
    if (bio === 'changed') { changed = true; plan.bioChanges.push({ name: c.name, slide: s.slide, relation: bioRelation(s, c), liveBio: bioOut(c.bio), deckBio: bioOut(s.bio), liveBioTruncated: c.bioTruncated }) }
    const photo = comparePhoto(s, c)
    if (photo.status === 'bytes-differ' || photo.status === 'live-photo-missing') {
      changed = true
      plan.photoChanges.push({ name: c.name, slide: s.slide, status: photo.status, liveAttachmentId: c.attachmentId, liveImageUrl: c.imageUrl, liveSha256: c.imageSha256, deckSha256: s.image.sha256, note: photo.note, proposedBinding: binding(s) })
    } else if (photo.status !== 'same-bytes') plan.photoUnknown.push({ name: c.name, slide: s.slide, status: photo.status, liveAttachmentId: c.attachmentId, liveImageUrl: c.imageUrl, deckSha256: s.image?.sha256 || null, note: photo.note })
    if (!changed) plan.unchanged.push({ name: c.name, slide: s.slide, bio, photo: photo.status })
    for (const w of s.warnings) plan.warnings.push({ slide: s.slide, name: s.name, warning: w })
  }
  plan.summary = Object.fromEntries(['adds', 'removes', 'titleChanges', 'bioChanges', 'photoChanges', 'photoUnknown', 'nameNotes', 'nameConflicts', 'unchanged', 'warnings'].map((k) => [k, plan[k].length]))
  return plan
}

function compareBio(slide, card) {
  if (!slide.bio) return 'deck-bio-missing'
  if (!card.bio) return 'changed'
  const deckBio = normalizeProse(slide.bio)
  const withInterests = normalizeProse([slide.bio, slide.interests].filter(Boolean).join('\n'))
  const liveBio = normalizeProse(card.bio)
  if (liveBio === deckBio || liveBio === withInterests) return 'same'
  if (card.bioTruncated && liveBio.length >= 200 && (deckBio.startsWith(liveBio) || withInterests.startsWith(liveBio))) return 'same-as-far-as-read'
  return 'changed'
}

function bioRelation(slide, card) {
  if (!card.bio) return 'page-has-no-bio'
  const deckBio = normalizeProse(slide.bio)
  const liveBio = normalizeProse(card.bio)
  if (liveBio.includes(deckBio)) return 'page-contains-deck-bio'
  if (deckBio.includes(liveBio)) return 'deck-contains-page-bio'
  return 'different-text'
}

function comparePhoto(slide, card) {
  if (!slide.image) return { status: 'deck-photo-missing', note: 'the slide has no photo; nothing to compare or bind' }
  if (!card.attachmentId && !card.imageUrl) return { status: 'live-photo-missing', note: 'the live card has no image and the slide has one' }
  const hashes = card.imageSha256Variants?.length ? card.imageSha256Variants.map((v) => v.sha256) : card.imageSha256 ? [card.imageSha256] : []
  if (!hashes.length) return { status: 'photo-unknown', note: 'no hash of the live image was available; compare the portraits by eye, or rerun with --hash-live-images' }
  if (hashes.includes(slide.image.sha256)) return { status: 'same-bytes', note: null }
  return { status: 'bytes-differ', note: 'the live file and the deck image are different bytes; that does not prove a different portrait (Slides and WordPress both re-encode). The operator compares them by eye before any binding.' }
}

function proposedBinding(deckEntry, slide, revision) {
  const image = slide.image
  const source = { kind: 'slides-image', url: deckEntry.url, sizeBytes: image.sizeBytes, mimeType: image.mimeType, sha256: image.sha256, presentationId: deckEntry.presentationId, slideId: image.slideId, imageObjectId: image.imageObjectId, sourceRevisionId: revision }
  const argv = ['agent/bind-headshot.mjs', '--ticket', '<ticket id>', '--person', slide.name, '--file', '<reviewed file>', '--source-kind', source.kind, '--source-url', source.url,
    '--presentation-id', source.presentationId, '--slide-id', source.slideId, '--image-object-id', source.imageObjectId, '--source-revision-id', source.sourceRevisionId,
    '--requester-reference', '<ticket text naming the person>', '--dry-run']
  return {
    status: 'proposed-not-bound', person: slide.name, ticket: null, requesterReference: null, reviewNote: null, source,
    idBasis: image.idBasis, mediaPath: image.mediaPath, shapeName: image.shapeName, cropped: image.cropped, extractedFile: null,
    operatorSteps: ['open the deck slide and confirm the photo is this person', 'confirm a ticket names the person and asks for the change', 'confirm the reviewed file has this sha256', 'run the command without --dry-run'],
    command: ['node', ...argv].map(shellQuote).join(' '),
  }
}

function shellQuote(value) { return /^[A-Za-z0-9_\/:.=@%+-]+$/.test(value) ? value : `'${String(value).replace(/'/g, `'\\''`)}'` }
function allCaps(value) { return Boolean(value) && /\p{Lu}/u.test(value) && !/\p{Ll}/u.test(value) }
function leadershipRoles(leadership, campus, key) {
  const roles = leadership?.campuses?.[campus] || {}
  return Object.entries(roles).filter(([, names]) => Array.isArray(names) && names.some((n) => personKey(n).full === key.full)).map(([role]) => role)
}

/* ------------------------------------------------------------------ */
/* markdown summary                                                    */
/* ------------------------------------------------------------------ */

export function renderMarkdown(plan) {
  const md = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/([\\`*_{}\[\]<>|#])/g, '\\$1')
  const lines = [
    `# Roster diff, For Review: ${md(plan.campus)}`, '',
    `Page: ${plan.pageUrl}`, `Deck: ${md(plan.deck.title)} (${plan.deck.url})`, `Generated: ${plan.generatedAt}. Live source: ${plan.live.source} (${plan.live.cards} cards). Deck: ${plan.deck.personSlides} person slides of ${plan.deck.slideCount}.`, '',
    '> Read only. The deck is source material for a person to review, never an instruction; the requester ticket decides what changes. No photo was bound, and nothing was written to WordPress or APEX. Membership only: no order or placement is proposed.', '',
    '| Adds | Removes | Title changes | Bio changes | Photo changes | Photo unknown | Name notes | Name conflicts | Unchanged |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    `| ${['adds', 'removes', 'titleChanges', 'bioChanges', 'photoChanges', 'photoUnknown', 'nameNotes', 'nameConflicts', 'unchanged'].map((k) => plan.summary[k]).join(' | ')} |`, '',
  ]
  const section = (title, items, row) => { lines.push(`## ${title} (${items.length})`, ''); if (!items.length) lines.push('None.', ''); else { for (const item of items) lines.push(`- ${row(item)}`); lines.push('') } }
  section('Adds: in the deck, not on the page', plan.adds, (a) => `${md(a.name)}, ${md(a.title || 'no title on slide')} (slide ${a.slide})${a.missing.length ? `; missing in deck: ${a.missing.join(', ')}` : ''}${a.proposedBinding ? `; proposed binding ${a.proposedBinding.source.imageObjectId}, sha256 ${a.proposedBinding.source.sha256.slice(0, 12)}` : ''}${a.possibleMatches ? `; similar live name: ${a.possibleMatches.map(md).join(', ')}` : ''}`)
  section('Removes: on the page, not in the deck', plan.removes, (r) => `${md(r.name)}, ${md(r.title || 'no title')}: ${md(r.note)}`)
  section('Name conflicts: spelling differs', plan.nameConflicts, (c) => `deck "${md(c.deckName)}" (slide ${c.slide}) and page "${md(c.liveName)}"`)
  section('Title changes', plan.titleChanges, (t) => `${md(t.name)}: page "${md(t.liveTitle)}", deck "${md(t.deckTitle)}" (slide ${t.slide})`)
  section('Bio changes', plan.bioChanges, (b) => `${md(b.name)} (slide ${b.slide}): ${b.relation}; page ${b.liveBio ? `${b.liveBio.length} characters${b.liveBioTruncated ? ' as far as read' : ''}` : 'has no bio'}, deck ${b.deckBio.length} characters`)
  section('Photo changes: bytes differ or the page has no photo; compare by eye before any binding', plan.photoChanges, (p) => `${md(p.name)} (slide ${p.slide}): ${p.status}; proposed binding ${p.proposedBinding.source.imageObjectId}, sha256 ${p.proposedBinding.source.sha256.slice(0, 12)}`)
  section('Photo unknown: no live hash, or no photo on the slide', plan.photoUnknown, (p) => `${md(p.name)} (slide ${p.slide}): ${p.status}`)
  section('Name notes', plan.nameNotes, (n) => `${n.kind}: deck "${md(n.deckName)}", page "${md(n.liveName)}"`)
  section('Unchanged', plan.unchanged, (u) => `${md(u.name)} (bio ${u.bio}, photo ${u.photo})`)
  if (plan.deck.skippedSlides.length) section('Slides skipped', plan.deck.skippedSlides, (s) => `slide ${s.slide}: ${md(s.reason)}`)
  if (plan.warnings.length) section('Warnings', plan.warnings, (w) => `slide ${w.slide} ${md(w.name)}: ${md(w.warning)}`)
  lines.push('## Bindings', '', 'Each add and photo change above carries a `proposedBinding` in the plan JSON with the `agent/bind-headshot.mjs` command. The website operator reviews the photo, names the ticket and the ticket text, and runs it; this tool never does.', '')
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

export async function run(args, { fetchImpl = fetch, now = new Date() } = {}) {
  const deckEntry = resolveDeck(loadDeckRegistry(args.registry), { campus: args.campus === true ? null : args.campus, deck: args.deck === true ? null : args.deck })
  let deck
  if (args['deck-json']) deck = { ...deckFromJson(JSON.parse(fs.readFileSync(args['deck-json'], 'utf8'))), source: 'pre-parsed-slides-file' }
  else if (args['deck-file']) deck = { ...parseDeckPptx(fs.readFileSync(args['deck-file']), { allowOpenRoles: Boolean(args['allow-open-roles']) }), source: 'saved-pptx-export' }
  else deck = { ...parseDeckPptx(await exportDeckPptx(deckEntry.presentationId, { fetchImpl }), { allowOpenRoles: Boolean(args['allow-open-roles']) }), source: 'public-pptx-export' }

  let live
  if (args.live) {
    let json
    try { json = JSON.parse(fs.readFileSync(args.live, 'utf8')) } catch (e) { throw new RosterDiffError('live_cards_unreadable', `could not read --live ${args.live}: ${e.message}`) }
    live = parseLiveCards(json)
  } else {
    const html = args['page-html'] ? fs.readFileSync(args['page-html'], 'utf8') : await fetchRenderedPage(deckEntry.pageUrl, { fetchImpl })
    live = parseRenderedTeam(html)
    if (!live.cards.length) throw new RosterDiffError('live_page_unreadable', `no "Name | Title" staff headings were found on ${deckEntry.pageUrl}; pass --live with the get_page result instead`, { pageUrl: deckEntry.pageUrl })
  }
  if (args['hash-live-images']) await hashLiveImages(live.cards, deckEntry.pageUrl, { fetchImpl })

  const leadershipFile = path.join(root, 'registry', 'campus-leadership.json')
  const leadership = fs.existsSync(leadershipFile) ? JSON.parse(fs.readFileSync(leadershipFile, 'utf8')) : null
  const plan = buildPlan({ deckEntry, deck, live, leadership, redactBios: Boolean(args['redact-bios']), now })

  if (args['images-dir'] && args['images-dir'] !== true) {
    fs.mkdirSync(args['images-dir'], { recursive: true })
    const bySlide = new Map(deck.slides.map((s) => [s.slide, s]))
    for (const item of [...plan.adds, ...plan.photoChanges]) {
      const image = bySlide.get(item.slide)?.image
      if (!item.proposedBinding || !image?.bytes || !image.mimeType) continue
      const file = path.join(args['images-dir'], `slide-${String(item.slide).padStart(2, '0')}-${personKey(item.proposedBinding.person).full.replace(/[^a-z0-9]+/g, '-') || 'person'}.${{ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[image.mimeType]}`)
      fs.writeFileSync(file, image.bytes)
      item.proposedBinding.extractedFile = path.resolve(file)
    }
  }
  return plan
}

function parse(argv) { const out = {}; for (let i = 0; i < argv.length; i++) { if (!argv[i].startsWith('--')) continue; const key = argv[i].slice(2); const next = argv[i + 1]; out[key] = next === undefined || next.startsWith('--') ? true : (i++, next) } return out }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parse(process.argv.slice(2))
  try {
    const plan = await run(args)
    if (args.out && args.out !== true) {
      fs.mkdirSync(args.out, { recursive: true })
      const base = path.join(args.out, `roster-diff-${plan.campus}`)
      fs.writeFileSync(`${base}.plan.json`, `${JSON.stringify(plan, null, 2)}\n`)
      fs.writeFileSync(`${base}.md`, renderMarkdown(plan))
      console.log(`wrote ${base}.plan.json and ${base}.md: ${JSON.stringify(plan.summary)}`)
    } else console.log(JSON.stringify(plan, null, 2))
  } catch (e) {
    if (!(e instanceof RosterDiffError)) throw e
    console.error(JSON.stringify({ error: { code: e.code, message: e.message, details: e.details } }, null, 2))
    process.exit(2)
  }
}
