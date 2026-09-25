#!/usr/bin/env node
/**
 * Bundle-versus-observer conformance, playbook side (QC loop repair plan 2026-09-25, repair 3).
 *
 * spec/observer-comparators.json must be a verbatim copy of the observer's published comparator list
 * (superbuilders/aeo alpha-site-system/spec/supported-comparators.json): tests/build-checks.mjs refuses a row whose
 * comparator is not in the playbook copy, and the observer fails loop health on a bundle naming a type outside its own
 * list, so the two must not drift. This script refetches the observer's list and reports the drift; with --write it
 * rewrites the playbook copy (comparators, version, asOf) so the next build sees the observer's list.
 *
 * With --checks it also refetches the observer's src/checks.mjs, re-extracts the check names the way
 * tests/build-checks.mjs --observer-source does, and reports names the observer emits that registry/observer-checks.json
 * lacks (and registry names the observer no longer emits, retired and pending names excepted). It never rewrites the
 * registry: a new observer check needs a row or a retirement, which is a playbook decision.
 *
 * Usage: node tests/sync-observer-comparators.mjs [--write] [--checks] [--source <path or url>] [--checks-source <path or url>] [--token <github token>] [--json]
 * Auth: GitHub raw reads of superbuilders/aeo use, in order, --token, GH_TOKEN, GITHUB_TOKEN, then `gh auth token`.
 * Exit 0 when nothing drifts (or --write brought the copy current), 1 on drift or a fetch failure.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { extractObserverCheckNames, observerCheckNames } from './build-checks.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

export const OBSERVER_REPOSITORY = 'superbuilders/aeo'
export const OBSERVER_COMPARATORS_URL = `https://raw.githubusercontent.com/${OBSERVER_REPOSITORY}/main/alpha-site-system/spec/supported-comparators.json`
export const OBSERVER_CHECKS_URL = `https://raw.githubusercontent.com/${OBSERVER_REPOSITORY}/main/alpha-site-system/src/checks.mjs`
export const PLAYBOOK_COMPARATORS = 'spec/observer-comparators.json'
export const PLAYBOOK_CHECKS = 'registry/observer-checks.json'

export function parseArgs(argv) {
  const args = { write: false, checks: false, json: false, source: OBSERVER_COMPARATORS_URL, checksSource: OBSERVER_CHECKS_URL, token: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--write') args.write = true
    else if (arg === '--checks') args.checks = true
    else if (arg === '--json') args.json = true
    else if (arg === '--source') args.source = argv[++i]
    else if (arg === '--checks-source') args.checksSource = argv[++i]
    else if (arg === '--token') args.token = argv[++i]
    else throw new Error(`unknown argument ${arg}`)
  }
  if (!args.source || !args.checksSource) throw new Error('--source and --checks-source need a path or URL')
  return args
}

export function githubToken({ token = null, env = process.env } = {}) {
  if (token) return token
  if (env.GH_TOKEN) return env.GH_TOKEN
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
  } catch {
    return null
  }
}

/** Read a local file or a raw GitHub URL (private repository: bearer token). */
export async function readSource(source, { token = null, fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  if (!/^https?:\/\//.test(source)) return fs.readFileSync(path.resolve(root, source), 'utf8')
  const headers = { Accept: 'application/vnd.github.raw+json' }
  const bearer = githubToken({ token })
  if (bearer && /^https:\/\/(raw\.githubusercontent\.com|api\.github\.com)\//.test(source)) headers.Authorization = `Bearer ${bearer}`
  const res = await fetchImpl(source, { headers, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`${source} answered ${res.status}${res.status === 404 && !bearer ? ' (no GitHub token: pass --token, set GH_TOKEN, or run gh auth login)' : ''}`)
  return res.text()
}

/** Drift between the observer's comparator list and the playbook copy: types only in one, and semantics that differ. */
export function comparatorDrift(observer, playbook) {
  const theirs = Object.fromEntries(Object.entries(observer?.comparators || {}).filter(([k]) => !k.startsWith('$')))
  const ours = Object.fromEntries(Object.entries(playbook?.comparators || {}).filter(([k]) => !k.startsWith('$')))
  const missingHere = Object.keys(theirs).filter((type) => !(type in ours)).sort()
  const extraHere = Object.keys(ours).filter((type) => !(type in theirs)).sort()
  const semanticsDiffer = Object.keys(theirs).filter((type) => type in ours && String(theirs[type]).trim() !== String(ours[type]).trim()).sort()
  const orderDiffers = !missingHere.length && !extraHere.length && JSON.stringify(Object.keys(theirs)) !== JSON.stringify(Object.keys(ours))
  return { ok: !missingHere.length && !extraHere.length && !semanticsDiffer.length && !orderDiffers, observerVersion: observer?.version ?? null, playbookVersion: playbook?.version ?? null, observerCount: Object.keys(theirs).length, playbookCount: Object.keys(ours).length, missingHere, extraHere, semanticsDiffer, orderDiffers }
}

/** The playbook copy rewritten from the observer's list: comparators verbatim, version and asOf from the observer, the $comment kept. */
export function syncedComparators(observer, playbook) {
  const comparators = Object.fromEntries(Object.entries(observer.comparators || {}).filter(([k]) => !k.startsWith('$')))
  return { $comment: playbook.$comment, version: observer.version ?? playbook.version, asOf: observer.version ?? playbook.asOf, comparators }
}

/** Check names the observer source emits versus registry/observer-checks.json (retired and pending names tolerated, as in the builder). */
export function checkDrift(observerSource, registry, rowsSpec) {
  const extracted = extractObserverCheckNames(observerSource)
  const inventory = observerCheckNames(registry)
  const retired = new Set((rowsSpec.retired || []).map((r) => r.observerCheck))
  const pending = new Set(Object.keys(registry.pendingInObserver || {}).filter((n) => !n.startsWith('$')))
  const missingHere = extracted.filter((n) => !inventory.includes(n))
  const notEmitted = inventory.filter((n) => !extracted.includes(n) && !retired.has(n) && !pending.has(n))
  const pendingNowEmitted = [...pending].filter((n) => extracted.includes(n))
  return { ok: !missingHere.length && !notEmitted.length, extracted: extracted.length, inventory: inventory.length, missingHere, notEmitted, pendingNowEmitted }
}

export async function run(args, { fetchImpl = globalThis.fetch, log = console.log } = {}) {
  const report = { comparators: null, checks: null, wrote: false }
  const playbookPath = path.join(root, PLAYBOOK_COMPARATORS)
  const playbook = JSON.parse(fs.readFileSync(playbookPath, 'utf8'))
  const observer = JSON.parse(await readSource(args.source, { token: args.token, fetchImpl }))
  report.comparators = { source: args.source, ...comparatorDrift(observer, playbook) }
  if (!report.comparators.ok && args.write) {
    fs.writeFileSync(playbookPath, JSON.stringify(syncedComparators(observer, playbook), null, 2) + '\n')
    report.wrote = true
    report.comparators.ok = true
  }
  if (args.checks) {
    const registry = JSON.parse(fs.readFileSync(path.join(root, PLAYBOOK_CHECKS), 'utf8'))
    const rowsSpec = JSON.parse(fs.readFileSync(path.join(root, 'spec', 'check-rows.json'), 'utf8'))
    report.checks = { source: args.checksSource, ...checkDrift(await readSource(args.checksSource, { token: args.token, fetchImpl }), registry, rowsSpec) }
  }
  if (args.json) log(JSON.stringify(report, null, 2))
  else log(renderReport(report))
  return report
}

export function renderReport(report) {
  const lines = []
  const c = report.comparators
  if (c) {
    lines.push(`observer comparators: ${c.observerCount} types (version ${c.observerVersion ?? 'unversioned'}) from ${c.source}`)
    lines.push(`playbook copy:        ${c.playbookCount} types (version ${c.playbookVersion ?? 'unversioned'}) in ${PLAYBOOK_COMPARATORS}`)
    if (report.wrote) lines.push(`WROTE ${PLAYBOOK_COMPARATORS} from the observer's list; rebuild with node tests/build-checks.mjs and put the sha in spec/release-manifest.json`)
    else if (c.ok) lines.push('comparators: no drift')
    else {
      if (c.missingHere.length) lines.push(`DRIFT: observer implements types the playbook copy lacks: ${c.missingHere.join(', ')}`)
      if (c.extraHere.length) lines.push(`DRIFT: playbook copy lists types the observer does not implement: ${c.extraHere.join(', ')} (a row using one fails the observer's loop health)`)
      if (c.semanticsDiffer.length) lines.push(`DRIFT: semantics differ for: ${c.semanticsDiffer.join(', ')}`)
      if (c.orderDiffers) lines.push('DRIFT: same types, different order (the copy is verbatim; run --write)')
      lines.push('fix: node tests/sync-observer-comparators.mjs --write, then node tests/build-checks.mjs')
    }
  }
  const k = report.checks
  if (k) {
    lines.push(`observer checks: ${k.extracted} names extracted from ${k.source}; registry lists ${k.inventory}`)
    if (k.ok) lines.push('checks: no drift')
    else {
      if (k.missingHere.length) lines.push(`DRIFT: observer emits checks the registry lacks (each needs a row or a retirement): ${k.missingHere.join(', ')}`)
      if (k.notEmitted.length) lines.push(`DRIFT: registry names the observer no longer emits (retire them or list them under pendingInObserver): ${k.notEmitted.join(', ')}`)
    }
    if (k.pendingNowEmitted.length) lines.push(`note: pendingInObserver names the observer now emits, remove them from the pending list: ${k.pendingNowEmitted.join(', ')}`)
  }
  return lines.join('\n')
}

function isMain() {
  try { return fs.realpathSync(process.argv[1] || '') === fs.realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
}

if (isMain()) {
  try {
    const report = await run(parseArgs(process.argv.slice(2)))
    process.exit(report.comparators.ok && (report.checks?.ok ?? true) ? 0 : 1)
  } catch (error) {
    console.error(`sync-observer-comparators: ${error.message}`)
    process.exit(1)
  }
}
