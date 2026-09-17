#!/usr/bin/env node
/**
 * Build the cross-harness decision fixtures (improvement plan workstream 7) from real APEX Requests.
 * Each fixture records the Request as the intake agent sees it (sanitized: requester email masked,
 * assets reduced to ids) and the decision the policy must produce: outcome, class, owner role.
 * Fixtures are committed; tests/playbook.test.mjs replays them through agent/intake.mjs and asserts.
 *
 * Usage: node tests/build-decision-fixtures.mjs   (needs APEX_API_TOKEN for Requests not cached in data/)
 */
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const out = path.join(here, 'fixtures', 'decisions')
fs.mkdirSync(out, { recursive: true })
const cacheDirs = [path.join(process.env.HOME || '', 'DevProjects', 'marketingsupport', 'data')]
const base = (process.env.APEX_API_BASE || 'https://apex.2hourlearning.com/api/v1').replace(/\/+$/, '')

// id, expected outcome, expected class, expected owner role, why
const CASES = [
  ['cmu4imtpn000504jq67erpkfo', 'ready-for-execution', 'staff-add', 'website-agent-operator', 'staff add with title, bio, quote, and APEX headshot asset'],
  ['cmtuva6gu000104l47rmd80ua', 'ready-for-execution', 'staff-add', 'website-agent-operator', 'staff add with bio and APEX headshot asset'],
  ['cmu1t0quo00010agmy5kirag5', 'ready-for-execution', 'staff-update', 'website-agent-operator', 'photo-only update with an APEX asset'],
  ['cmtabaifg000i04jg2mriekiv', 'missing-info', 'staff-add', 'website-agent-operator', 'photo change with a Drive folder link and no APEX asset'],
  ['cmsgak1mu000304ky2v3av9st', 'missing-info', 'staff-bulk', 'website-agent-operator', 'bulk roster with no assets attached'],
  ['cmsulc8b2000004i9i6rskef3', 'missing-info', 'staff-bulk', 'website-agent-operator', 'remove and add with no asset for the added person'],
  ['cmtiv4vmm000104kz0o2lqmgw', 'ready-for-execution', 'staff-remove', 'website-agent-operator', 'remove with name and effective statement'],
  ['cmu2vht58000004l5e0f1fka2', 'ready-for-execution', 'staff-update', 'website-agent-operator', 'text-only title update'],
  ['cmu4g7ozk00000agmwlkwsdsf', 'ready-for-execution', 'link-cta', 'website-agent-operator', 'Book a Call missing with the destination given'],
  ['cmu4g1x6x00000bgmc3hnjxly', 'ready-for-execution', 'link-cta', 'website-agent-operator', 'Book a Call missing with the destination given'],
  ['cmu1j11dc00020agmqvbzl8lj', 'ready-for-execution', 'copy', 'website-agent-operator', 'FAQ copy with full text supplied'],
  ['cmtg740cq000204joxw9p9iz2', 'ready-for-execution', 'program-info', 'website-agent-operator', 'hero and address change (diagnosis then routes to HubSpot)'],
  ['cmt228e8b000104jss8jq1m8d', 'routed', 'platform-request', 'web-platform', 'Vercel launch site, not alpha.school'],
  ['cmu4kvhy500000agm20nunige', 'missing-info', 'staff-update', 'website-agent-operator', 'agent-found card without photo or bio'],
  ['cmu5imdr5000004joh8f6awhm', 'routed', 'observer-health', 'observer-owner', 'event page 522 from the observer'],
  ['cmu1thmi800020agmsg6c02f3', 'routed', 'observer-health', 'observer-owner', 'render timeout from the observer'],
  ['cmu4hqkdg00000agmcjcawem0', 'routed', 'packet', 'packet-owner', 'packet content edits'],
  ['cmtvj746300000agmycqmt896', 'routed', 'packet', 'packet-owner', 'packet link on two campuses'],
  ['cmu4hhqoa00000agmeah4myvc', 'routed', 'sync-mapping', 'n8n-sync-owner', 'two Programs one page decision'],
  ['cmu4bynqy00000agmqenm5kxm', 'routed', 'event-request', 'website-agent-operator', 'event listing request'],
]

const token = process.env.APEX_API_TOKEN
let written = 0
for (const [id, outcome, cls, ownerRole, why] of CASES) {
  let task = null
  for (const dir of cacheDirs) {
    const file = path.join(dir, `ticket-${id}.json`)
    if (fs.existsSync(file)) { const raw = JSON.parse(fs.readFileSync(file, 'utf8')); task = raw.task || raw; break }
  }
  if (!task && token) {
    const res = await fetch(`${base}/tasks/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const raw = await res.json(); task = raw.task || raw }
  }
  if (!task) { console.error(`skip ${id}: not cached and no token`); continue }
  const sanitized = {
    id: task.id, title: task.title, status: task.status, requestType: task.requestType, program: task.program, url: task.url || null,
    requesterEmail: task.requesterEmail ? task.requesterEmail.replace(/^[^@]+/, 'requester') : null,
    description: task.description, customFields: stripIntake(task.customFields || {}), originalSubmission: task.originalSubmission || null,
    requestAssets: (task.requestAssets || []).map((a) => ({ id: a.id, mimeType: a.mimeType || null })),
    createdAt: task.originalCreatedAt || task.createdAt || null, updatedAt: task.updatedAt || null,
  }
  fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify({ expected: { outcome, class: cls, ownerRole, why }, task: sanitized }, null, 2) + '\n')
  written++
}
console.log(`wrote ${written} decision fixtures to tests/fixtures/decisions`)

function stripIntake(cf) { const c = { ...cf }; for (const k of ['intakeHash', 'intakeVersion', 'history', 'contractVersion', 'ownerRole', 'checkId']) delete c[k]; return c }
