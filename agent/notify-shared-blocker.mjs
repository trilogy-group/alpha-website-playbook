#!/usr/bin/env node
/**
 * One channel note for a blocker several tickets share (a packet batch, a decision, a deploy), then a two-line
 * DM to each requester pointing at that thread, so the requesters read one note and the channel holds the
 * updates. Decision 2026-09-23 (Matt Barge). Same text criteria as a requester notice
 * (`agent/requester-notice-policy.mjs`), same once-only ledger per ticket (`agent/notify-requester.mjs`).
 *
 *   node agent/notify-shared-blocker.mjs --channel <id> --title "..." --body-file <md> [--tickets id,id] [--dry-run | --review | --send]
 *
 * Dry run (default) prints the note and each DM with a placeholder permalink and sends nothing. --send posts
 * the note (chat.postMessage, then chat.getPermalink), prints the permalink, and sends each DM through
 * notify-requester with --shared <permalink>, which records the notice on the ticket. A DM failure on one
 * ticket is reported and the others still go; the note is posted once even when a DM fails.
 *
 * Review gate (spec/requester-notices.json): a channel note is always a flagged item, so --send behaves as
 * --review unless the poll passes `reviewed`: the reviewer gets one DM for the note and one per requester DM
 * (each carrying the placeholder link and marked as depending on the note); `agent/notice-review-poll.mjs`
 * posts the note on its send reaction and then sends each approved DM with the note's real permalink.
 *
 * Env: SLACK_BOT_TOKEN, APEX_API_TOKEN (for the ledger on each ticket), APEX_API_BASE as intake derives it.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NotifyRequesterError, parseArgs, postChannelNote, requestReview, runNotice } from './notify-requester.mjs'
import { RequesterNoticeError, askHash, checkMessage } from './requester-notice-policy.mjs'
import { CHANNEL_NOTE_KIND, composeReviewMessage, ledgerPath, loadReviewSpec, needsReview } from './notice-review.mjs'

export function composeChannelNote({ title, body } = {}) {
  const heading = String(title || '').replace(/\s+/g, ' ').trim()
  if (!heading) throw new NotifyRequesterError('MISSING_ARG', '--title is required')
  const text = String(body || '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
  if (!text) throw new NotifyRequesterError('MISSING_ARG', '--body-file is empty')
  const note = `${heading}\n\n${text}`
  const { words } = checkMessage(note)
  return { text: note, words }
}

export function planSharedBlocker(args) {
  const channel = args.channel && args.channel !== true ? String(args.channel).trim() : ''
  if (!/^[CG][A-Z0-9]{6,}$/.test(channel)) throw new NotifyRequesterError('MISSING_ARG', `--channel needs the Slack channel id (C...), got ${args.channel || 'nothing'}`)
  if (!args['body-file'] || args['body-file'] === true) throw new NotifyRequesterError('MISSING_ARG', '--body-file <md> is required')
  let body
  try { body = fs.readFileSync(String(args['body-file']), 'utf8') } catch (error) { throw new NotifyRequesterError('MISSING_ARG', `--body-file ${args['body-file']} cannot be read: ${error.code || error.message}`) }
  const note = composeChannelNote({ title: args.title, body })
  const tickets = String(args.tickets && args.tickets !== true ? args.tickets : '').split(',').map((id) => id.trim()).filter(Boolean)
  if (args.send && args['dry-run']) throw new NotifyRequesterError('MISSING_ARG', '--send and --dry-run exclude each other')
  if (args.send && args.review) throw new NotifyRequesterError('MISSING_ARG', '--send and --review exclude each other')
  if (args.review && args['dry-run']) throw new NotifyRequesterError('MISSING_ARG', '--review and --dry-run exclude each other')
  return { channel, note, tickets, send: Boolean(args.send), review: Boolean(args.review), reviewer: args.reviewer && args.reviewer !== true ? String(args.reviewer) : null, placeholderPermalink: `https://slack.com/archives/${channel}/p0` }
}

/**
 * Post the reviewer DM for the note and one per requester DM; nothing reaches the channel or a requester.
 * The DMs are composed with the placeholder permalink and depend on the note's ledger item.
 */
async function reviewSharedBlocker(plan, spec, { env, fetchImpl, io, now }) {
  const slackToken = env.SLACK_BOT_TOKEN
  const reviewerEmail = String(plan.reviewer || spec.reviewer.email).trim().toLowerCase()
  const gate = needsReview({ kind: CHANNEL_NOTE_KIND }, spec)
  const heading = plan.note.text.split('\n')[0]
  const reviewText = composeReviewMessage({ kind: CHANNEL_NOTE_KIND, subject: `<#${plan.channel}>`, title: heading, link: plan.tickets.length ? `tickets ${plan.tickets.join(', ')}` : null, text: plan.note.text, reasons: gate.reasons })
  const item = { ticketId: plan.channel, ticketTitle: heading, kind: CHANNEL_NOTE_KIND, askHash: askHash([plan.note.text]), recipient: { channel: plan.channel }, text: plan.note.text, words: plan.note.words, reasons: gate.reasons, flagged: gate.flagged, channel: plan.channel, tickets: plan.tickets, notice: null, dependsOn: null, placeholder: null }
  const noteReview = await requestReview({ spec, item, reviewText, reviewerEmail, ledgerFile: ledgerPath(spec, env), slackToken, fetchImpl, io, now })
  const dms = []
  for (const ticketId of plan.tickets) {
    try {
      const result = await runNotice({ ticketId, kind: 'blocked', shared: plan.placeholderPermalink, review: true, reviewer: reviewerEmail, reviewSpec: spec, dependsOn: noteReview.itemId, placeholder: plan.placeholderPermalink }, { env, fetchImpl, io, now })
      dms.push({ ticketId, ok: true, route: result.route, review: result.review, decision: result.decision, recipient: result.recipient, recipientNote: result.recipientNote })
    } catch (error) {
      if (!(error instanceof RequesterNoticeError) && !(error instanceof NotifyRequesterError)) throw error
      io.error(`${ticketId}: ${error.code}: ${error.message}`)
      dms.push({ ticketId, ok: false, code: error.code, message: error.message })
    }
  }
  return { channel: plan.channel, note: plan.note, posted: null, permalink: null, route: 'review', review: noteReview, dms, dryRun: false }
}

export async function runSharedBlocker(plan, { env = process.env, fetchImpl = globalThis.fetch, io = { log: console.log, error: console.error }, now = () => new Date() } = {}) {
  io.log(`channel ${plan.channel}\n--- note (${plan.note.words} words) ---\n${plan.note.text}\n--- end ---`)
  const spec = plan.reviewSpec || loadReviewSpec()
  // A channel note is always flagged: --send goes to review unless the poll says the reviewer approved it.
  if (plan.review || (plan.send && !plan.reviewed)) {
    if (!env.SLACK_BOT_TOKEN) throw new NotifyRequesterError('MISSING_TOKEN', `SLACK_BOT_TOKEN required for --${plan.review ? 'review' : 'send'}`)
    io.log(`review: ${needsReview({ kind: CHANNEL_NOTE_KIND }, spec).reasons.join('; ')}; the note and each DM go to the reviewer first`)
    return reviewSharedBlocker(plan, spec, { env, fetchImpl, io, now })
  }
  let posted = null
  if (plan.send) {
    if (!env.SLACK_BOT_TOKEN) throw new NotifyRequesterError('MISSING_TOKEN', 'SLACK_BOT_TOKEN required for --send')
    posted = await postChannelNote(plan.channel, plan.note.text, { token: env.SLACK_BOT_TOKEN, fetchImpl })
    io.log(`posted: ${plan.channel} ts ${posted.ts} ${posted.permalink || '(no permalink returned)'}`)
    if (!posted.permalink) throw new NotifyRequesterError('SLACK_ERROR', 'Slack returned no permalink for the note; the DMs need it, none sent', { posted })
  } else {
    io.log(`dry run: note not posted; the DMs below carry the placeholder ${plan.placeholderPermalink} until the note exists.`)
  }
  const permalink = posted?.permalink || plan.placeholderPermalink
  const dms = []
  for (const ticketId of plan.tickets) {
    try {
      const result = await runNotice({ ticketId, kind: 'blocked', shared: permalink, send: plan.send, reviewed: plan.reviewed || null, reviewSpec: spec }, { env, fetchImpl, io, now })
      dms.push({ ticketId, ok: true, sent: result.sent, decision: result.decision, recipient: result.recipient, recipientNote: result.recipientNote })
    } catch (error) {
      if (!(error instanceof RequesterNoticeError) && !(error instanceof NotifyRequesterError)) throw error
      io.error(`${ticketId}: ${error.code}: ${error.message}`)
      dms.push({ ticketId, ok: false, code: error.code, message: error.message })
    }
  }
  return { channel: plan.channel, note: plan.note, posted, permalink: posted?.permalink || null, dms, dryRun: !plan.send }
}

export async function main(argv = process.argv.slice(2), env = process.env, io = { log: console.log, error: console.error }) {
  const args = parseArgs(argv)
  const plan = planSharedBlocker(args)
  const result = await runSharedBlocker(plan, { env, io })
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
