#!/usr/bin/env node
/**
 * Read-only duplicate search for APEX website tickets.
 *
 * Offline:
 *   node tests/search-apex-tickets.mjs --file tickets.json --url https://alpha.school/austin/ --text "John Doe"
 *
 * Live:
 *   APEX_API_BASE=https://... APEX_API_TOKEN=... node tests/search-apex-tickets.mjs --url https://alpha.school/austin/ --text "John Doe"
 */
import fs from 'node:fs'

const argv = process.argv.slice(2)
const arg = (name) => {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : null
}

const file = arg('file')
const urlInput = arg('url')
const textInput = arg('text')
const checkInput = arg('check')

if (!urlInput && !textInput && !checkInput) {
  process.stderr.write('Usage: search-apex-tickets.mjs [--file tickets.json] [--url canonical-url] [--text term] [--check requirement-id]\n')
  process.exit(2)
}

function normalizeUrl(value) {
  if (!value) return null
  try {
    const parsed = new URL(value)
    parsed.hash = ''
    parsed.search = ''
    parsed.hostname = parsed.hostname.toLowerCase()
    if (!parsed.pathname.endsWith('/')) parsed.pathname += '/'
    return parsed.toString().toLowerCase()
  } catch {
    process.stderr.write(`Invalid --url: ${value}\n`)
    process.exit(2)
  }
}

const wantedUrl = normalizeUrl(urlInput)
const wantedText = textInput?.trim().toLowerCase() || null
const wantedCheck = checkInput?.trim().toLowerCase() || null

function taskText(task) {
  return JSON.stringify({
    id: task.id,
    title: task.title,
    description: task.description,
    url: task.url,
    status: task.status,
    program: task.program,
    customFields: task.customFields,
    originalSubmission: task.originalSubmission,
  }).toLowerCase()
}

function matches(task) {
  const haystack = taskText(task)
  const directUrl = normalizeUrl(task.url)
  const urlMatch = !wantedUrl || directUrl === wantedUrl || haystack.includes(wantedUrl)
  const textMatch = !wantedText || haystack.includes(wantedText)
  const checkMatch = !wantedCheck || haystack.includes(wantedCheck)
  return urlMatch && textMatch && checkMatch
}

async function liveTasks() {
  const base = process.env.APEX_API_BASE
  const token = process.env.APEX_API_TOKEN
  if (!base || !token) throw new Error('APEX_API_BASE and APEX_API_TOKEN are required without --file')
  const baseUrl = new URL(base)
  const local = ['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname)
  if (baseUrl.protocol !== 'https:' && !local) throw new Error('APEX_API_BASE must use HTTPS outside localhost')
  const allowed = new Set(String(process.env.APEX_ALLOWED_HOSTS || baseUrl.hostname).split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))
  if (!allowed.has(baseUrl.hostname.toLowerCase())) throw new Error('APEX_API_BASE host is not allowlisted')

  const tasks = []
  let cursor = null
  for (let page = 0; page < 50; page += 1) {
    const endpoint = new URL(process.env.APEX_AGENT_TASKS_PATH || '/api/agent/tasks', baseUrl)
    if (endpoint.origin !== baseUrl.origin || !allowed.has(endpoint.hostname.toLowerCase())) throw new Error('APEX task endpoint must remain on the configured origin')
    endpoint.searchParams.set('workflow', 'website-maintenance')
    endpoint.searchParams.set('pageSize', '100')
    for (const status of ['NOT_STARTED', 'IN_PROGRESS', 'MISSING_INFO', 'BLOCKED', 'FOR_REVIEW', 'TESTING', 'APPROVED']) endpoint.searchParams.append('status', status)
    if (cursor) endpoint.searchParams.set('cursor', cursor)
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error' })
    if (!response.ok) throw new Error(`APEX returned HTTP ${response.status}`)
    const payload = await response.json()
    tasks.push(...(payload.items || []))
    cursor = payload.nextCursor || null
    if (!cursor) break
  }
  return tasks
}

try {
  const raw = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : await liveTasks()
  const tasks = Array.isArray(raw) ? raw : raw.tasks || raw.items || raw.data || []
  const rows = tasks.filter(matches).map((task) => ({
    id: task.id,
    status: task.status,
    title: task.title,
    url: task.url || null,
    checkId: task.customFields?.checkId || null,
    updatedAt: task.updatedAt || null,
  }))
  process.stdout.write(`${JSON.stringify({ query: { url: wantedUrl, text: wantedText, check: wantedCheck }, matches: rows.length, items: rows }, null, 2)}\n`)
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`)
  process.exit(1)
}
