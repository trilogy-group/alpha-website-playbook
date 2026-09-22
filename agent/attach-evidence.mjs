#!/usr/bin/env node
/**
 * Attach the ring 2 desktop and mobile screenshots to the APEX ticket so the reviewer sees the rendered page
 * inside APEX (the ticket panel's Evidence section) instead of following a link into the run folder.
 *
 *   node agent/attach-evidence.mjs --ticket <id> --run <runId> --page <canonical url> \
 *     --desktop ./evidence/austin-desktop.png --mobile ./evidence/austin-mobile.png [--label "..."] \
 *     [--captured-at <ISO datetime, default: each file's mtime>] [--dry-run]
 *
 * The two files are the `tests/rendered-controls.mjs --screenshots <dir>` output (`<slug>-desktop.png`,
 * `<slug>-mobile.png`, full page at 1440x1000 and 390x844). Each is hashed and posted as multipart form data to
 * POST /api/agent/tasks/{id}/evidence/screenshots with the operator key; APEX verifies the hash, stores the
 * bytes as an EVIDENCE_SCREENSHOT request asset on the ticket, posts the agent comment, and logs
 * agent_evidence_added. The call is idempotent on (ticket, viewport, sha256): a rerun answers 200 with the
 * existing record. Nothing else is sent, and nothing here writes to WordPress.
 *
 * Env: APEX_API_TOKEN (operator key), APEX_API_BASE (optional; derived the way agent/intake.mjs derives it),
 * APEX_AGENT_API_BASE (optional override of the /api/agent origin).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const MAX_BYTES = 6 * 1024 * 1024
export const VIEWPORTS = ['desktop', 'mobile']

export class AttachEvidenceError extends Error {
  /** @param {'MISSING_ARG'|'MISSING_TOKEN'|'BAD_PAGE_URL'|'MISSING_FILE'|'NOT_IMAGE'|'TOO_LARGE'|'APEX_ERROR'|'NETWORK'} code */
  constructor(code, message, extra = {}) { super(message); this.name = 'AttachEvidenceError'; this.code = code; Object.assign(this, extra) }
}

export function apexBases(env = process.env) {
  const configured = (env.APEX_API_BASE || 'https://apex.2hourlearning.com/api/v1').replace(/\/+$/, '')
  const v1Base = /\/api\/v1$/.test(configured) ? configured : `${configured}/api/v1`
  const agentBase = (env.APEX_AGENT_API_BASE || new URL('/api/agent', `${v1Base}/`).toString()).replace(/\/+$/, '')
  return { v1Base, agentBase, origin: new URL(v1Base).origin }
}

export function sniffImage(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png'
  return null
}

/** Read and check one screenshot; the returned record carries everything the route needs and nothing more. */
export function readScreenshot(viewport, file, capturedAtOverride = null) {
  if (!file) throw new AttachEvidenceError('MISSING_ARG', `--${viewport} <png> is required`)
  const resolved = path.resolve(file)
  let bytes
  try { bytes = fs.readFileSync(resolved) } catch (error) {
    throw new AttachEvidenceError('MISSING_FILE', `${viewport} screenshot ${resolved} cannot be read: ${error.code || error.message}`, { file: resolved })
  }
  const mimeType = sniffImage(bytes)
  if (!mimeType) throw new AttachEvidenceError('NOT_IMAGE', `${viewport} screenshot ${resolved} is not a PNG or JPEG (bytes checked, not the extension)`, { file: resolved })
  if (bytes.length > MAX_BYTES) throw new AttachEvidenceError('TOO_LARGE', `${viewport} screenshot ${resolved} is ${bytes.length} bytes; the route accepts up to ${MAX_BYTES} (6 MB)`, { file: resolved, bytes: bytes.length })
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const capturedAt = capturedAtOverride || fs.statSync(resolved).mtime.toISOString()
  return { viewport, file: resolved, bytes, mimeType, sha256, sizeBytes: bytes.length, capturedAt }
}

/** Validate the arguments and hash both files; throws typed errors, writes nothing. */
export function planEvidence(args) {
  for (const key of ['ticket', 'run', 'page']) if (!args[key] || args[key] === true) throw new AttachEvidenceError('MISSING_ARG', `--${key} is required`)
  let page
  try { page = new URL(args.page) } catch { throw new AttachEvidenceError('BAD_PAGE_URL', `--page must be the https canonical URL of the public page, got ${args.page}`) }
  if (page.protocol !== 'https:') throw new AttachEvidenceError('BAD_PAGE_URL', `--page must be https, got ${args.page}`)
  if (page.search) throw new AttachEvidenceError('BAD_PAGE_URL', `--page must be the query-free canonical URL, got ${args.page}`)
  const label = args.label && args.label !== true ? String(args.label).trim().slice(0, 200) : null
  let capturedAt = null
  if (args['captured-at'] && args['captured-at'] !== true) {
    const parsed = new Date(args['captured-at'])
    if (Number.isNaN(parsed.getTime())) throw new AttachEvidenceError('MISSING_ARG', `--captured-at must be an ISO datetime, got ${args['captured-at']}`)
    capturedAt = parsed.toISOString()
  }
  const screenshots = VIEWPORTS.map((viewport) => readScreenshot(viewport, args[viewport], capturedAt))
  return { ticket: String(args.ticket), run: String(args.run), page: page.toString(), label, screenshots }
}

function multipart(plan, shot) {
  const form = new FormData()
  form.append('file', new Blob([shot.bytes], { type: shot.mimeType }), path.basename(shot.file))
  form.append('viewport', shot.viewport)
  form.append('pageUrl', plan.page)
  form.append('agentRunId', plan.run)
  form.append('capturedAt', shot.capturedAt)
  form.append('sha256', shot.sha256)
  if (plan.label) form.append('label', plan.label)
  return form
}

/** Post each screenshot; stops at the first failure so a 4xx on desktop never leaves mobile half-attached silently. */
export async function attachEvidence(plan, { token, agentBase, fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  if (!token) throw new AttachEvidenceError('MISSING_TOKEN', 'APEX_API_TOKEN required (the website operator key)')
  if (!agentBase) throw new AttachEvidenceError('MISSING_ARG', 'agentBase required')
  const url = `${agentBase}/tasks/${encodeURIComponent(plan.ticket)}/evidence/screenshots`
  const results = []
  for (const shot of plan.screenshots) {
    let response
    try {
      response = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: multipart(plan, shot), signal: AbortSignal.timeout(120_000) })
    } catch (error) {
      throw new AttachEvidenceError('NETWORK', `POST ${shot.viewport} screenshot failed before APEX answered: ${error.message}`, { viewport: shot.viewport, results })
    }
    const text = await response.text()
    let body; try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text.slice(0, 600) } }
    if (!response.ok) {
      throw new AttachEvidenceError('APEX_ERROR', `APEX ${response.status} on the ${shot.viewport} screenshot: ${JSON.stringify(body).slice(0, 600)}`, { status: response.status, body, viewport: shot.viewport, results })
    }
    if (body.asset?.sha256 && body.asset.sha256 !== shot.sha256) {
      throw new AttachEvidenceError('APEX_ERROR', `APEX stored sha256 ${String(body.asset.sha256).slice(0, 12)} for the ${shot.viewport} screenshot but the file is ${shot.sha256.slice(0, 12)}`, { status: response.status, body, viewport: shot.viewport, results })
    }
    const result = { viewport: shot.viewport, file: shot.file, sha256: shot.sha256, sizeBytes: shot.sizeBytes, status: response.status, existing: Boolean(body.existing),
      screenshotUrl: body.screenshotUrl || body.asset?.url || null, assetId: body.asset?.id || null, claimPath: body.claimPath || null, commentId: body.commentId || null, activityId: body.activityId || null }
    results.push(result)
    log(`${shot.viewport}: ${result.existing ? 'already attached' : 'attached'} ${result.screenshotUrl || '(no url returned)'} (sha256 ${shot.sha256.slice(0, 12)}…, ${result.claimPath || 'unknown'} path)`)
  }
  return results
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

export async function main(argv = process.argv.slice(2), env = process.env, io = { log: console.log, error: console.error }) {
  const args = parseArgs(argv)
  const plan = planEvidence(args)
  const shown = { ticket: plan.ticket, run: plan.run, page: plan.page, label: plan.label, screenshots: plan.screenshots.map(({ bytes, ...rest }) => rest) }
  if (args['dry-run']) { io.log(JSON.stringify({ dryRun: true, ...shown }, null, 2)); return { dryRun: true, plan: shown } }
  const { agentBase } = apexBases(env)
  const results = await attachEvidence(plan, { token: env.APEX_API_TOKEN, agentBase, log: io.log })
  for (const result of results) io.log(`${result.viewport} ${result.screenshotUrl}`)
  return { dryRun: false, plan: shown, results }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch((error) => {
    if (error instanceof AttachEvidenceError) {
      console.error(`${error.code}: ${error.message}`)
      if (error.results?.length) console.error(`attached before the failure: ${error.results.map((r) => `${r.viewport} ${r.screenshotUrl}`).join(', ')}`)
      process.exit(error.code === 'APEX_ERROR' || error.code === 'NETWORK' ? 2 : 1)
    }
    console.error(error.stack || error.message)
    process.exit(3)
  })
}
