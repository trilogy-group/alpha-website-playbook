// agent/select-observer-run.mjs: the observer run the filer files when no run id was handed in (2026-09-29 defect: the
// 06:45 UTC fallback run 36534543907 selected the 2026-09-08 run 34183507075 by workflow display name, was refused by
// the freshness gate, and never filed the 06:15 full run 36530193433). The fixture observer-runs-2026-09-29.json is the
// successful superbuilders/aeo site-observe.yml run list of 2026-09-28 12:00 to 2026-09-29 07:05 UTC plus that stale run.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_MAX_AGE_HOURS,
  DISPATCH_EVENT_TYPES,
  LANE_SCHEDULE,
  OBSERVER_WORKFLOW_FILE,
  SelectionError,
  isPreferredRun,
  laneFromRun,
  listObserverRuns,
  normalizeRun,
  selectObserverRun,
  summaryLines,
} from '../agent/select-observer-run.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = path.join(root, 'tests', 'fixtures', 'observer-filer', 'observer-runs-2026-09-29.json')
const runs = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
const FALLBACK_AT = '2026-09-29T07:05:03Z' // when run 36534543907 asked gh for a run
const FULL_0600 = '36530193433'
const STALE = '34183507075'

test('lane vocabulary agrees with the observer (aeo alpha-site-system/src/lane.mjs, observer-runs.mjs laneFromRun)', () => {
  assert.equal(OBSERVER_WORKFLOW_FILE, 'site-observe.yml')
  assert.deepEqual(LANE_SCHEDULE, { full: ['0 6 * * *', '0 21 * * *'], events: ['15 1-23/2 * * *'], 'source-contract': ['30 6 * * *'] })
  assert.deepEqual(DISPATCH_EVENT_TYPES, { 'site-changed': 'full', 'events-changed': 'events' })
  const lane = (displayTitle, extra = {}) => laneFromRun({ displayTitle, ...extra })
  assert.equal(lane('Observer [schedule 0 6 * * *]'), 'full')
  assert.equal(lane('Observer [schedule 0 21 * * *]'), 'full')
  assert.equal(lane('Observer [schedule 15 1-23/2 * * *]'), 'events')
  assert.equal(lane('Observer [schedule 30 6 * * *]'), 'source-contract')
  assert.equal(lane('Observer [workflow_dispatch full]'), 'full')
  assert.equal(lane('Observer [workflow_dispatch]'), 'full', 'a bare workflow_dispatch defaults to full, as selectLane does')
  assert.equal(lane('Observer [workflow_dispatch events]'), 'events')
  assert.equal(lane('Observer [workflow_dispatch nonsense]'), null)
  assert.equal(lane('Observer [repository_dispatch site-changed]'), 'full')
  assert.equal(lane('Observer [repository_dispatch events-changed]'), 'events')
  assert.equal(lane('Observer [repository_dispatch other]'), null)
  assert.equal(lane('Observer [push]'), 'full')
  // Without a marker (runs from before the marker existed): push is full, schedule is read off the clock, else unknown.
  assert.equal(lane('Alpha Website Production Observer', { event: 'push' }), 'full')
  assert.equal(lane('Alpha Website Production Observer', { event: 'schedule', createdAt: '2026-09-08T03:26:18Z' }), 'events')
  assert.equal(lane('Alpha Website Production Observer', { event: 'schedule', createdAt: '2026-09-08T06:03:00Z' }), 'full')
  assert.equal(lane('Alpha Website Production Observer', { event: 'schedule', createdAt: '2026-09-08T06:31:00Z' }), 'source-contract')
  assert.equal(lane('Alpha Website Production Observer', { event: 'workflow_dispatch' }), null)
  // Preferred = full-site: the two full crons, workflow_dispatch full or bare, push; a site-changed dispatch may be route-restricted.
  for (const title of ['Observer [schedule 0 6 * * *]', 'Observer [schedule 0 21 * * *]', 'Observer [workflow_dispatch full]', 'Observer [workflow_dispatch]', 'Observer [push]']) assert.equal(isPreferredRun({ displayTitle: title }), true, title)
  for (const title of ['Observer [repository_dispatch site-changed]', 'Observer [schedule 15 1-23/2 * * *]', 'Observer [schedule 30 6 * * *]', 'Observer [workflow_dispatch events]']) assert.equal(isPreferredRun({ displayTitle: title }), false, title)
  assert.equal(isPreferredRun({ displayTitle: 'Alpha Website Production Observer', event: 'push' }), true)
  assert.equal(isPreferredRun({ displayTitle: 'Alpha Website Production Observer', event: 'repository_dispatch' }), false)
})

test('the 07:04 case: the newest full-site run inside 14 hours is selected, never the 2026-09-08 run', () => {
  const selection = selectObserverRun(runs, { now: FALLBACK_AT })
  assert.equal(selection.skip, false)
  assert.equal(selection.maxAgeHours, DEFAULT_MAX_AGE_HOURS)
  assert.equal(selection.cutoff, '2026-09-28T17:05:03.000Z')
  assert.equal(selection.selected.id, FULL_0600)
  assert.equal(selection.selected.lane, 'full')
  assert.equal(selection.selected.preferred, true)
  assert.equal(selection.selected.title, 'Observer [schedule 0 6 * * *]')
  assert.match(selection.reason, /^newest full-site run of 13 candidates created after 2026-09-28T17:05:03\.000Z$/)
  // The source-contract run of 06:51 is newer but not full-site; it is listed, not selected.
  assert.equal(selection.candidates[0].id, '36533319250')
  assert.equal(selection.candidates[0].lane, 'source-contract')
  assert.equal(selection.candidates.length, 13, 'the 13 successful runs created in the 14 hours before 07:05')
  assert.deepEqual(selection.candidates.map((run) => run.id).slice(0, 3), ['36533319250', FULL_0600, '36526330583'], 'newest first')
  assert.equal(selection.candidates.some((run) => run.id === STALE), false)
  assert.deepEqual(selection.rejected.map((run) => run.id), ['36443859673', '36429093748', STALE], 'the runs outside the window are reported, newest first')
  assert.equal(selection.listed, 16)
  for (const run of selection.candidates) assert.equal('createdMs' in run, false, 'internal fields never reach the report')
})

test('with only runs older than the window the selection is a skip, not a failure', () => {
  const stale = runs.filter((run) => String(run.databaseId) === STALE)
  const selection = selectObserverRun(stale, { now: FALLBACK_AT })
  assert.equal(selection.skip, true)
  assert.equal(selection.selected, null)
  assert.deepEqual(selection.candidates, [])
  assert.match(selection.reason, /^no successful observer run created after 2026-09-28T17:05:03\.000Z \(1 successful run listed, newest 2026-09-08T03:26:18\.000Z\)$/)
  assert.equal(selectObserverRun([], { now: FALLBACK_AT }).skip, true)
  // The window is enforced here even when the API ignored --created: a 14-hour-old list is still cut at the window.
  const shifted = selectObserverRun(runs, { now: '2026-09-30T00:00:00Z' })
  assert.equal(shifted.skip, true, 'every fixture run is older than 14 hours by 2026-09-30 00:00')
  assert.equal(selectObserverRun(runs, { now: '2026-09-30T00:00:00Z', maxAgeHours: 48 }).selected.id, FULL_0600, 'a wider window admits the same full run')
})

test('without a full-site candidate the newest run of any lane is selected; a future or failed run never is', () => {
  const eventsOnly = runs.filter((run) => /15 1-23\/2/.test(run.displayTitle))
  const selection = selectObserverRun(eventsOnly, { now: FALLBACK_AT })
  assert.equal(selection.selected.id, '36526330583')
  assert.equal(selection.selected.lane, 'events')
  assert.match(selection.reason, /^no full-site run of the 7 candidates created after .*; newest of any lane$/)
  // A run created after `now` (clock skew, or a test with a past --now) is outside the window.
  const withFuture = [...eventsOnly, { databaseId: 99999999999, createdAt: '2026-09-29T09:00:00Z', displayTitle: 'Observer [schedule 0 6 * * *]', event: 'schedule', conclusion: 'success' }]
  assert.equal(selectObserverRun(withFuture, { now: FALLBACK_AT }).selected.id, '36526330583')
  // A run the API lists with another conclusion, a non-numeric id or no createdAt is not a candidate.
  const noisy = [
    { databaseId: 36530193433, createdAt: '2026-09-29T06:15:59Z', displayTitle: 'Observer [schedule 0 6 * * *]', event: 'schedule', conclusion: 'failure' },
    { databaseId: 'abc', createdAt: '2026-09-29T06:15:59Z', displayTitle: 'Observer [push]', event: 'push', conclusion: 'success' },
    { databaseId: 36533319250, displayTitle: 'Observer [push]', event: 'push', conclusion: 'success' },
    { databaseId: 36526330583, createdAt: '2026-09-29T05:28:28Z', displayTitle: 'Observer [schedule 15 1-23/2 * * *]', event: 'schedule', conclusion: 'success' },
  ]
  assert.equal(selectObserverRun(noisy, { now: FALLBACK_AT }).selected.id, '36526330583')
  // Ties on createdAt fall to the higher run id; REST-shaped runs (id, display_title, created_at) normalize too.
  const tie = selectObserverRun([
    { id: 5, created_at: '2026-09-29T06:15:59Z', display_title: 'Observer [push]', event: 'push' },
    { id: 7, created_at: '2026-09-29T06:15:59Z', display_title: 'Observer [push]', event: 'push' },
  ], { now: FALLBACK_AT })
  assert.equal(tie.selected.id, '7')
  assert.deepEqual(normalizeRun({ id: 7, created_at: '2026-09-29T06:15:59Z', display_title: 'Observer [push]', event: 'push' }).lane, 'full')
  assert.throws(() => selectObserverRun(runs, { now: 'never' }), (error) => error instanceof SelectionError && error.code === 'BAD_ARG')
  assert.throws(() => selectObserverRun(runs, { now: FALLBACK_AT, maxAgeHours: 0 }), (error) => error instanceof SelectionError && error.code === 'BAD_ARG')
})

test('listObserverRuns queries by workflow file with --created, retries without it on an older gh, and fails loudly otherwise', () => {
  const calls = []
  const spawnOk = (gh, args) => { calls.push([gh, ...args]); return { status: 0, stdout: JSON.stringify(runs.slice(0, 2)) } }
  const listed = listObserverRuns({ since: '2026-09-28T17:05:03Z', spawn: spawnOk })
  assert.deepEqual(calls, [['gh', 'run', 'list', '--repo', 'superbuilders/aeo', '--workflow', 'site-observe.yml', '--status', 'success', '--limit', '50', '--json', 'databaseId,createdAt,displayTitle,event,conclusion,status,url', '--created', '>=2026-09-28T17:05:03Z']])
  assert.equal(listed.createdFilterApplied, true)
  assert.equal(listed.runs.length, 2)
  calls.length = 0
  const spawnOld = (gh, args) => { calls.push(args); return args.includes('--created') ? { status: 1, stderr: 'unknown flag: --created' } : { status: 0, stdout: '[]' } }
  const retried = listObserverRuns({ since: '2026-09-28T17:05:03Z', spawn: spawnOld })
  assert.equal(calls.length, 2)
  assert.equal(retried.createdFilterApplied, false)
  assert.deepEqual(retried.runs, [])
  assert.throws(() => listObserverRuns({ since: '2026-09-28T17:05:03Z', spawn: () => ({ status: 4, stderr: 'HTTP 401: Bad credentials' }) }), (error) => error instanceof SelectionError && error.code === 'GH_FAILED' && /HTTP 401/.test(error.message))
  assert.throws(() => listObserverRuns({ since: '2026-09-28T17:05:03Z', spawn: () => ({ error: new Error('spawn gh ENOENT') }) }), (error) => error.code === 'GH_FAILED')
})

test('the CLI on --json prints the report, writes the job outputs and summary, exits 0 on a skip and 2 on a bad argument', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-run-selection-'))
  const outputs = path.join(tmp, 'outputs.txt')
  const stepSummary = path.join(tmp, 'summary.md')
  const run = (args) => spawnSync(process.execPath, ['agent/select-observer-run.mjs', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: outputs, GITHUB_STEP_SUMMARY: stepSummary } })
  const readOutputs = () => Object.fromEntries(fs.readFileSync(outputs, 'utf8').trim().split('\n').map((line) => line.split(/=(.*)/s).slice(0, 2)))

  const selected = run(['--json', FIXTURE, '--now', FALLBACK_AT])
  assert.equal(selected.status, 0, selected.stderr)
  const report = JSON.parse(selected.stdout)
  assert.equal(report.selected.id, FULL_0600)
  assert.equal(report.source, `file ${FIXTURE}`)
  assert.deepEqual(readOutputs(), { selected_run_id: FULL_0600, selection_skip: 'false', selected_lane: 'full', selected_created_at: '2026-09-29T06:15:59.000Z', candidate_count: '13' })
  const summary = fs.readFileSync(stepSummary, 'utf8')
  assert.match(summary, /^## Observer run selection$/m)
  assert.match(summary, /^- Selected: `36530193433` \(created `2026-09-29T06:15:59\.000Z`, lane `full`, Observer \[schedule 0 6 \* \* \*\]\); newest full-site run of 13 candidates/m)
  assert.match(summary, /^\| `36533319250` \| `2026-09-29T06:51:46\.000Z` \| `source-contract` \| Observer \[schedule 30 6 \* \* \*\] \|  \|$/m)
  assert.match(summary, /^\| `36530193433` \| `2026-09-29T06:15:59\.000Z` \| `full` \| Observer \[schedule 0 6 \* \* \*\] \| yes \|$/m)
  assert.match(summary, /^- Outside the window \(newest first\): `36443859673` \(2026-09-28T15:28:34\.000Z\), `36429093748` \(2026-09-28T13:30:25\.000Z\), `34183507075` \(2026-09-08T03:26:18\.000Z\)$/m)
  // The candidate list also goes to the log (stderr), one line per run, then the decision.
  assert.match(selected.stderr, /^candidate 36530193433 created 2026-09-29T06:15:59\.000Z lane full \(full-site\): Observer \[schedule 0 6 \* \* \*\]$/m)
  assert.match(selected.stderr, /^selected 36530193433: newest full-site run/m)

  fs.rmSync(outputs); fs.rmSync(stepSummary)
  const staleFile = path.join(tmp, 'stale.json')
  fs.writeFileSync(staleFile, JSON.stringify(runs.filter((item) => String(item.databaseId) === STALE)))
  const skipped = run(['--json', staleFile, '--now', FALLBACK_AT])
  assert.equal(skipped.status, 0, 'a skip is not a failure')
  assert.equal(JSON.parse(skipped.stdout).skip, true)
  assert.deepEqual(readOutputs(), { selected_run_id: '', selection_skip: 'true', selected_lane: '', selected_created_at: '', candidate_count: '0' })
  assert.match(fs.readFileSync(stepSummary, 'utf8'), /^- Skipped: no successful observer run created after 2026-09-28T17:05:03\.000Z \(1 successful run listed, newest 2026-09-08T03:26:18\.000Z\); nothing to file until the observer completes a run/m)
  assert.match(skipped.stderr, /^skip: no successful observer run/m)

  assert.equal(run([]).status, 2)
  assert.match(run([]).stderr, /^BAD_ARG: Usage: select-observer-run\.mjs/)
  assert.equal(run(['--json', FIXTURE, '--live']).status, 2, '--json and --live are exclusive')
  assert.match(run(['--json', FIXTURE, '--now', 'never']).stderr, /^BAD_ARG: --now must be an ISO datetime/)
  assert.match(run(['--json', FIXTURE, '--max-age-hours', '-1']).stderr, /^BAD_ARG: --max-age-hours must be a positive number/)
  const notArray = path.join(tmp, 'object.json')
  fs.writeFileSync(notArray, '{}')
  assert.match(run(['--json', notArray]).stderr, /must hold a JSON array of runs/)
  assert.equal(run(['--json', path.join(tmp, 'missing.json')]).status, 2)
  // summaryLines is what the CLI writes; a title with a pipe is escaped for the table.
  const lines = summaryLines(selectObserverRun([{ databaseId: 1, createdAt: '2026-09-29T06:15:59Z', displayTitle: 'Observer [push] a|b', event: 'push' }], { now: FALLBACK_AT }), { source: 'test' })
  assert.ok(lines.some((line) => line.includes('Observer [push] a\\|b')))
})
