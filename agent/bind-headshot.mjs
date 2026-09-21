#!/usr/bin/env node
/**
 * Review-and-bind a staff headshot that arrived as a link (Google Drive file, Google Slides image, Slack file)
 * into an APEX request asset attached to the ticket, so the normal staff recipe can place it through
 * upload_media_from_apex_asset with an execution token. Decision 2026-09-21 (Matt Barge): the operator, not the
 * agent, reviews the file; the binding records exactly which bytes were reviewed and which ticket text named them.
 *
 *   node agent/bind-headshot.mjs --ticket <id> --person "First Last" --file ./photo.jpg \
 *     --source-kind drive-file --source-url https://drive.google.com/file/d/<id>/view --file-id <id> \
 *     --requester-reference "Caitlin: https://drive.google.com/file/d/<id>/view" [--review-note "..."] \
 *     [--presentation-id X --slide-id X --image-object-id X --source-revision-id X] \
 *     [--asset-id <already uploaded>] [--upload-only] [--evidence-dir ./evidence] [--dry-run]
 *
 * Steps: hash the local file; confirm the person is named on the ticket; create a request asset through APEX's
 * public headshot route (owner: the operator email), upload the bytes to the signed storage URL, finalize
 * (APEX recomputes the checksum); then POST /api/agent/tasks/{id}/staff-asset-binding, which attaches the
 * asset to the ticket, appends customFields.webTmHeadshotBindings, logs staff_asset_bound, and refreshes
 * execution readiness. Nothing here writes to WordPress.
 *
 * Env: APEX_API_TOKEN (operator key), APEX_API_BASE (optional), APEX_OPERATOR_EMAIL (defaults to the
 * website-agent-operator in the policy bundle), APEX_ASSET_STORAGE_URL (Supabase origin that serves
 * request-assets; default recorded in spec/adapters.json).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const here = path.dirname(new URL(import.meta.url).pathname)
const bundle = JSON.parse(fs.readFileSync(path.join(here, '..', 'spec', 'policy-bundle.generated.json'), 'utf8'))
const adapters = JSON.parse(fs.readFileSync(path.join(here, '..', 'spec', 'adapters.json'), 'utf8'))
const args = parse(process.argv.slice(2))
const token = process.env.APEX_API_TOKEN
const configured = (process.env.APEX_API_BASE || 'https://apex.2hourlearning.com/api/v1').replace(/\/+$/, '')
const v1Base = /\/api\/v1$/.test(configured) ? configured : `${configured}/api/v1`
const origin = new URL(v1Base).origin
const agentBase = `${origin}/api/agent`
const storageOrigin = (process.env.APEX_ASSET_STORAGE_URL || adapters.adapters?.['apex-request-assets']?.storageOrigin || '').replace(/\/+$/, '')
const people = JSON.parse(fs.readFileSync(path.join(here, '..', 'registry', 'people.json'), 'utf8'))
const operatorEmail = process.env.APEX_OPERATOR_EMAIL || operatorEmailFromRegistry()

const required = ['ticket', 'person', 'file', 'source-kind', 'source-url', 'requester-reference']
const missing = required.filter((k) => !args[k])
if (!token) fail('APEX_API_TOKEN required')
if (missing.length) fail(`missing --${missing.join(', --')}`)
if (!operatorEmail) fail('APEX_OPERATOR_EMAIL required (no website-agent-operator email in the policy bundle)')
if (!storageOrigin) fail('APEX_ASSET_STORAGE_URL required (or spec/adapters.json apexRequestAssets.storageOrigin)')
if (!['drive-file', 'slides-image', 'slack-file', 'url'].includes(args['source-kind'])) fail('--source-kind must be drive-file, slides-image, slack-file, or url')

const bytes = fs.readFileSync(args.file)
const sha256 = createHash('sha256').update(bytes).digest('hex')
const mimeType = sniff(bytes)
if (!mimeType) fail(`${args.file} is not a JPEG, PNG, or WebP image`)
if (bytes.length > 8 * 1024 * 1024) fail(`${args.file} is ${bytes.length} bytes; APEX accepts headshots up to 8 MB`)
const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mimeType]
const slug = args.person.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const filename = args.filename || `${slug}-headshot-reviewed-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.${ext}`

const ticket = await v1(`/tasks/${args.ticket}`)
const haystack = JSON.stringify([ticket.title, ticket.description, ticket.customFields, ticket.originalSubmission]).toLowerCase()
const nameParts = args.person.toLowerCase().split(/\s+/).filter((p) => p.length > 1)
if (!haystack.includes(args.person.toLowerCase()) && !nameParts.every((p) => haystack.includes(p))) {
  fail(`"${args.person}" is not named on ticket ${args.ticket} (${ticket.title}); a binding must map a person the ticket names`)
}
if (!haystack.includes(args['requester-reference'].toLowerCase().slice(0, 40))) {
  console.error(`warning: the first 40 characters of --requester-reference were not found verbatim on the ticket`)
}

const source = {
  kind: args['source-kind'], url: args['source-url'], sizeBytes: bytes.length, mimeType, sha256,
  ...(args['file-id'] ? { fileId: args['file-id'] } : {}),
  ...(args['presentation-id'] ? { presentationId: args['presentation-id'] } : {}),
  ...(args['slide-id'] ? { slideId: args['slide-id'] } : {}),
  ...(args['image-object-id'] ? { imageObjectId: args['image-object-id'] } : {}),
  ...(args['source-revision-id'] ? { sourceRevisionId: args['source-revision-id'] } : {}),
}
const plan = { ticket: args.ticket, ticketTitle: ticket.title, person: args.person, file: path.resolve(args.file), filename, source, operatorEmail, requesterReference: args['requester-reference'], reviewNote: args['review-note'] || null }
if (args['dry-run']) { console.log(JSON.stringify({ dryRun: true, ...plan }, null, 2)); process.exit(0) }

let assetId = args['asset-id'] || null
let asset = null
if (!assetId) {
  const created = await json(`${origin}/api/public/request-assets/headshot`, 'POST', { requesterEmail: operatorEmail, file: { name: filename, type: mimeType, size: bytes.length } })
  assetId = created.assetId
  const put = await fetch(`${storageOrigin}/storage/v1/object/upload/sign/${created.bucket}/${created.path}?token=${encodeURIComponent(created.token)}`, {
    method: 'PUT', headers: { 'Content-Type': mimeType, 'x-upsert': 'false' }, body: bytes,
  })
  if (!put.ok) fail(`storage upload ${put.status}: ${(await put.text()).slice(0, 300)} (asset ${assetId} left PENDING; remove it or retry with --asset-id after fixing)`)
  const finalized = await json(`${origin}/api/public/request-assets/headshot/${assetId}`, 'POST', { requesterEmail: operatorEmail })
  asset = finalized.asset || finalized
  const reported = asset.checksum || asset.sha256
  if (reported && reported !== sha256) fail(`APEX computed checksum ${reported.slice(0, 12)} but the reviewed file is ${sha256.slice(0, 12)}; not binding`)
  if (asset.status && asset.status !== 'VERIFIED') fail(`asset ${assetId} finalized with status ${asset.status}; not binding`)
  console.log(`asset ${assetId} uploaded and verified (${bytes.length} bytes, ${mimeType}, sha256 ${sha256.slice(0, 12)}…)`)
}

let binding = null
if (!args['upload-only']) {
  binding = await json(`${agentBase}/tasks/${args.ticket}/staff-asset-binding`, 'POST', {
    assetId, personName: args.person, source, requesterReference: args['requester-reference'],
    ...(args['review-note'] ? { reviewNote: args['review-note'] } : {}),
  }, { Authorization: `Bearer ${token}` })
  console.log(`bound asset ${assetId} to ${args.ticket} for ${args.person}; readiness ${JSON.stringify(binding.readiness || null)}`)
}

const record = { ...plan, assetId, asset, binding, boundAt: new Date().toISOString() }
const dir = args['evidence-dir'] || '.'
fs.mkdirSync(dir, { recursive: true })
const out = path.join(dir, `binding-${args.ticket}-${slug}.json`)
fs.writeFileSync(out, JSON.stringify(record, null, 2))
console.log(`wrote ${out}`)

async function v1(route) { const data = await json(`${v1Base}${route}`, 'GET', undefined, { Authorization: `Bearer ${token}` }); return data.task || data }
async function json(url, method, body, headers = {}) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60_000) })
  const text = await res.text()
  let data; try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text.slice(0, 300) } }
  if (!res.ok) fail(`${method} ${url.replace(origin, '')} ${res.status}: ${JSON.stringify(data).slice(0, 400)}`)
  return data
}
function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
  return null
}
function operatorEmailFromRegistry() {
  const operatorName = (bundle.roleOwners?.['website-agent-operator'] || [])[0]?.name
  const flat = []
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (v.email || v.role) flat.push(v); Object.values(v).forEach(walk) } }
  walk(people)
  const byRole = flat.find((p) => p.role === 'website-agent-operator' && p.email)
  const byName = flat.find((p) => operatorName && p.name === operatorName && p.email)
  return (byRole || byName)?.email || null
}
function fail(message) { console.error(message); process.exit(1) }
function parse(argv) { const out = {}; for (let i = 0; i < argv.length; i++) { if (!argv[i].startsWith('--')) continue; const key = argv[i].slice(2); const next = argv[i + 1]; out[key] = next === undefined || next.startsWith('--') ? true : (i++, next) } return out }
