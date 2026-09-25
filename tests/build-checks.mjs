#!/usr/bin/env node
/**
 * Compile the playbook's observer checks into one versioned, hashed check bundle:
 * spec/check-bundle.generated.json (QC loop redesign 2026-09-24, workstream 1). The observer loads the
 * bundle and cites the row id and bundle version on every finding; the filer applies the row's class,
 * owner, dedupe scope, grace period, clear-after runs and evidence profile. A check with no row is
 * telemetry, never a ticket.
 *
 * Sources: spec/check-rows.json (the rows and retirements), registry/observer-checks.json (every name the
 * observer can emit; coverage is enforced), spec/policy-bundle.generated.json (ticket class -> owner role
 * and evidence profile), spec/ticket-classes.json, spec/intake-policy.json, spec/campus-page-field-map.json,
 * spec/campus-lifecycle.json, spec/page-family-requirements.json, spec/observer-check-map.json, spec/site-rules.json,
 * spec/campus-page-requirements.json, spec/source-authority.json, spec/community-routing.json, spec/brand-visual.json,
 * registry/sources.json, registry/sister-brand-exceptions.json, registry/campus-packets.json, registry/campus-open-media.json,
 * registry/campus-identities.json, registry/campus-cta-exceptions.json, registry/campus-leadership.json, registry/campus-pages.json,
 * registry/people.json, spec/responsibilities.json.
 *
 * Usage: node tests/build-checks.mjs [--check] [--observer-source <path to aeo src/checks.mjs>]
 *   --check            exit 1 when the committed bundle is stale (no write)
 *   --observer-source  re-extract the check names from a local aeo checkout and fail when registry/observer-checks.json is stale
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))

export const OUTPUT = 'spec/check-bundle.generated.json'
const LIFECYCLE_STATES = ['Open', 'Announced', 'Pre-Announcement']
const DEDUPE_SCOPES = ['page', 'template', 'program', 'event', 'site']
const SEVERITIES = ['critical', 'high', 'medium', 'low']
const STATUSES = ['enforced', 'advisory']
const CHANNELS = ['ticket', 'source-digest', 'loop-health']
const GROUNDING_KINDS = ['complaint', 'source-contract', 'exemplar', 'decision', 'none']
const DEPTHS = ['render', 'http']
const VIEWPORTS = ['desktop', 'mobile']
// The fix path of a class is every step but its verification step; a source-digest row's class may not fix through WordPress.
const WORDPRESS_ADAPTER = 'wordpress-alpha-mcp'
// Elements a WordPress page owns (a CTA, a link, page copy, an image, the head, the shared templates): never a source-digest row.
const WORDPRESS_PSEUDO_PREFIXES = ['page.', 'head.', 'locations.', 'events.']
const WORDPRESS_PSEUDO_ELEMENTS = ['robots.txt', 'sitemap', 'llms.txt', 'header', 'footer', 'map.embed']
export const PROMOTION_RULE = 'grounding none: measured, never filed, until a complaint, source contract, exemplar or decision grounds the row (promotion rule, docs/observer-requirements.md 2026-09-25)'
const SUPPRESS_CONDITIONS = ['event-ended', 'hidden-on-all-viewports', 'every-image-failed-in-run']
// Page-level pseudo-elements a row may name instead of a field-map key.
const PSEUDO_ELEMENT_PREFIXES = ['page.', 'head.', 'map.', 'event.', 'events.', 'observer.', 'locations.']
const PSEUDO_ELEMENTS = ['robots.txt', 'sitemap', 'llms.txt', 'header', 'footer']

/** Names the observer can emit today, from the captured registry (families flattened). */
export function observerCheckNames(registry = read('registry/observer-checks.json')) {
  return [...new Set(Object.values(registry.families || {}).flat())].sort()
}

/**
 * Re-extract the check names from a checks.mjs source file: every finding(loop, "name", ...) literal, every
 * presentCheck/destinationCheck table entry, every check: "name" table entry, and every `const check = "name"` binding
 * a check function passes to finding() (campus-application-finalsite-redirect). Used by --observer-source.
 */
export function extractObserverCheckNames(source) {
  const names = new Set()
  for (const m of source.matchAll(/finding\(\s*"[a-z-]+",\s*"([a-z0-9-]+)"/g)) names.add(m[1])
  for (const m of source.matchAll(/(?:presentCheck|destinationCheck|check):\s*"([a-z0-9-]+)"/g)) names.add(m[1])
  for (const m of source.matchAll(/\bconst\s+check\s*=\s*"([a-z0-9-]+)"/g)) names.add(m[1])
  return [...names].sort()
}

function resolveKey(object, key) {
  let cursor = object
  for (const part of key.split('/')) {
    if (cursor === null || typeof cursor !== 'object') return undefined
    // Arrays of records (spec/source-authority.json fields[]) are addressed by their id.
    if (Array.isArray(cursor) && !/^\d+$/.test(part)) cursor = cursor.find((item) => item?.id === part)
    else if (part in cursor) cursor = cursor[part]
    else return undefined
  }
  return cursor
}

export function buildBundle({ observerSource = null } = {}) {
  const errors = []
  const rowsSpec = read('spec/check-rows.json')
  const observerRegistry = read('registry/observer-checks.json')
  const policy = read('spec/policy-bundle.generated.json')
  const classesSpec = read('spec/ticket-classes.json')
  const intakeSpec = read('spec/intake-policy.json')
  const fieldMap = read('spec/campus-page-field-map.json')
  const lifecycle = read('spec/campus-lifecycle.json')
  const families = read('spec/page-family-requirements.json')
  const checkMap = read('spec/observer-check-map.json')
  const sources = read('registry/sources.json')
  const people = read('registry/people.json').people
  const responsibilities = read('spec/responsibilities.json')
  const communityRouting = read('spec/community-routing.json')
  const sisterBrand = read('registry/sister-brand-exceptions.json')
  const packets = read('registry/campus-packets.json')
  const ctaExceptions = read('registry/campus-cta-exceptions.json')
  const leadership = read('registry/campus-leadership.json')
  const campusPages = read('registry/campus-pages.json').campuses || {}

  const inventory = observerCheckNames(observerRegistry)
  if (observerSource) {
    const extracted = extractObserverCheckNames(fs.readFileSync(observerSource, 'utf8'))
    const missing = extracted.filter((n) => !inventory.includes(n))
    // A retired check the observer no longer emits stays in the registry (older packets still carry it); it is not stale.
    const retiredHere = new Set((rowsSpec.retired || []).map((r) => r.observerCheck))
    const extra = inventory.filter((n) => !extracted.includes(n) && !retiredHere.has(n))
    if (missing.length || extra.length) errors.push(`registry/observer-checks.json is stale against ${observerSource}: missing=${missing.join(',') || 'none'} extra=${extra.join(',') || 'none'}`)
  }

  const familyIds = new Set(families.families.map((f) => f.id))
  const pageFamilies = {}
  for (const id of familyIds) pageFamilies[id] = [id]
  for (const [id, value] of Object.entries(rowsSpec.pageFamilies || {})) {
    if (id.startsWith('$')) continue
    if (Array.isArray(value)) for (const member of value) if (!familyIds.has(member)) errors.push(`pageFamilies.${id} names unknown page family ${member}`)
    pageFamilies[id] = value
  }

  // Depth defaults (1.2): every family named is a real family or a pseudo-family, each family has exactly one default.
  const depthDefaults = { render: [], http: [] }
  for (const depth of DEPTHS) {
    for (const family of rowsSpec.depthDefaults?.[depth] || []) {
      if (!pageFamilies[family]) errors.push(`depthDefaults.${depth} names unknown page family ${family}`)
      if (depthDefaults[depth === 'render' ? 'http' : 'render'].includes(family)) errors.push(`depthDefaults: ${family} is both render and http`)
      depthDefaults[depth].push(family)
    }
  }
  for (const family of Object.keys(pageFamilies)) if (!depthDefaults.render.includes(family) && !depthDefaults.http.includes(family)) errors.push(`depthDefaults: page family ${family} has no depth (render or http)`)
  const depthFor = (family) => (depthDefaults.render.includes(family) ? 'render' : 'http')

  const sourceDigest = { ownerRoles: rowsSpec.sourceDigest?.ownerRoles || [], reportFile: rowsSpec.sourceDigest?.reportFile || 'source-digest.md' }
  if (!sourceDigest.ownerRoles.length) errors.push('sourceDigest.ownerRoles missing')

  const sourceHealth = {}
  for (const [id, value] of Object.entries(rowsSpec.sourceHealth || {})) {
    if (id.startsWith('$')) continue
    if (value.registryKey && !sources[value.registryKey]) errors.push(`sourceHealth.${id}: registry/sources.json has no ${value.registryKey}`)
    sourceHealth[id] = value
  }

  const lifecycleStates = Object.keys(lifecycle.states || {})
  for (const state of LIFECYCLE_STATES) if (!lifecycleStates.includes(state)) errors.push(`spec/campus-lifecycle.json lacks state ${state}`)

  const roles = new Set([
    ...Object.keys(responsibilities.roles || {}),
    ...Object.values(people).flatMap((p) => (p.roles || []).map((r) => r.role)),
    ...Object.values(intakeSpec.classes || {}).map((c) => c.ownerRole),
  ])
  const fieldElements = new Set(Object.keys(fieldMap.elements || {}))

  // Corrections the sweep proved must exist as data before rows may cite them (workstream 2).
  if (!communityRouting.communityHosts?.canonical) errors.push('spec/community-routing.json communityHosts.canonical missing')
  if (!communityRouting.urlContract?.urlForm?.decisionTicket) errors.push('spec/community-routing.json urlContract.urlForm.decisionTicket missing')
  if (!Array.isArray(sisterBrand.brands) || !sisterBrand.brands.length) errors.push('registry/sister-brand-exceptions.json brands[] missing')
  if (!packets.interimPolicy?.hidden2026_27Button) errors.push('registry/campus-packets.json interimPolicy.hidden2026_27Button missing')
  if (!sources.operationsSheet?.observerPacketArtifact?.command) errors.push('registry/sources.json operationsSheet.observerPacketArtifact.command missing')
  // CTA exceptions and shared leadership (2026-09-24): the rows cite them through exemptionsRef, so their shape is checked here too.
  for (const cta of ['book-a-call', 'calendar', 'packet', 'apply', 'community']) if (!ctaExceptions.ctas?.[cta]?.rows?.length) errors.push(`registry/campus-cta-exceptions.json ctas.${cta}.rows missing`)
  for (const rule of ['hidden', 'present', 'destination']) if (!ctaExceptions.rules?.[rule]?.exemptsRowSuffixes?.length) errors.push(`registry/campus-cta-exceptions.json rules.${rule} missing`)
  for (const [slug, entries] of Object.entries(ctaExceptions.campuses || {})) {
    if (!campusPages[slug]) errors.push(`registry/campus-cta-exceptions.json campuses.${slug}: not a registry/campus-pages.json slug`)
    for (const [cta, entry] of Object.entries(entries || {})) {
      if (!ctaExceptions.ctas?.[cta]) errors.push(`registry/campus-cta-exceptions.json campuses.${slug}.${cta}: unknown CTA`)
      if (!ctaExceptions.rules?.[entry?.rule]) errors.push(`registry/campus-cta-exceptions.json campuses.${slug}.${cta}: unknown rule ${entry?.rule}`)
      if (entry?.rule === 'destination' && !entry.destination) errors.push(`registry/campus-cta-exceptions.json campuses.${slug}.${cta}: rule destination needs a destination`)
      if (entry?.expires !== null && !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(String(entry?.expires)) && entry?.expires !== 'lifecycle:Open') errors.push(`registry/campus-cta-exceptions.json campuses.${slug}.${cta}: expires must be an ISO date, lifecycle:Open or null`)
    }
  }
  for (const [id, group] of Object.entries(leadership.groups || {})) {
    if (id.startsWith('$')) continue
    for (const slug of group.campuses || []) if (!campusPages[slug]) errors.push(`registry/campus-leadership.json groups.${id}: ${slug} is not a registry/campus-pages.json slug`)
    if (!(group.campuses || []).length || !(group.sharedLeadership || []).length) errors.push(`registry/campus-leadership.json groups.${id}: campuses and sharedLeadership must be non-empty`)
    for (const person of group.sharedLeadership || []) if (!person?.name || !person?.source) errors.push(`registry/campus-leadership.json groups.${id}: every shared leader needs name and source`)
  }
  // Dedupe aliases (spec/observer-check-map.json 0.6) name observer checks that exist, and every pattern compiles.
  for (const [check, alias] of Object.entries(checkMap.dedupeAliases || {})) {
    if (check.startsWith('$')) continue
    if (!inventory.includes(check)) errors.push(`spec/observer-check-map.json dedupeAliases.${check}: not an observer check`)
    if (!Array.isArray(alias?.checkIds) || !Array.isArray(alias?.titlePatterns)) errors.push(`spec/observer-check-map.json dedupeAliases.${check}: checkIds and titlePatterns must be arrays`)
    for (const pattern of alias?.titlePatterns || []) {
      if (typeof pattern !== 'string' || !pattern || pattern.length > 120) { errors.push(`spec/observer-check-map.json dedupeAliases.${check}: a title pattern must be a string of at most 120 characters`); continue }
      try { new RegExp(pattern, 'i') } catch (error) { errors.push(`spec/observer-check-map.json dedupeAliases.${check}: bad pattern ${pattern} (${error.message})`) }
    }
  }

  const defaults = rowsSpec.defaults || {}
  const rows = []
  const seenIds = new Set()
  for (const source of rowsSpec.rows || []) {
    const label = `row ${source.id || '<no id>'}`
    const row = {
      id: source.id,
      observerCheck: source.observerCheck,
      title: source.title,
      pageFamily: source.pageFamily ?? defaults.pageFamily,
      depth: source.depth ?? depthFor(source.pageFamily ?? defaults.pageFamily),
      lifecycleStates: source.lifecycleStates ?? defaults.lifecycleStates ?? [],
      element: source.element,
      ...(source.viewports ? { viewports: source.viewports } : {}),
      ...(source.when ? { when: source.when } : {}),
      expected: source.expected,
      comparator: source.comparator,
      severity: source.severity ?? defaults.severity,
      status: source.status ?? defaults.status,
      channel: source.channel ?? defaults.channel,
      ticketClass: source.ticketClass,
      ownerRole: source.ownerRole ?? policy.classes?.[source.ticketClass]?.intake?.ownerRole ?? null,
      dedupeScope: source.dedupeScope ?? defaults.dedupeScope,
      clearAfterRuns: source.clearAfterRuns ?? defaults.clearAfterRuns ?? 2,
      gracePeriodHours: source.gracePeriodHours ?? defaults.gracePeriodHours ?? 0,
      requireConsecutiveRuns: source.requireConsecutiveRuns ?? defaults.requireConsecutiveRuns ?? 1,
      evidenceProfile: [...new Set([...(policy.classes?.[source.ticketClass]?.evidenceProfile || []), ...(source.evidenceExtra || defaults.evidenceExtra || [])])],
      sourceHealthDependency: source.sourceHealthDependency ?? defaults.sourceHealthDependency ?? [],
      ...(source.suppressWhen ? { suppressWhen: source.suppressWhen } : {}),
      ...(source.suppresses ? { suppresses: source.suppresses } : {}),
      ...(source.exemptionsRef ? { exemptionsRef: source.exemptionsRef } : {}),
      ...(source.exemptions ? { exemptions: source.exemptions } : {}),
      ...(source.decisionPending ? { decisionPending: source.decisionPending } : {}),
      ...(source.note ? { note: source.note } : {}),
      grounding: source.grounding,
      requirementRef: source.requirementRef,
      requirement: checkMap.checks?.[source.observerCheck]?.requirement ?? null,
    }
    // Promotion rule (2026-09-25): an enforced row nobody has grounded is advisory until someone does.
    if (row.status === 'enforced' && row.grounding?.kind === 'none') {
      row.status = 'advisory'
      row.advisoryReason = PROMOTION_RULE
    }

    if (!row.id || !/^(site|campus)\.[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(row.id)) errors.push(`${label}: id must be dotted (site.* or campus.*)`)
    if (seenIds.has(row.id)) errors.push(`${label}: duplicate id`)
    seenIds.add(row.id)
    if (!inventory.includes(row.observerCheck)) errors.push(`${label}: observerCheck ${row.observerCheck} is not in registry/observer-checks.json`)
    if (!row.title) errors.push(`${label}: title missing`)
    if (!pageFamilies[row.pageFamily]) errors.push(`${label}: unknown pageFamily ${row.pageFamily}`)
    for (const state of row.lifecycleStates) if (!LIFECYCLE_STATES.includes(state)) errors.push(`${label}: unknown lifecycle state ${state}`)
    if (!row.element) errors.push(`${label}: element missing`)
    else if (!fieldElements.has(row.element) && !PSEUDO_ELEMENTS.includes(row.element) && !PSEUDO_ELEMENT_PREFIXES.some((p) => row.element.startsWith(p))) errors.push(`${label}: element ${row.element} is neither a field-map key nor a page-level pseudo-element`)
    for (const v of row.viewports || []) if (!VIEWPORTS.includes(v)) errors.push(`${label}: unknown viewport ${v}`)
    if (!row.expected || typeof row.expected !== 'object') errors.push(`${label}: expected missing`)
    else {
      const hasLiteral = 'literal' in row.expected
      const hasDerive = 'derive' in row.expected
      if (hasLiteral === hasDerive) errors.push(`${label}: expected must be exactly one of literal or derive`)
      if (hasDerive) {
        const d = row.expected.derive
        for (const k of ['source', 'field', 'transform']) if (d?.[k] === undefined || d?.[k] === '') errors.push(`${label}: expected.derive.${k} missing`)
        if (d?.source && d.source !== 'registry' && !sourceHealth[d.source]) errors.push(`${label}: expected.derive.source ${d.source} is not a sourceHealth id or 'registry'`)
        if (d?.source && d.source !== 'registry' && d.source !== 'browser' && row.channel !== 'loop-health' && !row.sourceHealthDependency.includes(d.source)) errors.push(`${label}: derives from ${d.source} but sourceHealthDependency does not include it`)
      }
    }
    if (!row.comparator?.type || typeof row.comparator.threshold !== 'number' || !row.comparator.unit) errors.push(`${label}: comparator needs type, numeric threshold, unit`)
    if (!SEVERITIES.includes(row.severity)) errors.push(`${label}: unknown severity ${row.severity}`)
    if (!STATUSES.includes(row.status)) errors.push(`${label}: unknown status ${row.status}`)
    if (!CHANNELS.includes(row.channel)) errors.push(`${label}: unknown channel ${row.channel}`)
    if (!classesSpec.classes?.[row.ticketClass]) errors.push(`${label}: unknown ticketClass ${row.ticketClass}`)
    if (!row.ownerRole) errors.push(`${label}: ownerRole unresolved (no intake owner for ${row.ticketClass})`)
    else if (!roles.has(row.ownerRole)) errors.push(`${label}: ownerRole ${row.ownerRole} is not a registered role`)
    if (!DEDUPE_SCOPES.includes(row.dedupeScope)) errors.push(`${label}: unknown dedupeScope ${row.dedupeScope}`)
    for (const [k, min] of [['clearAfterRuns', 1], ['gracePeriodHours', 0], ['requireConsecutiveRuns', 1]]) if (typeof row[k] !== 'number' || row[k] < min) errors.push(`${label}: ${k} must be a number >= ${min}`)
    if (!row.evidenceProfile.length) errors.push(`${label}: evidenceProfile empty`)
    for (const dep of row.sourceHealthDependency) if (!sourceHealth[dep]) errors.push(`${label}: sourceHealthDependency ${dep} is not a sourceHealth id`)
    for (const c of row.suppressWhen || []) if (!SUPPRESS_CONDITIONS.includes(c)) errors.push(`${label}: unknown suppressWhen ${c}`)
    if (row.channel === 'loop-health') {
      if (row.ticketClass !== 'observer-health') errors.push(`${label}: loop-health rows use ticketClass observer-health`)
      if (!row.suppresses) errors.push(`${label}: loop-health rows must say what they suppress`)
    }
    // Source digest (1.2): a source-versus-source comparison, owned by a source role, never a WordPress element or a WordPress fix path.
    if (row.channel === 'source-digest') {
      const wordpressElement = row.element && (fieldElements.has(row.element) || WORDPRESS_PSEUDO_ELEMENTS.includes(row.element) || WORDPRESS_PSEUDO_PREFIXES.some((p) => row.element.startsWith(p)))
      if (wordpressElement) errors.push(`${label}: a source-digest row cannot carry the WordPress element ${row.element}; rows about a page element stay channel ticket`)
      const fixAdapters = (policy.classes?.[row.ticketClass]?.steps || []).filter((s) => s.id !== 'verify').map((s) => s.adapter)
      if (fixAdapters.includes(WORDPRESS_ADAPTER)) errors.push(`${label}: a source-digest row cannot use ticketClass ${row.ticketClass}, whose fix path runs through ${WORDPRESS_ADAPTER}`)
      if (row.ownerRole && !sourceDigest.ownerRoles.includes(row.ownerRole)) errors.push(`${label}: source-digest ownerRole ${row.ownerRole} is not one of ${sourceDigest.ownerRoles.join(', ')}`)
    }
    if (row.pageFamily === 'map-source' && row.channel === 'ticket') errors.push(`${label}: a map-source row compares sources, not a page; its channel is source-digest or loop-health`)
    // Grounding (1.2): every row says what grounds it; none is allowed and makes the row advisory.
    if (!row.grounding || typeof row.grounding !== 'object') errors.push(`${label}: grounding {kind, ref} missing`)
    else {
      if (!GROUNDING_KINDS.includes(row.grounding.kind)) errors.push(`${label}: unknown grounding kind ${row.grounding.kind}`)
      if (typeof row.grounding.ref !== 'string' || !row.grounding.ref.trim()) errors.push(`${label}: grounding.ref must say where the grounding lives (or why there is none)`)
      else {
        const cited = row.grounding.ref.match(/\b(?:spec|registry|docs|playbook)\/[A-Za-z0-9_.\/-]+/g) || []
        for (const file of cited) if (!fs.existsSync(path.join(root, file))) errors.push(`${label}: grounding.ref cites a missing file ${file}`)
        if (row.grounding.kind !== 'none' && !cited.length && !/^https?:\/\//.test(row.grounding.ref) && !/\b(APEX|ticket|c[a-z0-9]{20,30}|incident|20[0-9]{2}-[0-9]{2}-[0-9]{2})\b/.test(row.grounding.ref)) errors.push(`${label}: grounding.ref for kind ${row.grounding.kind} names no file, URL, ticket, incident or date`)
      }
    }
    // Depth (1.2): a rendered measurement is never taken over plain HTTP.
    if (!DEPTHS.includes(row.depth)) errors.push(`${label}: depth must be render or http, got ${row.depth}`)
    else if (row.depth === 'http' && ((row.viewports || []).length || row.sourceHealthDependency.includes('browser') || /-rendered$/.test(row.comparator?.type || '') || String(row.element).startsWith('observer.browser'))) errors.push(`${label}: a row with viewports, a browser dependency or a rendered comparator must be depth render`)
    for (const ref of [].concat(row.exemptionsRef || [])) {
      if (typeof ref !== 'string' || !ref) errors.push(`${label}: exemptionsRef entries must be non-empty strings`)
      else if (!fs.existsSync(path.join(root, ref.split(' ')[0]))) errors.push(`${label}: exemptionsRef file missing ${ref}`)
      else if (ref.split(' ')[1] && resolveKey(read(ref.split(' ')[0]), ref.split(' ')[1]) === undefined) errors.push(`${label}: exemptionsRef key ${ref.split(' ')[1]} not found in ${ref.split(' ')[0]}`)
    }
    if (row.decisionPending && !/^c[a-z0-9]{20,30}$/.test(row.decisionPending)) errors.push(`${label}: decisionPending is not an APEX id`)
    if (!row.requirementRef?.file || !row.requirementRef?.key) errors.push(`${label}: requirementRef needs file and key`)
    else if (!fs.existsSync(path.join(root, row.requirementRef.file))) errors.push(`${label}: requirementRef file missing ${row.requirementRef.file}`)
    else if (resolveKey(read(row.requirementRef.file), row.requirementRef.key) === undefined) errors.push(`${label}: requirementRef key ${row.requirementRef.key} not found in ${row.requirementRef.file}`)
    if (!row.requirement) errors.push(`${label}: spec/observer-check-map.json has no entry for ${row.observerCheck}`)
    rows.push(row)
  }

  const retired = []
  const retiredNames = new Set()
  for (const entry of rowsSpec.retired || []) {
    const label = `retired ${entry.observerCheck || '<no check>'}`
    if (!inventory.includes(entry.observerCheck)) errors.push(`${label}: not in registry/observer-checks.json`)
    if (retiredNames.has(entry.observerCheck)) errors.push(`${label}: listed twice`)
    retiredNames.add(entry.observerCheck)
    for (const k of ['reason', 'decidedBy', 'date']) if (!entry[k]) errors.push(`${label}: ${k} missing`)
    if (!('replacedBy' in entry)) errors.push(`${label}: replacedBy missing (use null)`)
    else if (entry.replacedBy !== null && !seenIds.has(entry.replacedBy)) errors.push(`${label}: replacedBy ${entry.replacedBy} is not a row id`)
    if (rows.some((r) => r.observerCheck === entry.observerCheck)) errors.push(`${label}: also has a row; a check is a row or retired, not both`)
    retired.push({ observerCheck: entry.observerCheck, reason: entry.reason, replacedBy: entry.replacedBy ?? null, decidedBy: entry.decidedBy, date: entry.date })
  }

  // Coverage: every observer check name is a row or retired (plan workstream 1 acceptance).
  const covered = new Set([...rows.map((r) => r.observerCheck), ...retiredNames])
  for (const name of inventory) if (!covered.has(name)) errors.push(`observer check ${name} has neither a row nor a retirement`)

  const bundle = {
    $comment: 'Generated by tests/build-checks.mjs from spec/check-rows.json and the playbook specs and registries; do not edit by hand. Consumers: the production observer (superbuilders/aeo alpha-site-system), agent/file-observer-findings.mjs, tests/check-release.mjs. Schema: spec/schemas/check-bundle.schema.json.',
    version: rowsSpec.version,
    builtAt: new Date().toISOString(),
    playbookCommit: gitCommit(),
    policySha256: policy.policySha256,
    observerInventory: { version: observerRegistry.version, commit: observerRegistry.capturedFrom?.commit ?? null, count: inventory.length },
    pageFamilies,
    depthDefaults,
    sourceDigest,
    sourceHealth,
    rows,
    retired,
  }
  bundle.rowsSha256 = sha256(JSON.stringify(rows))
  const { builtAt, playbookCommit, ...stable } = bundle
  bundle.sha256 = sha256(JSON.stringify(stable))
  return { bundle, errors }
}

function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex') }
function gitCommit() { try { return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim() } catch { return null } }

function isMain() {
  // os.tmpdir() on macOS is a symlink (/var -> /private/var); compare real paths so the CLI also runs from a scratch copy.
  try { return fs.realpathSync(process.argv[1] || '') === fs.realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
}

if (isMain()) {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  const sourceIndex = args.indexOf('--observer-source')
  const observerSource = sourceIndex >= 0 ? args[sourceIndex + 1] : null
  const { bundle, errors } = buildBundle({ observerSource })
  if (errors.length) {
    for (const e of errors) console.error(`check bundle: ${e}`)
    process.exit(1)
  }
  const out = path.join(root, OUTPUT)
  const existing = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null
  if (check) {
    if (!existing || existing.sha256 !== bundle.sha256) { console.error('check bundle is stale; run node tests/build-checks.mjs'); process.exit(1) }
    console.log(`check bundle current (${bundle.sha256.slice(0, 12)}, ${bundle.rows.length} rows, ${bundle.retired.length} retired, ${bundle.observerInventory.count} observer checks)`)
    process.exit(0)
  }
  if (existing && existing.sha256 === bundle.sha256) { bundle.builtAt = existing.builtAt; bundle.playbookCommit = existing.playbookCommit }
  fs.writeFileSync(out, JSON.stringify(bundle, null, 2) + '\n')
  console.log(`wrote ${OUTPUT}: ${bundle.rows.length} rows, ${bundle.retired.length} retired, ${bundle.observerInventory.count} observer checks covered, sha256 ${bundle.sha256.slice(0, 12)}`)
}
