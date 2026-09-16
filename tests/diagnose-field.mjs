#!/usr/bin/env node
/**
 * Pathway diagnosis (protocol step 1b): turn "the page shows X" into a classified, owner-assigned ticket.
 *
 *   node tests/diagnose-field.mjs --url https://alpha.school/atlanta/ --element intro.status-sentence [--json out.json]
 *   node tests/diagnose-field.mjs --url https://alpha.school/plano/ --css-id tuition
 *
 * Reads spec/campus-page-field-map.json for the element, the rendered page for the current value, the growth map API
 * (public HubSpot mirror) for the campus state and mirrored facts, HubSpot Programs directly when HUBSPOT_SERVICE_KEY or
 * HUBSPOT_PRIVATE_APP_TOKEN has the Programs read scopes, and spec/campus-page-requirements.json for the expected value.
 * Prints the defect class (data | mapping | delivery | presentation | none), the owner, and a ticket payload usable by
 * tests/file-apex-ticket.mjs. Read-only.
 */
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const read = (p) => JSON.parse(fs.readFileSync(path.join(here, '..', p), 'utf8'))
const fieldMap = read('spec/campus-page-field-map.json')
const requirements = read('spec/campus-page-requirements.json')
const lifecycle = read('spec/campus-lifecycle.json')
const sources = read('registry/sources.json')
const responsibilities = read('spec/responsibilities.json')
const people = read('registry/people.json').people

const args = parse(process.argv.slice(2))
if (!args.url || (!args.element && !args['css-id'])) { console.error('Usage: diagnose-field.mjs --url <campus url> (--element <field-map key> | --css-id <id>) [--json out.json]'); process.exit(2) }
const elementKey = args.element || Object.keys(fieldMap.elements).find((k) => String(fieldMap.elements[k].cssId || '').split(/,\s*/).includes(args['css-id']))
const element = fieldMap.elements[elementKey]
if (!element) { console.error(`unknown element; known: ${Object.keys(fieldMap.elements).join(', ')}`); process.exit(2) }

const slug = new URL(args.url).pathname.replace(/^\/+|\/+$/g, '')
const campus = lifecycle.campuses[slug] || {}
const readAt = new Date().toISOString()

// 1. rendered page value
const html = await (await fetch(args.url, { headers: { 'User-Agent': 'alpha-website-playbook-diagnose/0.1' } })).text()
const pageModified = await wpModified(slug)
const cssId = String(element.cssId || '').split(/,\s*/)[0]
const pageValue = cssId ? textOfElement(html, cssId) : null

// 2. source values: growth map mirror, then HubSpot direct when scopes allow
const map = await growthMap(campus.mapId || campus.programId || null, slug)
const state = map?.programType || campus.lifecycle || 'unknown'
const stateSource = map ? 'growth map API (HubSpot mirror)' : 'lifecycle spec'
const hubspot = await hubspotProgram(map?.id)

// 3. expected value by state
const expected = expectedFor(elementKey, state, map, hubspot)

// 4. classify
const writer = element.writer
let defectClass = 'none'
let reason = ''
const sourceValue = hubspot.value ?? null
const sourceKnown = sourceValue !== null
const pageMatchesExpected = expected.pattern ? new RegExp(expected.pattern, 'i').test(pageValue || '') : (expected.value ? norm(pageValue).includes(norm(expected.value)) : null)
if (writer === 'wordpress-direct' || writer === 'template') {
  defectClass = pageMatchesExpected === false ? 'presentation' : 'none'
  reason = pageMatchesExpected === false ? 'WordPress-owned element differs from the requirement' : 'page meets the requirement'
} else if (pageMatchesExpected === false) {
  if (sourceKnown && (expected.pattern ? new RegExp(expected.pattern, 'i').test(sourceValue) : norm(sourceValue).includes(norm(expected.value)))) { defectClass = 'delivery'; reason = 'source already holds the expected value; the page has not received it (run failed, skipped, or not yet due)' }
  else if (sourceKnown) { defectClass = 'data'; reason = `source field ${element.source?.fields?.join(', ') || element.source?.key} contradicts the requirement for state ${state}` }
  else if (pageModified && pageModified.recentRun) { defectClass = 'data'; reason = `page was rewritten by the nightly run at ${pageModified.modified}; the rendered value is the source value after substitution, and it contradicts the requirement for state ${state} (HubSpot not read directly: ${hubspot.note})` }
  else { defectClass = 'data'; reason = `page contradicts the requirement for state ${state}; HubSpot not read directly (${hubspot.note}); confirm the source before filing` }
  if (element.onMismatch?.ifDerivationWrong && elementKey === 'intro.status-sentence') reason += '. Mapping note: the sentence is hand-typed in website_campus_intro and not derived from type; a sync-mapping ticket is the durable prevention.'
} else if (pageMatchesExpected === true) { defectClass = 'none'; reason = 'page meets the requirement' }
else { defectClass = 'unknown'; reason = 'no requirement rule for this element and state yet' }

const classToTicket = { data: element.onMismatch?.ifSourceWrong?.split(' ')[0] || 'hubspot-data', mapping: 'sync-mapping', delivery: element.onMismatch?.ifPageOnly?.split(' ')[0] || 'sync-delivery', presentation: (element.onMismatch?.default || 'copy').split(' ')[0] }
const ticketClass = defectClass in classToTicket ? classToTicket[defectClass] : null
const ownerRole = ticketClass ? (responsibilities.ticketRouting[ticketClass]?.executes || '').split(/[ ;(]/)[0] : null
const owner = ownerRole ? Object.values(people).find((p) => p.roles.some((r) => r.role === ownerRole)) : null

const result = {
  url: args.url, slug, element: elementKey, cssId, writer, state, stateSource,
  page: { value: pageValue, modified: pageModified?.modified || null, rewrittenByNightlyRun: pageModified?.recentRun || false },
  source: { system: element.source?.system || null, fields: element.source?.fields || element.source?.key || null, value: sourceValue, readAt: sourceKnown ? readAt : null, note: hubspot.note },
  expected: expected, derivation: element.derivation,
  defectClass, reason, ticketClass, ownerRole, owner: owner ? { name: owner.name, email: owner.email } : null,
  ticket: ticketClass ? buildTicket() : null,
}
if (args.json) fs.writeFileSync(args.json, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))

function buildTicket() {
  const name = map?.name || slug
  const titles = { 'hubspot-data': `HubSpot data: ${name} ${elementKey} contradicts state ${state}`, 'sync-mapping': `Website mapping: derive ${elementKey} from ${element.source?.context?.[0] || 'the source state'}`, 'sync-delivery': `n8n run: ${name} ${elementKey} not delivered`, }
  const fixPath = { 'hubspot-data': `Change ${element.source?.fields?.join(', ')} for ${name} through the APEX campus Program editor (approver: ${ownerRole}); n8n publishes at 00:15 CT; website agent verifies the page after the run.`, 'sync-mapping': `Change the n8n workflow ORgdHC71YJ5RawBy so ${cssId} is derived per the field map; decision recorded in docs/decisions.md.`, 'sync-delivery': 'n8n-sync-owner runs or repairs the workflow for this page, then the website agent verifies.' }
  return {
    title: titles[ticketClass] || `${ticketClass}: ${name} ${elementKey}`,
    class: ticketClass, assignToRole: ownerRole, assignTo: owner?.email || null,
    description: [
      `Page: ${args.url}`, `Element: ${elementKey} (CSS ID ${cssId}; writer ${writer})`, `Campus state: ${state} (${stateSource})`,
      `Page shows (modified ${pageModified?.modified || 'unknown'}): "${pageValue}"`,
      `Source: ${element.source?.system} ${element.source?.fields?.join(', ') || element.source?.key || ''}${sourceKnown ? ` = "${sourceValue}" (read ${readAt})` : ` (not read directly: ${hubspot.note})`}`,
      `Expected: "${expected.value}" (${expected.rule})`, `Derivation today: ${element.derivation}`,
      `Defect class: ${defectClass}. ${reason}`, `Fix path: ${fixPath[ticketClass] || ''}`,
      `Done when: the public page shows the expected value after the next n8n run, verified by tests/page-check.mjs.`,
      `Playbook: spec/campus-page-field-map.json ${elementKey}; protocols/apex-website-ticket-protocol.md step 1b.`,
    ].join('\n'),
  }
}

function expectedFor(key, state, map, hubspot) {
  const name = (map?.name || slug).replace(/^Alpha School /, 'Alpha ')
  if (key === 'intro.status-sentence') {
    if (state === 'Open') return { value: `${name} is open and enrolling.`, pattern: '^\\s*Alpha [A-Za-z .]+? is open and enrolling\\.', rule: 'spec/campus-page-requirements.json Open campus.intro.status-sentence' }
    if (state === 'Announced') return { value: null, rule: 'Announced: a launch statement naming month or season and year', pattern: '(opens|opening|launching) (in )?(January|February|March|April|May|June|July|August|September|October|November|December|Fall|Spring|Summer|Winter) \\d{4}' }
    return { value: null, rule: `no public sentence rule for state ${state}` }
  }
  if (key === 'hero.title' && map?.gradeRange) { const g = map.gradeRange.replace(/\s+/g, ''); const alt = g.replace(/^PreK/i, 'Pre-K'); return { value: `${map.gradeRange} Private School in ${map.city}, ${map.state}`, pattern: `(${g}|${alt}|Serving ${g.replace('-', ' - ')}(st|nd|rd|th) Grade)`, rule: 'hero grade range equals HubSpot startGrade-endGrade (growth map gradeRange); city and state wording may differ (abbreviations, New York special case)' } }
  if (key === 'contact.tuition' && hubspot.raw?.tuition_usd_yearly) return { value: `$${Number(hubspot.raw.tuition_usd_yearly).toLocaleString('en-US')}`, rule: 'tuition_usd_yearly formatted' }
  const req = requirements.states?.[state]?.[`campus.${key.replace('.', '.')}`]
  return { value: req?.content || null, rule: req ? `requirements ${state} campus.${key}` : `no rule for ${key} in state ${state}` }
}

async function growthMap(id, slug) {
  try {
    const res = await fetch(sources.growthMapApi.url, { signal: AbortSignal.timeout(20_000) })
    const data = await res.json()
    const list = data.locations || data
    return list.find((l) => (id && l.id === id) || (l.url || '').replace(/\/+$/, '').endsWith('/' + slug)) || null
  } catch { return null }
}

async function hubspotProgram(mapId) {
  const token = process.env.HUBSPOT_SERVICE_KEY || process.env.HUBSPOT_PRIVATE_APP_TOKEN
  const id = mapId ? String(mapId).replace(/^program-/, '') : null
  if (!token) return { value: null, note: 'no HubSpot token in env' }
  if (!id) return { value: null, note: 'no Program id (growth map record not found)' }
  const fields = element.source?.fields || []
  try {
    const res = await fetch(`https://api.hubapi.com/crm/v3/objects/2-43470849/${id}?properties=${encodeURIComponent(['type', ...fields].join(','))}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return { value: null, note: `HubSpot ${res.status}: token lacks Programs read scopes (crm.objects.custom.read)` }
    const d = await res.json()
    const raw = d.properties || {}
    const v = fields.length ? raw[fields[0]] : null
    return { value: v ? substitute(v) : null, raw, note: 'read directly' }
  } catch (e) { return { value: null, note: e.message } }
}

function substitute(v) {
  const name = (map?.name || '').replace(/^Alpha School /, 'Alpha ')
  return String(v).replaceAll('[CITY]', map?.city || '').replaceAll('[DISPLAY_REGION]', map?.city || '').replaceAll('[DISPLAY_NAME_WITHOUT_SCHOOL_KEYWORD]', name).replaceAll('[DISPLAY_NAME_WITH_SCHOOL_KEYWORD]', name.replace('Alpha ', 'Alpha School ')).replaceAll('[DISPLAY_NAME]', name)
}

async function wpModified(slug) {
  try {
    const d = await (await fetch(`https://alpha.school/wp-json/wp/v2/pages?slug=${slug}&_fields=modified`)).json()
    const modified = d[0]?.modified || null
    // the nightly run lands at 00:15 CT; a modification between 00:10 and 01:00 CT on any day is treated as the run
    const m = modified ? new Date(modified + 'Z') : null
    const ct = m ? new Date(m.getTime() - 5 * 3600 * 1000) : null
    const recentRun = ct ? (ct.getUTCHours() === 0 && ct.getUTCMinutes() >= 10) : false
    return { modified, recentRun }
  } catch { return null }
}

function textOfElement(html, id) {
  const m = html.match(new RegExp(`id="${id}"[\\s\\S]*?<div class="elementor-widget-container">([\\s\\S]*?)</div>\\s*</div>`))
  const inner = m ? m[1] : (html.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]{0,1200}?)</`)) || [])[1] || ''
  return inner.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim()
}
function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim() }
function parse(argv) { const o = {}; for (let i = 0; i < argv.length; i++) { if (!argv[i].startsWith('--')) continue; const k = argv[i].slice(2); const n = argv[i + 1]; o[k] = n === undefined || n.startsWith('--') ? true : (i++, n) } return o }
