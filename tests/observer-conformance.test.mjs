import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { extractObserverCheckNames, observerCheckNames } from './build-checks.mjs'
import { OBSERVER_CHECKS_URL, OBSERVER_COMPARATORS_URL, checkDrift, comparatorDrift, parseArgs, renderReport, syncedComparators } from './sync-observer-comparators.mjs'

/**
 * Bundle-versus-observer conformance, playbook side (QC loop repair plan 2026-09-25, repair 3). The observer publishes
 * the comparator types it implements (aeo alpha-site-system/spec/supported-comparators.json) and the check ids it
 * emits (src/checks.mjs); the playbook keeps a verbatim copy of the first (spec/observer-comparators.json) and a
 * captured registry of the second (registry/observer-checks.json), and every row is built against both. The observer
 * side asserts the same contract from its end (aeo src/conformance.mjs, `node alpha-site-system/src/cli.mjs conformance`).
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))

test('spec/observer-comparators.json is the list the bundle carries and every row uses a type from it', () => {
  const comparators = read('spec/observer-comparators.json')
  const bundle = read('spec/check-bundle.generated.json')
  const types = Object.keys(comparators.comparators).filter((k) => !k.startsWith('$'))
  assert.equal(types.length, 35, 'the observer publishes 35 types (aeo #37); resync with tests/sync-observer-comparators.mjs when it changes')
  assert.deepEqual(bundle.comparators, comparators.comparators, 'the bundle carries the copy verbatim')
  for (const type of types) assert.ok(typeof comparators.comparators[type] === 'string' && comparators.comparators[type].trim(), `${type} has one line of semantics`)
  for (const row of bundle.rows) assert.ok(types.includes(row.comparator.type), `${row.id} uses ${row.comparator.type}, which the observer does not implement`)
  // The comparator the East Bay incident turned on is stated in the copy exactly as the observer implements it.
  assert.match(comparators.comparators['equals-approved-media'], /attachment id .*equals the registry attachmentId/)
  assert.match(comparators.comparators['equals-approved-media'], /stale-launch words are evidence, never the verdict/)
  assert.equal(comparators.$comment.includes(OBSERVER_COMPARATORS_URL.replace('https://raw.githubusercontent.com/', '').replace('/main/', ' ')) || /superbuilders\/aeo alpha-site-system\/spec\/supported-comparators\.json/.test(comparators.$comment), true, 'the copy names its source')
})

test('every observerCheck in the rows and retirements is a registered observer check, and the registry is the coverage list', () => {
  const registry = read('registry/observer-checks.json')
  const bundle = read('spec/check-bundle.generated.json')
  const rowsSpec = read('spec/check-rows.json')
  const names = observerCheckNames(registry)
  for (const row of bundle.rows) assert.ok(names.includes(row.observerCheck), `${row.id}: observerCheck ${row.observerCheck} is not in registry/observer-checks.json`)
  for (const entry of bundle.retired) assert.ok(names.includes(entry.observerCheck), `retired ${entry.observerCheck} is not in registry/observer-checks.json`)
  for (const row of rowsSpec.rows) assert.ok(names.includes(row.observerCheck), `${row.id}: observerCheck ${row.observerCheck} is not in registry/observer-checks.json`)
  const covered = new Set([...bundle.rows.map((r) => r.observerCheck), ...bundle.retired.map((r) => r.observerCheck)])
  for (const name of names) assert.ok(covered.has(name), `observer check ${name} has neither a row nor a retirement`)
  // A name appears in one family only.
  const seen = new Map()
  for (const [family, list] of Object.entries(registry.families)) for (const name of list) { assert.ok(!seen.has(name), `${name} is in both ${seen.get(name)} and ${family}`); seen.set(name, family) }
  // Contract-first names (pendingInObserver) each have a row and are registered; the coverage family is emitted since aeo #37.
  const pending = Object.keys(registry.pendingInObserver).filter((k) => !k.startsWith('$'))
  assert.deepEqual(pending, ['bundle-conformance'], 'only the conformance check waits on the observer')
  for (const name of pending) {
    assert.ok(names.includes(name), `${name} pending but not registered`)
    assert.ok(bundle.rows.some((r) => r.observerCheck === name), `${name} pending but has no row`)
  }
  assert.deepEqual(registry.families.coverage, ['campus-page-rendered', 'campus-registry-coverage', 'program-page-present'])
  assert.equal(registry.capturedFrom.commit, '16dac273')
  assert.deepEqual(registry.families['loop-health'], ['bundle-conformance', 'campus-operations-snapshot-fresh', 'comparator-unsupported', 'provider-health', 'vision-pass', 'vision-pass-budget', 'vision-pass-errors'])
})

test('site.loop.health.conformance is the loop-health row the observer files on a non-conforming bundle', () => {
  const bundle = read('spec/check-bundle.generated.json')
  assert.equal(bundle.version, '1.5')
  const row = bundle.rows.find((r) => r.id === 'site.loop.health.conformance')
  assert.ok(row, 'row exists')
  assert.deepEqual([row.observerCheck, row.channel, row.ticketClass, row.ownerRole, row.pageFamily, row.entitySource, row.depth, row.dedupeScope, row.clearAfterRuns, row.severity, row.status, row.comparator.type, row.comparator.threshold, row.comparator.unit, row.grounding.kind],
    ['bundle-conformance', 'loop-health', 'observer-health', 'observer-owner', 'site', 'map', 'http', 'site', 1, 'high', 'enforced', 'count-equals', 0, 'failures', 'decision'])
  assert.match(row.grounding.ref, /docs\/qc-loop-repair-plan-2026-09-25\.md repair 3/)
  assert.match(row.suppresses, /every row named in a conformance failure/)
  assert.match(row.comparator.note, /launchWords, assetPatterns, registries, missingThing, missingAsk, rules/)
  // The loop-health checks aeo main already emitted without a row now have one each, so the registry matches checks.mjs.
  for (const [id, check] of [['site.loop.health.comparator-unsupported', 'comparator-unsupported'], ['site.loop.health.vision-pass', 'vision-pass'], ['site.loop.health.vision-pass-budget', 'vision-pass-budget'], ['site.loop.health.vision-pass-errors', 'vision-pass-errors']]) {
    const loopRow = bundle.rows.find((r) => r.id === id)
    assert.ok(loopRow, id)
    assert.deepEqual([loopRow.observerCheck, loopRow.channel, loopRow.ticketClass], [check, 'loop-health', 'observer-health'])
  }
  const classes = read('spec/policy-bundle.generated.json').classes
  for (const check of ['bundle-conformance', 'comparator-unsupported', 'vision-pass', 'vision-pass-budget', 'vision-pass-errors']) assert.ok(classes['observer-health'].observerChecks.includes(check), `${check} is claimed by observer-health`)
  assert.ok(classes['observer-health'].matchRequirementIds.includes('site.loop.health.conformance'))
  assert.equal(read('spec/observer-check-map.json').checks['bundle-conformance'].requirement, 'site.loop.health')
})

test('sync-observer-comparators: no drift against a verbatim copy, drift named against an altered one, --write brings the copy current, --checks reads checks.mjs', () => {
  const playbook = read('spec/observer-comparators.json')
  assert.deepEqual(comparatorDrift(playbook, playbook), { ok: true, observerVersion: playbook.version, playbookVersion: playbook.version, observerCount: 35, playbookCount: 35, missingHere: [], extraHere: [], semanticsDiffer: [], orderDiffers: false })
  const altered = JSON.parse(JSON.stringify(playbook))
  altered.version = '2026-10-01'
  altered.comparators['pixel-ocr-equals'] = 'the words read from the pixels equal the expected words'
  delete altered.comparators['not-placeholder']
  altered.comparators['present'] = 'the expected element is present (changed)'
  const drift = comparatorDrift(altered, playbook)
  assert.equal(drift.ok, false)
  assert.deepEqual([drift.missingHere, drift.extraHere, drift.semanticsDiffer], [['pixel-ocr-equals'], ['not-placeholder'], ['present']])
  assert.match(renderReport({ comparators: { source: 'x', ...drift }, checks: null, wrote: false }), /DRIFT: observer implements types the playbook copy lacks: pixel-ocr-equals/)
  const synced = syncedComparators(altered, playbook)
  assert.equal(synced.$comment, playbook.$comment)
  assert.equal(synced.version, '2026-10-01')
  assert.deepEqual(synced.comparators, altered.comparators)
  assert.equal(comparatorDrift(altered, synced).ok, true)

  // The CLI on a scratch copy of the playbook: exit 0 with no drift, exit 1 naming the drift, --write rewrites the copy.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'observer-sync-'))
  for (const rel of ['spec', 'registry', 'tests']) fs.cpSync(path.join(root, rel), path.join(dir, rel), { recursive: true })
  const script = path.join(dir, 'tests', 'sync-observer-comparators.mjs')
  const same = spawnSync(process.execPath, [script, '--source', 'spec/observer-comparators.json'], { encoding: 'utf8', cwd: dir })
  assert.equal(same.status, 0, same.stderr)
  assert.match(same.stdout, /comparators: no drift/)
  fs.writeFileSync(path.join(dir, 'observer.json'), JSON.stringify(altered))
  const drifted = spawnSync(process.execPath, [script, '--source', path.join(dir, 'observer.json')], { encoding: 'utf8', cwd: dir })
  assert.equal(drifted.status, 1)
  assert.match(drifted.stdout, /DRIFT: playbook copy lists types the observer does not implement: not-placeholder/)
  assert.match(drifted.stdout, /DRIFT: semantics differ for: present/)
  const written = spawnSync(process.execPath, [script, '--source', path.join(dir, 'observer.json'), '--write', '--json'], { encoding: 'utf8', cwd: dir })
  assert.equal(written.status, 0, written.stderr)
  assert.equal(JSON.parse(written.stdout).wrote, true)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'spec', 'observer-comparators.json'), 'utf8')).comparators, altered.comparators)
  // A fetch without a token against the private repository fails closed with the fix in the message (no network: bad host).
  const unreachable = spawnSync(process.execPath, [script, '--source', 'https://raw.githubusercontent.invalid/nothing.json'], { encoding: 'utf8', cwd: dir, env: { ...process.env, GH_TOKEN: 'x', PATH: process.env.PATH } })
  assert.equal(unreachable.status, 1)
  assert.match(unreachable.stderr, /sync-observer-comparators: /)

  // --checks: a checks.mjs that emits every registered name plus one is drift; one that drops a pending name is not.
  const registry = read('registry/observer-checks.json')
  const rowsSpec = read('spec/check-rows.json')
  const names = observerCheckNames(registry).filter((n) => !Object.keys(registry.pendingInObserver).includes(n))
  const source = names.map((n) => `finding("campus-truth", "${n}", entity, "field", "high", "t", "s")`).join('\n')
  assert.deepEqual(extractObserverCheckNames(source), names.sort())
  const clean = checkDrift(source, registry, rowsSpec)
  assert.equal(clean.ok, true, JSON.stringify(clean))
  assert.deepEqual(clean.pendingNowEmitted, [])
  const noisy = checkDrift(`${source}\nfinding("loop-health", "brand-new-check", "x", "f", "high", "t", "s")\nfinding("loop-health", "bundle-conformance", "x", "f", "high", "t", "s")`, registry, rowsSpec)
  assert.deepEqual([noisy.ok, noisy.missingHere, noisy.pendingNowEmitted], [false, ['brand-new-check'], ['bundle-conformance']])
  fs.writeFileSync(path.join(dir, 'checks.mjs'), source)
  const checked = spawnSync(process.execPath, [script, '--source', 'spec/observer-comparators.json', '--checks', '--checks-source', path.join(dir, 'checks.mjs')], { encoding: 'utf8', cwd: dir })
  assert.equal(checked.status, 0, checked.stdout + checked.stderr)
  assert.match(checked.stdout, /checks: no drift/)
  fs.rmSync(dir, { recursive: true, force: true })
  assert.equal(parseArgs([]).checksSource, OBSERVER_CHECKS_URL)
  assert.throws(() => parseArgs(['--bogus']), /unknown argument/)
})
