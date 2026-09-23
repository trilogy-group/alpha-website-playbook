#!/usr/bin/env node
/**
 * Tell a requester by Slack DM that their APEX website ticket went to Missing Info or Blocked, once per ask.
 * Decision 2026-09-23 (Matt Barge): APEX will not notify requesters, so the website system does. The rules
 * for the text and the once-only ledger are in `agent/requester-notice-policy.mjs` (pure); this file reads
 * the ticket, resolves the recipient, sends, and records.
 *
 *   node agent/notify-requester.mjs --ticket <id> | --file <ticket.json>  --kind missing-info \
 *     --item "Dawn Adams: headshot and bio" --item "..." [--already-done "..."] [--dry-run | --send]
 *   node agent/notify-requester.mjs --ticket <id> --kind blocked --blocker "..." [--owner "<person>"] [--when "..."] [--already-done "..."]
 *   node agent/notify-requester.mjs --ticket <id> --kind blocked --shared <Slack thread permalink>
 *   node agent/notify-requester.mjs --digest [--file tickets.json]      # tickets whose requester Slack could not reach
 *
 * Dry run is the default: it prints the resolved recipient and the message and sends nothing, writes nothing.
 * --send posts the DM (users.lookupByEmail, conversations.open, chat.postMessage), then records the notice
 * in `customFields.requesterNotices` with a v1 PATCH that carries only customFields (merged; no other key
 * is dropped), then appends the same text to the description under a dated "REQUESTER NOTICE (Slack DM)"
 * heading, the requester's original text first. A requester with no Slack user gets no DM: the ledger and
 * stdout say so, the note still goes on the ticket, and --digest lists the ticket for the coordinator.
 * Owner for a blocked notice defaults to the registered person for the ticket's ownerRole (policy bundle);
 * a role id is refused. Nothing here writes to WordPress, HubSpot, or Slack channels.
 *
 * Env: SLACK_BOT_TOKEN (bot marketing_support; users:read.email, im:write, chat:write), APEX_API_TOKEN,
 * APEX_API_BASE and APEX_AGENT_API_BASE as agent/intake.mjs derives them.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apexBases } from './attach-evidence.mjs'
import {
  NOTICE_KINDS,
  RequesterNoticeError,
  appendNoticeToDescription,
  askHash,
  composeBlocked,
  composeMissingInfo,
  composeShared,
  firstName,
  ledgerOf,
  noticeDecision,
  requesterNoticesPatch,
  sentEntry,
  unresolvedEntry,
  unresolvedNotices,
} from './requester-notice-policy.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const DIGEST_STATUSES = ['MISSING_INFO', 'BLOCKED']

export class NotifyRequesterError extends Error {
  /** @param {'MISSING_ARG'|'MISSING_TOKEN'|'APEX_ERROR'|'SLACK_ERROR'|'NETWORK'|'BAD_FILE'} code */
  constructor(code, message, extra = {}) { super(message); this.name = 'NotifyRequesterError'; this.code = code; Object.assign(this, extra) }
}

function loadRoleOwners() {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'spec', 'policy-bundle.generated.json'), 'utf8')).roleOwners || {} } catch { return {} }
}

/** The registered person for a role, only when exactly one is registered; never a guess. */
export function ownerForRole(role, roleOwners = loadRoleOwners()) {
  const people = (roleOwners[role] || []).filter((person) => person?.name)
  return people.length === 1 ? people[0].name : null
}

/** Form-encoded, which every Slack Web API method accepts (users.lookupByEmail refuses a JSON body: invalid_arguments, 2026-09-23). */
async function slackCall(method, token, body, fetchImpl) {
  let response
  try {
    response = await fetchImpl(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body: new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)])).toString(),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) { throw new NotifyRequesterError('NETWORK', `Slack ${method} failed before Slack answered: ${error.message}`) }
  const data = await response.json().catch(() => ({}))
  return data
}

/** users.lookupByEmail; null when Slack has no user for the address (users_not_found), typed error otherwise. */
export async function lookupSlackUser(email, { token, fetchImpl = globalThis.fetch } = {}) {
  const data = await slackCall('users.lookupByEmail', token, { email }, fetchImpl)
  if (data.ok) {
    const user = data.user || {}
    return { id: user.id, name: user.real_name || user.name || null, firstName: user.profile?.first_name || null, email }
  }
  if (data.error === 'users_not_found') return null
  throw new NotifyRequesterError('SLACK_ERROR', `Slack users.lookupByEmail: ${data.error || 'unknown error'}`, { method: 'users.lookupByEmail', error: data.error })
}

export async function sendDm(userId, text, { token, fetchImpl = globalThis.fetch } = {}) {
  const opened = await slackCall('conversations.open', token, { users: userId }, fetchImpl)
  if (!opened.ok) throw new NotifyRequesterError('SLACK_ERROR', `Slack conversations.open: ${opened.error || 'unknown error'}`, { method: 'conversations.open', error: opened.error })
  const channel = opened.channel?.id
  const posted = await slackCall('chat.postMessage', token, { channel, text, unfurl_links: false, unfurl_media: false }, fetchImpl)
  if (!posted.ok) throw new NotifyRequesterError('SLACK_ERROR', `Slack chat.postMessage: ${posted.error || 'unknown error'}`, { method: 'chat.postMessage', error: posted.error })
  return { channel, ts: posted.ts }
}

/** Post one message in a channel (the shared-blocker note) and return its permalink. */
export async function postChannelNote(channel, text, { token, fetchImpl = globalThis.fetch } = {}) {
  const posted = await slackCall('chat.postMessage', token, { channel, text, unfurl_links: false, unfurl_media: false }, fetchImpl)
  if (!posted.ok) throw new NotifyRequesterError('SLACK_ERROR', `Slack chat.postMessage: ${posted.error || 'unknown error'}`, { method: 'chat.postMessage', error: posted.error })
  const link = await slackCall('chat.getPermalink', token, { channel, message_ts: posted.ts }, fetchImpl)
  return { channel, ts: posted.ts, permalink: link.ok ? link.permalink : null }
}

async function apexRequest(url, token, method, body, fetchImpl) {
  let response
  try {
    response = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) { throw new NotifyRequesterError('NETWORK', `APEX ${method} ${url} failed before APEX answered: ${error.message}`) }
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text.slice(0, 500) } }
  if (!response.ok) throw new NotifyRequesterError('APEX_ERROR', `APEX ${method} ${url} ${response.status}: ${JSON.stringify(data.error || data).slice(0, 500)}`, { status: response.status, body: data })
  return data.task || data
}

export function readTicketFile(file) {
  let raw
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error) { throw new NotifyRequesterError('BAD_FILE', `${file} is not a readable ticket JSON: ${error.message}`) }
  const ticket = Array.isArray(raw) ? raw[0] : raw.task || raw
  if (!ticket?.id) throw new NotifyRequesterError('BAD_FILE', `${file} has no ticket id`)
  return ticket
}

async function listTickets(v1Base, token, fetchImpl) {
  const all = []
  for (const status of DIGEST_STATUSES) {
    for (let page = 1; page <= 20; page++) {
      const response = await apexRequest(`${v1Base}/tasks?status=${encodeURIComponent(status)}&page=${page}&pageSize=100`, token, 'GET', undefined, fetchImpl)
      const items = response.items || response.tasks || response.data || []
      all.push(...items)
      if (items.length < 100) break
    }
  }
  return [...new Map(all.map((ticket) => [ticket.id, ticket])).values()]
}

/** The digest rows: every ticket carrying an unresolved requester notice. */
export function digestRows(tickets) {
  return tickets.flatMap((ticket) => unresolvedNotices(ticket).map((entry) => ({
    id: ticket.id, title: String(ticket.title || '').slice(0, 100), status: ticket.status || null, requesterEmail: ticket.requesterEmail || entry.email || null, kind: entry.kind, at: entry.at || null, reason: entry.reason || null,
  })))
}

/**
 * The whole notice: read, decide, screen, resolve, compose, and (with send) post and record.
 * Pure inputs in `options`; every side effect goes through `fetchImpl` so tests mock Slack and APEX.
 */
export async function runNotice(options, { env = process.env, fetchImpl = globalThis.fetch, io = { log: console.log, error: console.error }, now = () => new Date() } = {}) {
  const { kind } = options
  if (!NOTICE_KINDS.includes(kind)) throw new RequesterNoticeError('BAD_KIND', `--kind must be one of ${NOTICE_KINDS.join(', ')}, got ${kind}`)
  const send = Boolean(options.send)
  const { v1Base, agentBase } = apexBases(env)
  const apexToken = env.APEX_API_TOKEN
  const slackToken = env.SLACK_BOT_TOKEN

  let ticket = options.ticket || null
  if (!ticket && options.file) ticket = readTicketFile(options.file)
  if (!ticket && options.ticketId) {
    if (!apexToken) throw new NotifyRequesterError('MISSING_TOKEN', 'APEX_API_TOKEN required to fetch the ticket (or pass --file)')
    ticket = await apexRequest(`${agentBase}/tasks/${encodeURIComponent(options.ticketId)}`, apexToken, 'GET', undefined, fetchImpl)
  }
  if (!ticket) throw new NotifyRequesterError('MISSING_ARG', '--ticket <id> or --file <ticket.json> is required')
  // A send decides against the ledger as APEX holds it now, not as a caller's copy of the ticket held it.
  if (send && options.ticket && apexToken) ticket = await apexRequest(`${agentBase}/tasks/${encodeURIComponent(ticket.id)}`, apexToken, 'GET', undefined, fetchImpl)
  const email = String(ticket.requesterEmail || '').trim().toLowerCase()
  if (!email) throw new RequesterNoticeError('NO_REQUESTER', `ticket ${ticket.id} has no requesterEmail; nobody to notify`)

  // Recipient first: the greeting needs the first name, and an unreachable requester changes what is written.
  let recipient = null
  let recipientNote = null
  if (slackToken) {
    recipient = await lookupSlackUser(email, { token: slackToken, fetchImpl })
    if (!recipient) recipientNote = `no Slack user for ${email}; note on the ticket only; add to the coordinator digest`
  } else {
    recipientNote = 'SLACK_BOT_TOKEN not set; recipient not resolved (dry run only)'
    if (send) throw new NotifyRequesterError('MISSING_TOKEN', 'SLACK_BOT_TOKEN required for --send')
  }
  const name = firstName({ slackFirstName: recipient?.firstName, slackRealName: recipient?.name, email })
  const title = options.title || ticket.title

  // Compose. Refused items are reported, never sent.
  let composed
  if (options.shared) {
    composed = composeShared({ name, title, ticketId: ticket.id, permalink: options.shared })
  } else if (kind === 'missing-info') {
    composed = composeMissingInfo({ name, title, ticketId: ticket.id, items: options.items || [], alreadyDone: options.alreadyDone })
  } else {
    const roleOwners = options.roleOwners || loadRoleOwners()
    const owner = options.owner || ownerForRole(ticket.customFields?.ownerRole, roleOwners)
    composed = composeBlocked({ name, title, ticketId: ticket.id, waitingOn: options.blocker, owner, when: options.when, alreadyDone: options.alreadyDone, roleIds: Object.keys(roleOwners) })
  }
  for (const refused of composed.refused || []) io.error(`refused item (${refused.reason}): ${refused.item}`)

  const hash = askHash(composed.ask)
  const decision = noticeDecision(ledgerOf(ticket), kind, hash)
  const result = {
    ticketId: ticket.id, title: String(ticket.title || ''), status: ticket.status || null, requesterEmail: email,
    kind: decision.kind, decision, recipient: recipient ? { email, slackUserId: recipient.id, name: recipient.name } : null, recipientNote,
    askHash: hash, message: composed.text, words: composed.words, refused: composed.refused || [], dryRun: !send, sent: null, ledgerEntry: null, wrote: [],
  }

  const headline = `${ticket.id} "${result.title}" (${result.status || 'status unknown'})`
  if (!decision.send) {
    io.log(`${headline}: not sent, ${decision.reason} (${decision.kind}, ask ${hash.slice(0, 12)})`)
    result.message = null
    return result
  }

  io.log(`${headline}\nkind: ${decision.kind} (${decision.reason}; ask ${hash.slice(0, 12)})`)
  io.log(recipient ? `recipient: ${recipient.name || email} <${email}> (Slack ${recipient.id})` : `recipient: ${recipientNote}`)
  io.log(`--- message (${composed.words} words) ---\n${composed.text}\n--- end ---`)

  const at = now().toISOString()
  const date = at.slice(0, 10)
  if (!send) {
    result.ledgerEntry = recipient ? sentEntry({ kind: decision.kind, hash, sentAt: '<send time>', slackChannel: '<dm channel>', slackTs: '<message ts>', recipient: recipient.id }) : unresolvedEntry({ kind: decision.kind, hash, at, email })
    io.log(`dry run: nothing sent, nothing written. --send would ${recipient ? 'DM the recipient, then' : 'skip the DM and'} record ${JSON.stringify(result.ledgerEntry)} and append the text to the description under "REQUESTER NOTICE (Slack DM), ${date}".`)
    return result
  }

  if (!apexToken) throw new NotifyRequesterError('MISSING_TOKEN', 'APEX_API_TOKEN required for --send (the ledger is written on the ticket)')
  if (recipient) {
    const posted = await sendDm(recipient.id, composed.text, { token: slackToken, fetchImpl })
    result.sent = posted
    result.ledgerEntry = sentEntry({ kind: decision.kind, hash, sentAt: at, slackChannel: posted.channel, slackTs: posted.ts, recipient: recipient.id })
    io.log(`sent: DM ${posted.channel} ts ${posted.ts}`)
  } else {
    result.ledgerEntry = unresolvedEntry({ kind: decision.kind, hash, at, email })
    io.log(`not sent: ${recipientNote}`)
  }
  // Record on the fresh ticket so a key written since the read is never dropped; customFields only, then description only.
  const ticketUrl = `${v1Base}/tasks/${encodeURIComponent(ticket.id)}`
  const current = await apexRequest(`${agentBase}/tasks/${encodeURIComponent(ticket.id)}`, apexToken, 'GET', undefined, fetchImpl)
  await apexRequest(ticketUrl, apexToken, 'PATCH', { customFields: requesterNoticesPatch(current.customFields, result.ledgerEntry) }, fetchImpl)
  result.wrote.push('customFields.requesterNotices')
  await apexRequest(ticketUrl, apexToken, 'PATCH', { description: appendNoticeToDescription(current.description, composed.text, date) }, fetchImpl)
  result.wrote.push('description')
  io.log(`recorded on the ticket: ${result.wrote.join(', ')}`)
  return result
}

export async function runDigest({ file } = {}, { env = process.env, fetchImpl = globalThis.fetch, io = { log: console.log, error: console.error } } = {}) {
  let tickets
  if (file) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    tickets = Array.isArray(raw) ? raw : raw.tasks || raw.items || raw.data || []
  } else {
    if (!env.APEX_API_TOKEN) throw new NotifyRequesterError('MISSING_TOKEN', 'APEX_API_TOKEN required for --digest (or pass --file)')
    tickets = await listTickets(apexBases(env).v1Base, env.APEX_API_TOKEN, fetchImpl)
  }
  const rows = digestRows(tickets)
  if (!rows.length) io.log('coordinator digest: no ticket with an unreachable requester')
  else {
    io.log(`coordinator digest: ${rows.length} notice(s) with no Slack user; relay by hand`)
    for (const row of rows) io.log(`${row.id} | ${row.status} | ${row.requesterEmail} | ${row.kind} | ${row.at} | ${row.title}`)
  }
  return rows
}

/** --item repeats; everything else is the last value given. */
export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2); const next = argv[i + 1]
    const value = next === undefined || next.startsWith('--') ? true : (i++, next)
    if (key === 'item') (out.item ||= []).push(value)
    else out[key] = value
  }
  return out
}

export async function main(argv = process.argv.slice(2), env = process.env, io = { log: console.log, error: console.error }) {
  const args = parseArgs(argv)
  if (args.digest) return runDigest({ file: args.file && args.file !== true ? args.file : null }, { env, io })
  if (args.send && args['dry-run']) throw new NotifyRequesterError('MISSING_ARG', '--send and --dry-run exclude each other')
  const options = {
    ticketId: args.ticket && args.ticket !== true ? String(args.ticket) : null,
    file: args.file && args.file !== true ? String(args.file) : null,
    kind: args.kind || (args.shared ? 'blocked' : undefined),
    items: [...(args.item || []), ...(args['items-file'] && args['items-file'] !== true ? fs.readFileSync(args['items-file'], 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [])],
    blocker: args.blocker && args.blocker !== true ? String(args.blocker) : null,
    owner: args.owner && args.owner !== true ? String(args.owner) : null,
    when: args.when && args.when !== true ? String(args.when) : null,
    alreadyDone: args['already-done'] && args['already-done'] !== true ? String(args['already-done']) : null,
    shared: args.shared && args.shared !== true ? String(args.shared) : null,
    title: args.title && args.title !== true ? String(args.title) : null,
    send: Boolean(args.send),
  }
  const result = await runNotice(options, { env, io })
  if (args.out && args.out !== true) fs.writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`)
  return result
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch((error) => {
    if (error instanceof RequesterNoticeError || error instanceof NotifyRequesterError) {
      console.error(`${error.code}: ${error.message}`)
      process.exit(error.code === 'APEX_ERROR' || error.code === 'SLACK_ERROR' || error.code === 'NETWORK' ? 2 : 1)
    }
    console.error(error.stack || error.message)
    process.exit(3)
  })
}
