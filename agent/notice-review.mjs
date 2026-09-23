/**
 * The review gate for requester notices: which notices a reviewer sees before they go, what the reviewer DM
 * says, how a reaction on it is read, and the local ledger that carries an item from pending to sent, held,
 * or expired. Policy in `spec/requester-notices.json`; the senders are `agent/notify-requester.mjs` and
 * `agent/notify-shared-blocker.mjs`, the poll is `agent/notice-review-poll.mjs`.
 *
 * This module never talks to Slack or APEX. The one side effect is the ledger file (JSON lines, append only:
 * the current state of an item is its last line).
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

export const REVIEW_MODES = ['all', 'flagged']
export const FLAG_RULE_IDS = ['question', 'external-recipient', 'channel-note']
export const ITEM_STATUSES = ['pending', 'sending', 'sent', 'held', 'expired', 'stale', 'superseded']
export const REVIEW_INSTRUCTION = 'React ✅ to send, ❌ to hold.'
export const CHANNEL_NOTE_KIND = 'channel-note'

export class NoticeReviewError extends Error {
  /** @param {'BAD_SPEC'|'BAD_LEDGER'|'BAD_ITEM'} code */
  constructor(code, message, extra = {}) { super(message); this.name = 'NoticeReviewError'; this.code = code; Object.assign(this, extra) }
}

export function loadReviewSpec(file = path.join(root, 'spec', 'requester-notices.json')) {
  let spec
  try { spec = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) { throw new NoticeReviewError('BAD_SPEC', `${file}: ${error.message}`) }
  const errors = validateReviewSpec(spec)
  if (errors.length) throw new NoticeReviewError('BAD_SPEC', `${file}: ${errors.join('; ')}`, { errors })
  return spec
}

/** The spec's shape, as `tests/validate-playbook.mjs` checks it; returns the list of problems (empty when valid). */
export function validateReviewSpec(spec) {
  const errors = []
  if (!spec || typeof spec !== 'object') return ['not an object']
  for (const field of ['version', 'asOf', 'reviewMode', 'reviewer', 'reactions', 'expiryDays', 'internalDomains', 'flagRules', 'ledger']) if (spec[field] === undefined) errors.push(`missing ${field}`)
  if (!REVIEW_MODES.includes(spec.reviewMode)) errors.push(`reviewMode must be one of ${REVIEW_MODES.join(', ')}`)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(spec.reviewer?.email || ''))) errors.push('reviewer.email must be an email address')
  if (!spec.reviewer?.name) errors.push('reviewer.name is required')
  for (const key of ['send', 'hold']) if (!/^[a-z0-9_+-]+$/.test(String(spec.reactions?.[key] || ''))) errors.push(`reactions.${key} must be a Slack emoji name (no colons)`)
  if (spec.reactions && spec.reactions.send === spec.reactions.hold) errors.push('reactions.send and reactions.hold must differ')
  if (!(Number.isInteger(spec.expiryDays) && spec.expiryDays > 0)) errors.push('expiryDays must be a positive integer')
  if (!Array.isArray(spec.internalDomains) || !spec.internalDomains.length || !spec.internalDomains.every((domain) => /^[a-z0-9.-]+\.[a-z]+$/.test(domain))) errors.push('internalDomains must list at least one lower-case domain')
  if (!Array.isArray(spec.flagRules)) errors.push('flagRules must be an array')
  else {
    const ids = spec.flagRules.map((rule) => rule?.id)
    for (const id of FLAG_RULE_IDS) if (!ids.includes(id)) errors.push(`flagRules missing ${id}`)
    for (const id of ids) if (!FLAG_RULE_IDS.includes(id)) errors.push(`flagRules names unknown rule ${id}`)
    for (const rule of spec.flagRules) if (!rule?.reason) errors.push(`flag rule ${rule?.id}: missing reason`)
  }
  if (!spec.ledger?.env || !spec.ledger?.defaultPath || !spec.ledger?.fallbackPath) errors.push('ledger needs env, defaultPath and fallbackPath')
  return errors
}

/** Where the ledger lives: the env override, else the spec default when its folder exists, else the fallback in this checkout. */
export function ledgerPath(spec, env = process.env) {
  const fromEnv = env[spec.ledger.env]
  if (fromEnv) return path.resolve(fromEnv)
  if (fs.existsSync(path.dirname(spec.ledger.defaultPath))) return spec.ledger.defaultPath
  return path.join(root, spec.ledger.fallbackPath)
}

const FILE_NOUN = /\b(?:headshots?|photos?|photographs?|pictures?|images?|bios?|biograph(?:y|ies)|logos?|files?|pdfs?|documents?|resumes?|cvs?)\b/i
const QUESTION_MARKER = /\?|\b(?:who|what|which|whether|when|where|why|how|does|do|is|are|should|or)\b/i

/** An attach-a-file ask names a file and asks nothing else; anything with a question marker or a choice is a question. */
export function isQuestionItem(item) {
  const text = String(item || '')
  const body = text.includes(':') ? text.slice(text.indexOf(':') + 1) : text
  if (QUESTION_MARKER.test(body)) return true
  return !FILE_NOUN.test(body)
}

export function isInternalEmail(email, spec) {
  const domain = String(email || '').trim().toLowerCase().split('@')[1] || ''
  return spec.internalDomains.some((internal) => domain === internal || domain.endsWith(`.${internal}`))
}

/**
 * Does this message go to the reviewer before the recipient? Always in "all" mode; in "flagged" mode only when a
 * flag rule matches. `kind` is a notice kind or CHANNEL_NOTE_KIND; `items` are the accepted Missing Info items.
 */
export function needsReview({ kind, items = [], recipientEmail = null } = {}, spec) {
  const reasons = []
  const rule = (id) => spec.flagRules.find((entry) => entry.id === id)?.reason || id
  if (kind === CHANNEL_NOTE_KIND) reasons.push(rule('channel-note'))
  if (kind === 'missing-info' && items.some(isQuestionItem)) reasons.push(rule('question'))
  if (kind !== CHANNEL_NOTE_KIND && recipientEmail && !isInternalEmail(recipientEmail, spec)) reasons.push(rule('external-recipient'))
  const flagged = reasons.length > 0
  if (spec.reviewMode === 'all') return { needsReview: true, mode: 'all', flagged, reasons: flagged ? reasons : ['review mode is "all"'] }
  return { needsReview: flagged, mode: 'flagged', flagged, reasons }
}

export function newItemId() { return crypto.randomBytes(6).toString('hex') }

/**
 * The reviewer DM: one header line, the exact text quoted, the instruction. `subject` is the requester name
 * (or the channel for a note), `title` the ticket title as the requester reads it, `link` the APEX link.
 */
export function composeReviewMessage({ kind, subject, title, link, text, reasons = [], dependsOnNote = false, placeholder = null } = {}) {
  if (!kind || !subject || !text) throw new NoticeReviewError('BAD_ITEM', 'a review message needs kind, subject and text')
  const label = kind === CHANNEL_NOTE_KIND ? 'channel note' : `${kind} notice`
  const lines = [`Review: ${label} for ${subject}${title ? ` (${title})` : ''}${link ? ` ${link}` : ''}`]
  if (reasons.length) lines.push(`Why: ${reasons.join('; ')}.`)
  if (dependsOnNote) lines.push(`Goes after the channel note above is sent; ${placeholder || 'the placeholder link'} in the text becomes the note's link.`)
  lines.push(...String(text).split('\n').map((line) => `> ${line}`))
  lines.push(REVIEW_INSTRUCTION)
  return lines.join('\n')
}

/**
 * Read the reviewer's verdict from a Slack message's `reactions` (conversations.history shape:
 * [{ name, users, count }]). Only the reviewer's own reaction counts; hold wins when both are present.
 */
export function reactionVerdict(message, reviewerUserId, spec) {
  const reactions = Array.isArray(message?.reactions) ? message.reactions : []
  const by = (name) => reactions.some((reaction) => reaction?.name === name && (reaction.users || []).includes(reviewerUserId))
  if (by(spec.reactions.hold)) return 'hold'
  if (by(spec.reactions.send)) return 'send'
  return null
}

export function isExpired(item, spec, now = new Date()) {
  const created = Date.parse(item.createdAt || '')
  if (Number.isNaN(created)) return false
  return now.getTime() - created > spec.expiryDays * 86_400_000
}

/** Every line of the ledger, in order; a bad line is a typed error, never silently skipped. */
export function readLedgerLines(file) {
  if (!fs.existsSync(file)) return []
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line.trim())
  return lines.map((line, index) => {
    try { return JSON.parse(line) } catch (error) { throw new NoticeReviewError('BAD_LEDGER', `${file} line ${index + 1}: ${error.message}`) }
  })
}

/** The current state of every item: the last line per id, in first-seen order. */
export function readLedger(file) {
  const items = new Map()
  for (const line of readLedgerLines(file)) {
    if (!line?.id) throw new NoticeReviewError('BAD_LEDGER', `${file}: a line has no id`)
    items.set(line.id, { ...(items.get(line.id) || {}), ...line })
  }
  return [...items.values()]
}

export function appendLedger(file, entry) {
  if (!entry?.id || !ITEM_STATUSES.includes(entry.status)) throw new NoticeReviewError('BAD_ITEM', `a ledger entry needs an id and a status in ${ITEM_STATUSES.join(', ')}`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`)
  return entry
}

/** An open or done item for the same ticket, kind and ask: a second review request for it is a duplicate. */
export function findLiveItem(items, { ticketId, kind, askHash }) {
  return items.find((item) => item.ticketId === ticketId && item.kind === kind && item.askHash === askHash && ['pending', 'sending', 'sent'].includes(item.status)) || null
}

/** A time the reviewer reads: 10:15 PT on 2026-09-23. */
export function reviewerTime(iso, timeZone = 'America/Los_Angeles') {
  const date = new Date(iso)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).formatToParts(date).map((part) => [part.type, part.value]))
  return `${parts.hour}:${parts.minute} ${parts.timeZoneName} on ${parts.year}-${parts.month}-${parts.day}`
}
