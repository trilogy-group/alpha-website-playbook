/**
 * Requester notices: what the website system tells a requester by Slack DM when their ticket goes to
 * Missing Info or Blocked, and the once-only ledger that stops it from telling them twice.
 *
 * Decision 2026-09-23 (Matt Barge): APEX will not notify requesters (Hailey is hardening the intake forms
 * instead), so the website system does it itself. This module is pure: it composes and checks the text,
 * screens the ask, hashes it, and decides against the ticket's ledger. It never talks to Slack or APEX;
 * `agent/notify-requester.mjs` does that.
 *
 * Criteria fixed by Matt: only items no internal source can supply (page URLs, HubSpot values, filenames,
 * "confirm" asks and approved packet URLs are refused); under 120 words; first-name greeting and "this is
 * the website team"; the ticket title and the APEX link; numbered items; one "Already done:" line when the
 * caller passes it; exactly how to provide it; sentence case; no exclamation marks; no em or en dash
 * between words; no jargon (intake, class, ring, receipt, hash, n8n, HubSpot, Elementor); signed
 * "Website team (Matt Barge)". The same text goes on the ticket description under a dated heading with the
 * requester's original text kept first.
 */
import crypto from 'node:crypto'

export const NOTICE_KINDS = ['missing-info', 'blocked', 'blocked-update']
export const MAX_WORDS = 120
export const APEX_INTAKE_URL = 'https://apex.2hourlearning.com/intake'
export const SIGNATURE = 'Website team (Matt Barge)'
export const LEDGER_FIELD = 'requesterNotices'
export const DESCRIPTION_HEADING = 'REQUESTER NOTICE (Slack DM)'
export const HOW_TO_PROVIDE = 'To send them: attach the files on the ticket, one file per person named for the person, or reply on the ticket.'

/** Items an internal source can supply are never asked of a requester; each pattern names why. */
export const ITEM_DENYLIST = [
  { reason: 'page URL (the registry derives it)', pattern: /\bpage\s+url\b|\bcanonical\b|https?:\/\/(?:www\.)?alpha\.school\b|\burl of the (?:single )?page\b/i },
  { reason: 'HubSpot value (read from the source, not the requester)', pattern: /\bhubspot\b|\bprogram (?:id|value|field)\b/i },
  { reason: 'filename (the media library is read, not asked for)', pattern: /\bfile\s?names?\b|\b[\w-]+\.(?:png|jpe?g|webp|gif|pdf|docx?|xlsx?|csv|pptx?)\b/i },
  { reason: '"confirm" ask (state the fact to supply instead)', pattern: /\bconfirm(?:s|ed|ing|ation)?\b/i },
  { reason: 'approved packet URL (packet-owner work, not a requester input)', pattern: /\bapproved packet\b|\bpacket\s+url\b/i },
]

/** Words a requester should never have to decode. Checked outside URLs, whole words, any case. */
export const JARGON = ['intake', 'class', 'ring', 'receipt', 'hash', 'n8n', 'hubspot', 'elementor']

/** Upper-case tokens that are not shouting. */
const CASE_ALLOWLIST = new Set(['APEX', 'PDF', 'PNG', 'JPG', 'JPEG', 'URL', 'ID', 'K', 'PREK', 'LL', 'L1', 'L2', 'CTA', 'FAQ', 'DM', 'QR', 'TX', 'CA', 'NY', 'FL', 'AZ', 'IL', 'DC', 'USA', 'SY', 'CEO', 'COO', 'DOA', 'DOP'])

export class RequesterNoticeError extends Error {
  /** @param {'BAD_KIND'|'MISSING_ARG'|'NO_ITEMS'|'NO_OWNER'|'OWNER_IS_ROLE'|'DASH'|'EXCLAMATION'|'JARGON'|'TOO_LONG'|'NOT_SENTENCE_CASE'|'BAD_PERMALINK'|'NO_REQUESTER'} code */
  constructor(code, message, extra = {}) { super(message); this.name = 'RequesterNoticeError'; this.code = code; Object.assign(this, extra) }
}

export function apexLink(ticketId) {
  if (!ticketId || typeof ticketId !== 'string') throw new RequesterNoticeError('MISSING_ARG', 'ticket id required for the APEX link')
  return `${APEX_INTAKE_URL}?open=${encodeURIComponent(ticketId)}`
}

/** The greeting name: Slack profile first name, else real name's first word, else the email's first label. */
export function firstName({ slackFirstName, slackRealName, email } = {}) {
  const fromSlack = String(slackFirstName || '').trim() || String(slackRealName || '').trim().split(/\s+/)[0] || ''
  if (fromSlack) return fromSlack
  const local = String(email || '').split('@')[0]
  const label = local.split(/[._-]/)[0] || ''
  return label ? label.charAt(0).toUpperCase() + label.slice(1).toLowerCase() : ''
}

/**
 * A ticket title as the requester recognizes it: the form-type parenthetical APEX appends to "Website"
 * ("Website (Update program info (address, phone, grade levels, etc.))") dropped, and the em dash APEX puts
 * between the form type and the campus replaced.
 */
export function plainTitle(title) {
  return String(title || '')
    .replace(/^Website\s*\((?:[^()]|\([^()]*\))*\)/, 'Website')
    .replace(/\s*[—–]\s*/g, ': ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Normalize the ask so the same ask in different whitespace or case hashes the same, and a changed ask does not. */
export function normalizeAsk(value) {
  const parts = Array.isArray(value) ? value : [value]
  return parts.map((part) => String(part || '').toLowerCase().replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}

export function askHash(value) {
  return crypto.createHash('sha256').update(normalizeAsk(value)).digest('hex')
}

/** Split the items into the ones a requester may be asked for and the ones an internal source supplies. */
export function screenItems(items) {
  const accepted = []
  const refused = []
  for (const raw of items || []) {
    const item = String(raw || '').replace(/\s+/g, ' ').trim()
    if (!item) continue
    const hit = ITEM_DENYLIST.find(({ pattern }) => pattern.test(item))
    if (hit) refused.push({ item, reason: hit.reason })
    else accepted.push(item)
  }
  return { accepted, refused }
}

function stripUrls(text) { return String(text || '').replace(/https?:\/\/\S+/g, ' ') }

export function wordCount(text) { return String(text || '').split(/\s+/).filter(Boolean).length }

/** Every rule the message must satisfy, as typed errors; returns the word count when it passes. */
export function checkMessage(text) {
  const body = String(text || '')
  const prose = stripUrls(body)
  // An em dash never; an en dash only inside a range such as K–12 (brand rule: en dashes in ranges stay).
  const dash = body.match(/—/) || body.match(/\s–|–\s|[A-Za-z]{2,}–|–[A-Za-z]{2,}/)
  if (dash) throw new RequesterNoticeError('DASH', `no em or en dash between words in a requester notice; found "${dash[0].trim()}"`)
  if (/!/.test(prose)) throw new RequesterNoticeError('EXCLAMATION', 'no exclamation marks in a requester notice')
  for (const word of JARGON) {
    const match = prose.match(new RegExp(`\\b${word}\\b`, 'i'))
    if (match) throw new RequesterNoticeError('JARGON', `"${match[0]}" is internal wording; say what it means to the requester instead`, { word })
  }
  const words = wordCount(body)
  if (words >= MAX_WORDS) throw new RequesterNoticeError('TOO_LONG', `${words} words; a requester notice stays under ${MAX_WORDS}`, { words })
  const shouting = prose.match(/\b[A-Z][A-Z0-9-]{3,}\b/g)?.find((token) => !CASE_ALLOWLIST.has(token.replace(/-.*/, '')))
  if (shouting) throw new RequesterNoticeError('NOT_SENTENCE_CASE', `sentence case only; "${shouting}" is upper case`, { token: shouting })
  return { words }
}

function sentenceStart(text) { return text ? text.charAt(0).toUpperCase() + text.slice(1) : text }

function greeting(name) {
  if (!name) throw new RequesterNoticeError('NO_REQUESTER', 'a first name is required for the greeting')
  return `Hi ${name}, this is the website team.`
}

function alreadyDoneLine(alreadyDone) {
  const text = String(alreadyDone || '').replace(/\s+/g, ' ').trim()
  return text ? `Already done: ${text.replace(/[.\s]+$/, '')}.` : null
}

/**
 * Missing Info: what is needed from the requester, numbered, and exactly how to provide it.
 * Items are screened first; refused items are returned so the caller can log them, and the message is
 * composed from the accepted ones only. Throws NO_ITEMS when nothing survives.
 */
export function composeMissingInfo({ name, title, ticketId, items, alreadyDone } = {}) {
  const { accepted, refused } = screenItems(items)
  if (!accepted.length) throw new RequesterNoticeError('NO_ITEMS', 'no item survived screening; nothing a requester alone can supply was asked', { refused })
  const lines = [
    greeting(name),
    '',
    `Your request "${plainTitle(title)}" is waiting on the following from you: ${apexLink(ticketId)}`,
    '',
    ...accepted.map((item, index) => `${index + 1}. ${sentenceStart(item.replace(/[.\s]+$/, ''))}`),
    '',
    alreadyDoneLine(alreadyDone),
    HOW_TO_PROVIDE,
    '',
    SIGNATURE,
  ].filter((line) => line !== null)
  const text = lines.join('\n')
  const { words } = checkMessage(text)
  return { text, words, accepted, refused, ask: accepted }
}

/** Refuse a role id in the owner slot; the requester reads a person's name, never "packet-owner". */
export function assertPersonName(owner, roleIds = []) {
  const name = String(owner || '').trim()
  if (!name) throw new RequesterNoticeError('NO_OWNER', 'a blocked notice names the person it waits on; none given and none registered for the role')
  if (roleIds.includes(name) || /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(name)) throw new RequesterNoticeError('OWNER_IS_ROLE', `"${name}" is a role, not a person; name the person`, { owner: name })
  return name
}

/**
 * Blocked: what the ticket waits on, who owns it (a person), roughly when if known, what is already done,
 * and that no action is needed from the requester.
 */
export function composeBlocked({ name, title, ticketId, waitingOn, owner, when, alreadyDone, roleIds } = {}) {
  const blocker = String(waitingOn || '').replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '')
  if (!blocker) throw new RequesterNoticeError('MISSING_ARG', 'a blocked notice says what the ticket waits on')
  const person = assertPersonName(owner, roleIds)
  const timing = String(when || '').replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '')
  const lines = [
    greeting(name),
    '',
    `Your request "${plainTitle(title)}" is on hold: ${apexLink(ticketId)}`,
    '',
    `Waiting on: ${blocker}.`,
    `Owner: ${person}.`,
    timing ? `Expected: ${timing}.` : null,
    alreadyDoneLine(alreadyDone),
    'We will update you when it moves; no action needed from you.',
    '',
    SIGNATURE,
  ].filter((line) => line !== null)
  const text = lines.join('\n')
  const { words } = checkMessage(text)
  return { text, words, ask: [blocker, person, timing].filter(Boolean) }
}

/** Shared blocker: two lines pointing at the channel note, so the requester reads one thread, not one DM each. */
export function composeShared({ name, title, ticketId, permalink } = {}) {
  let link
  try { link = new URL(String(permalink)) } catch { throw new RequesterNoticeError('BAD_PERMALINK', `--shared needs the Slack thread permalink, got ${permalink}`) }
  if (link.protocol !== 'https:' || !/(^|\.)slack\.com$/i.test(link.hostname)) throw new RequesterNoticeError('BAD_PERMALINK', `--shared needs an https Slack permalink, got ${permalink}`)
  const text = [
    `${greeting(name)} Your request "${plainTitle(title)}" (${apexLink(ticketId)}) is on hold with others for the same reason; the note here says what it waits on and who owns it: ${link.toString()}`,
    `We will update you when it moves; no action needed from you. ${SIGNATURE}`,
  ].join('\n')
  const { words } = checkMessage(text)
  return { text, words, ask: [link.toString()] }
}

/**
 * The once-only rule against the ticket's ledger (`customFields.requesterNotices`).
 * missing-info: never twice for the same ask; a changed ask sends once more.
 * blocked: one `blocked`, then `blocked-update` only when the blocker text changed; the same text never resends.
 * Returns { send, kind, reason, previous }.
 */
export function noticeDecision(ledger, kind, hash) {
  if (!NOTICE_KINDS.includes(kind)) throw new RequesterNoticeError('BAD_KIND', `kind must be one of ${NOTICE_KINDS.join(', ')}, got ${kind}`)
  const entries = Array.isArray(ledger) ? ledger.filter((entry) => entry && typeof entry === 'object' && entry.sentAt) : []
  if (kind === 'missing-info') {
    const previous = entries.find((entry) => entry.kind === 'missing-info' && entry.askHash === hash)
    if (previous) return { send: false, kind, reason: `already sent ${previous.sentAt} for the same ask`, previous }
    return { send: true, kind, reason: entries.some((entry) => entry.kind === 'missing-info') ? 'the ask changed since the last notice' : 'first notice for this ask', previous: null }
  }
  const blockedEntries = entries.filter((entry) => entry.kind === 'blocked' || entry.kind === 'blocked-update')
  const latest = blockedEntries[blockedEntries.length - 1] || null
  if (!latest) return { send: true, kind: 'blocked', reason: 'first blocked notice', previous: null }
  if (blockedEntries.some((entry) => entry.askHash === hash)) return { send: false, kind: 'blocked-update', reason: `already sent ${latest.sentAt} for the same blocker`, previous: latest }
  return { send: true, kind: 'blocked-update', reason: 'the blocker changed since the last notice', previous: latest }
}

/** A ledger entry for a sent notice. */
export function sentEntry({ kind, hash, sentAt, slackChannel, slackTs, recipient }) {
  return { kind, askHash: hash, sentAt, slackChannel, slackTs, recipient }
}

/** A ledger entry for a requester Slack could not resolve: nothing sent, the note stays on the ticket, the digest lists it. */
export function unresolvedEntry({ kind, hash, at, email }) {
  return { kind, askHash: hash, sentAt: null, slackChannel: null, slackTs: null, recipient: null, unresolved: true, email: email || null, at, reason: `no Slack user for ${email || 'the requester email'}; note on the ticket only; add to the coordinator digest` }
}

/**
 * The customFields patch that appends one ledger entry. Same shape as intake's `intakeCustomFieldsPatch`
 * (merge, own key only, every other key preserved untouched); intake's helper is not reused because it
 * refuses every key outside its own set, and this key is the notifier's, not intake's.
 */
export function requesterNoticesPatch(existing, entry) {
  const current = Array.isArray(existing?.[LEDGER_FIELD]) ? existing[LEDGER_FIELD] : []
  return { ...(existing || {}), [LEDGER_FIELD]: [...current, entry] }
}

export function ledgerOf(ticket) {
  const value = ticket?.customFields?.[LEDGER_FIELD]
  return Array.isArray(value) ? value : []
}

/** The unresolved entries on a ticket, for the coordinator digest. */
export function unresolvedNotices(ticket) {
  return ledgerOf(ticket).filter((entry) => entry && entry.unresolved && !entry.sentAt)
}

/** Append the notice under the dated heading; the requester's original text stays first because nothing above it changes. */
export function appendNoticeToDescription(description, text, date) {
  const current = String(description || '')
  const heading = `${DESCRIPTION_HEADING}, ${date}`
  if (/<(p|br|strong|div)\b/i.test(current)) {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `${current}<p><strong>${heading}</strong><br>${escaped.replace(/\n/g, '<br>')}</p>`
  }
  return `${current.replace(/\s+$/, '')}\n\n${heading}\n${text}\n`
}
