#!/usr/bin/env node
/**
 * Read the reviewer's reactions on pending requester-notice review items and act on them.
 *
 *   node agent/notice-review-poll.mjs --once [--send] [--ledger <file>]
 *   node agent/notice-review-poll.mjs --interval 60 --send        # keeps polling until interrupted
 *
 * For every pending item in the review ledger (spec/requester-notices.json, agent/notice-review.mjs) the poll
 * reads the reviewer's DM through conversations.history and looks at its `reactions`: the send reaction from
 * the reviewer's own user id sends the notice through the normal notifier path (DM to the requester, ticket
 * ledger, description append; a channel note is posted to its channel), marks the item sent with the send ts,
 * and replies in the reviewer's thread "Sent to <name> at <time>"; the hold reaction marks it held and replies
 * "Held"; an item older than expiryDays with no reaction is marked expired with a reply. Other users' reactions
 * and the bot's own are ignored; hold wins when both are present. A DM that depends on a channel note waits
 * until the note is sent and then carries the note's real permalink in place of the placeholder.
 *
 * Without --send the poll only reports what it would do: no Slack post, no ledger line, no APEX write.
 * Idempotent: an item marked sent is never sent again; before a send the notice is recomposed as a dry run and
 * must read exactly as reviewed (else the item is marked stale and held), and the ticket's own once-only ledger
 * is the second guard (an ask APEX already records as sent is marked superseded, nothing goes twice).
 *
 * Env: SLACK_BOT_TOKEN (im:history to read, chat:write to reply and send), APEX_API_TOKEN for requester
 * items with --send, NOTICE_REVIEW_LEDGER to point at another ledger file.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NotifyRequesterError, parseArgs, postChannelNote, readMessage, replyInThread, runNotice } from './notify-requester.mjs'
import { RequesterNoticeError } from './requester-notice-policy.mjs'
import { CHANNEL_NOTE_KIND, NoticeReviewError, appendLedger, isExpired, ledgerPath, loadReviewSpec, reactionVerdict, readLedger, reviewerTime } from './notice-review.mjs'

const OPEN = new Set(['pending', 'sending'])

function stamp(entry, now) { return { ...entry, at: now().toISOString() } }

/** What the reviewer's message says about one item: send, hold, expire, wait, or gone (message not found). */
async function verdictFor(item, spec, { slackToken, fetchImpl, now }) {
  if (item.status === 'sending') return { verdict: 'send', why: 'a send was interrupted after the reviewer approved it; resuming' }
  const message = await readMessage(item.reviewChannel, item.reviewTs, { token: slackToken, fetchImpl })
  if (!message) return isExpired(item, spec, now()) ? { verdict: 'expire', why: 'reviewer message not found and the item is past expiry' } : { verdict: 'gone', why: 'reviewer message not found; left pending' }
  const reaction = reactionVerdict(message, item.reviewer?.slackUserId, spec)
  if (reaction === 'hold') return { verdict: 'hold', why: `:${spec.reactions.hold}: from the reviewer` }
  if (reaction === 'send') return { verdict: 'send', why: `:${spec.reactions.send}: from the reviewer` }
  if (isExpired(item, spec, now())) return { verdict: 'expire', why: `no reaction from the reviewer in ${spec.expiryDays} days` }
  return { verdict: 'wait', why: 'no reaction from the reviewer yet' }
}

/** The real send for one approved item, through the notifier path; returns the ledger line to append. */
async function performSend(item, byId, spec, { env, fetchImpl, io, now }) {
  const slackToken = env.SLACK_BOT_TOKEN
  if (item.kind === CHANNEL_NOTE_KIND) {
    const posted = await postChannelNote(item.channel, item.text, { token: slackToken, fetchImpl })
    if (!posted.permalink) throw new NotifyRequesterError('SLACK_ERROR', 'Slack returned no permalink for the channel note; the dependent DMs need it', { posted })
    return { status: 'sent', sentAt: now().toISOString(), sent: posted, reply: `Sent to <#${item.channel}> at ${reviewerTime(now().toISOString(), spec.reviewer.timeZone)}: ${posted.permalink}` }
  }
  if (!env.APEX_API_TOKEN) throw new NotifyRequesterError('MISSING_TOKEN', 'APEX_API_TOKEN required to send a requester notice (the ledger is written on the ticket)')
  const note = item.dependsOn ? byId.get(item.dependsOn) : null
  const permalink = note?.sent?.permalink || null
  const expected = item.placeholder && permalink ? item.text.split(item.placeholder).join(permalink) : item.text
  const options = { ticketId: item.ticketId, ...item.notice, kind: item.notice.kind, shared: permalink || item.notice.shared, reviewSpec: spec }
  const quiet = { log() {}, error() {} }
  // Recompose as a dry run first: the text must read exactly as the reviewer saw it, and the ticket's ledger must still want it.
  const check = await runNotice({ ...options }, { env, fetchImpl, io: quiet, now })
  if (!check.decision.send) return { status: 'superseded', at: now().toISOString(), reason: check.decision.reason, reply: `Not sent: the ticket already records this notice (${check.decision.reason}).` }
  if (check.message !== expected) return { status: 'stale', at: now().toISOString(), reason: 'the recomposed text differs from the reviewed text', recomposed: check.message, reply: 'Held: the text no longer reads as reviewed (the ticket or the recipient changed); request review again.' }
  const result = await runNotice({ ...options, send: true, reviewed: item.id }, { env, fetchImpl, io, now })
  const sentAt = result.ledgerEntry?.sentAt || now().toISOString()
  const name = result.recipient?.name || item.recipient?.name || item.recipient?.email
  return { status: 'sent', sentAt, sent: result.sent, wrote: result.wrote, reply: `Sent to ${name} at ${reviewerTime(sentAt, spec.reviewer.timeZone)}` }
}

/**
 * One pass over the ledger. Returns { file, actions } where each action is { id, ticketId, kind, verdict, did }.
 */
export async function runPoll({ send = false, ledgerFile = null, spec = null } = {}, { env = process.env, fetchImpl = globalThis.fetch, io = { log: console.log, error: console.error }, now = () => new Date() } = {}) {
  spec ||= loadReviewSpec()
  const file = ledgerFile || ledgerPath(spec, env)
  const slackToken = env.SLACK_BOT_TOKEN
  if (!slackToken) throw new NotifyRequesterError('MISSING_TOKEN', 'SLACK_BOT_TOKEN required to read the reviewer reactions')
  const items = readLedger(file)
  const byId = new Map(items.map((item) => [item.id, item]))
  // Channel notes first, so a DM approved in the same pass as its note can go in this pass.
  const open = items.filter((item) => OPEN.has(item.status)).sort((a, b) => Number(Boolean(a.dependsOn)) - Number(Boolean(b.dependsOn)))
  const actions = []
  if (!open.length) io.log(`no pending review item in ${file}`)
  const record = (item, line) => { appendLedger(file, { id: item.id, ...line }); byId.set(item.id, { ...byId.get(item.id), ...line }) }
  const reply = (item, text) => replyInThread(item.reviewChannel, item.reviewTs, text, { token: slackToken, fetchImpl })
  const label = (item) => `${item.id} ${item.kind} ${item.kind === CHANNEL_NOTE_KIND ? `<#${item.channel}>` : `${item.ticketId} to ${item.recipient?.name || item.recipient?.email || '?'}`}`

  for (const item of open) {
    const action = { id: item.id, ticketId: item.ticketId, kind: item.kind, verdict: null, did: null }
    actions.push(action)
    try {
      let { verdict, why } = await verdictFor(item, spec, { slackToken, fetchImpl, now })
      if (verdict === 'send' && item.dependsOn) {
        const note = byId.get(item.dependsOn)
        if (!note) { verdict = 'hold'; why = 'its channel note item is missing from the ledger' }
        else if (['held', 'expired', 'stale', 'superseded'].includes(note.status)) { verdict = 'hold'; why = `its channel note was ${note.status}` }
        else if (note.status !== 'sent') { verdict = 'wait'; why = `approved, waiting for the channel note (${note.status})` }
      }
      action.verdict = verdict
      if (verdict === 'wait' || verdict === 'gone') { action.did = why; io.log(`${label(item)}: ${why}`); continue }
      if (!send) { action.did = `would ${verdict}`; io.log(`${label(item)}: would ${verdict} (${why}); pass --send to act`); continue }
      if (verdict === 'hold') {
        record(item, stamp({ status: 'held', reason: why }, now))
        await reply(item, 'Held. Nothing sent.')
        action.did = 'held'; io.log(`${label(item)}: held (${why})`); continue
      }
      if (verdict === 'expire') {
        record(item, stamp({ status: 'expired', reason: why }, now))
        await reply(item, `Expired: ${why}; nothing sent. Run the notice again to request review.`)
        action.did = 'expired'; io.log(`${label(item)}: expired (${why})`); continue
      }
      record(item, stamp({ status: 'sending' }, now))
      const outcome = await performSend(item, byId, spec, { env, fetchImpl, io, now })
      const { reply: text, ...line } = outcome
      record(item, line)
      await reply(item, text)
      action.did = line.status
      io.log(`${label(item)}: ${line.status}${line.sent?.ts ? ` (ts ${line.sent.ts})` : ''}: ${text}`)
    } catch (error) {
      if (!(error instanceof NotifyRequesterError) && !(error instanceof RequesterNoticeError) && !(error instanceof NoticeReviewError)) throw error
      action.did = `error ${error.code}: ${error.message}`
      io.error(`${label(item)}: ${error.code}: ${error.message}`)
    }
  }
  return { file, actions }
}

export async function main(argv = process.argv.slice(2), env = process.env, io = { log: console.log, error: console.error }) {
  const args = parseArgs(argv)
  const send = Boolean(args.send)
  const ledgerFile = args.ledger && args.ledger !== true ? path.resolve(String(args.ledger)) : null
  const interval = Math.max(15, Number(args.interval) || 60)
  if (args.once || !args.interval) return runPoll({ send, ledgerFile }, { env, io })
  for (;;) {
    await runPoll({ send, ledgerFile }, { env, io })
    await new Promise((resolve) => setTimeout(resolve, interval * 1000))
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().then((result) => {
    if (result?.actions?.some((action) => action.did?.startsWith('error'))) process.exit(2)
  }).catch((error) => {
    if (error instanceof RequesterNoticeError || error instanceof NotifyRequesterError || error instanceof NoticeReviewError) {
      console.error(`${error.code}: ${error.message}`)
      process.exit(error.code === 'APEX_ERROR' || error.code === 'SLACK_ERROR' || error.code === 'NETWORK' ? 2 : 1)
    }
    console.error(error.stack || error.message)
    process.exit(3)
  })
}
