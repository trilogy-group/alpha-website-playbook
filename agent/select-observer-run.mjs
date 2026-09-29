#!/usr/bin/env node
/**
 * Observer run selection for .github/workflows/observer-filer.yml when no run id was handed in (the fallback cron, or a
 * workflow_dispatch without run_id). 2026-09-29 06:45 UTC: the fallback run 36534543907 asked `gh run list --workflow
 * 'Alpha Website Production Observer' ... | sort_by(.createdAt) | last` and was handed run 34183507075, created
 * 2026-09-08; the freshness gate refused it (correctly) but the 06:15 full run 36530193433 was never filed. The name
 * lookup and an unbounded list were the weak points, so this helper:
 *
 *   - lists the observer runs by workflow file (`site-observe.yml`, superbuilders/aeo), never by display name;
 *   - asks GitHub for successful runs created within the last `--max-age-hours` (default 14, `--created ">=<ISO>"`)
 *     and applies the same window itself, so an old run can never be selected whatever the API returns;
 *   - reads each run's lane from its display title the way the observer does (aeo alpha-site-system/src/observer-runs.mjs
 *     laneFromRun: `[schedule <cron>]`, `[workflow_dispatch <mode>]`, `[repository_dispatch <type>]`, `[push]`), and
 *     prefers the newest full-site run (`[schedule 0 6 * * *]`, `[schedule 0 21 * * *]`, `[workflow_dispatch full]`
 *     or a bare `[workflow_dispatch]`, `[push]`), else the newest run of any lane;
 *   - prints the candidate list (id, createdAt, lane, title) to stdout as JSON and to the job summary;
 *   - when no run is young enough, reports `skip: true` (exit 0) so the workflow ends with a summary line instead of a
 *     failure. The packet freshness gate (agent/packet-freshness-gate.mjs) stays the last defence after the download.
 *
 *   node agent/select-observer-run.mjs --live [--repo superbuilders/aeo] [--workflow site-observe.yml] [--limit 50]
 *   node agent/select-observer-run.mjs --json <runs.json>          (a saved `gh run list --json ...` array; tests)
 *   both: [--max-age-hours 14] [--now <ISO>]
 *
 * With GITHUB_OUTPUT set it appends selected_run_id, selection_skip, selected_lane, selected_created_at and
 * candidate_count; with GITHUB_STEP_SUMMARY set it appends the selection section. Exit 2 on a bad argument or a failed
 * `gh run list`. Node built-ins only, so the workflow runs it before any npm install.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export const OBSERVER_REPOSITORY = 'superbuilders/aeo'
export const OBSERVER_WORKFLOW_FILE = 'site-observe.yml'
export const DEFAULT_MAX_AGE_HOURS = 14
export const DEFAULT_LIST_LIMIT = 50
export const RUN_LIST_FIELDS = 'databaseId,createdAt,displayTitle,event,conclusion,status,url'

/**
 * The observer's lane vocabulary (aeo alpha-site-system/src/lane.mjs LANE_SCHEDULE and DISPATCH_EVENT_TYPES, read back
 * from run titles by observer-runs.mjs laneFromRun). Keep these three tables equal to the observer's.
 */
export const LANES = Object.freeze(['full', 'events', 'source-contract'])
export const LANE_SCHEDULE = Object.freeze({
  full: Object.freeze(['0 6 * * *', '0 21 * * *']),
  events: Object.freeze(['15 1-23/2 * * *']),
  'source-contract': Object.freeze(['30 6 * * *']),
})
export const DISPATCH_EVENT_TYPES = Object.freeze({ 'site-changed': 'full', 'events-changed': 'events' })
const TITLE_MARKER = /\[(schedule|workflow_dispatch|repository_dispatch|push)(?:\s+([^\]]*))?\]/

export class SelectionError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** aeo lane.mjs laneForSchedule. */
export function laneForSchedule(cron) {
  const normalized = String(cron ?? '').trim().replace(/\s+/g, ' ')
  for (const [lane, expressions] of Object.entries(LANE_SCHEDULE)) if (expressions.includes(normalized)) return lane
  return null
}

/** aeo lane.mjs laneForTime: a scheduled run with no known cron is read off the clock. */
export function laneForTime(date) {
  const at = date instanceof Date ? date : new Date(date)
  const hour = at.getUTCHours()
  const minute = at.getUTCMinutes()
  if ((hour === 6 || hour === 21) && minute < 15) return 'full'
  if (hour === 6 && minute >= 30) return 'source-contract'
  return 'events'
}

/** The `[event detail]` marker of a run title, or null (aeo observer-runs.mjs TITLE_MARKER). */
export function titleMarker(run) {
  const title = String(run?.displayTitle ?? run?.display_title ?? run?.name ?? '')
  const marker = TITLE_MARKER.exec(title)
  if (!marker) return null
  return { event: marker[1], detail: (marker[2] ?? '').trim() }
}

/**
 * The lane a run belongs to, as aeo observer-runs.mjs laneFromRun reads it: the title marker first; without one a push
 * run is full, a scheduled run is read off the clock, and anything else is unknown (null).
 */
export function laneFromRun(run) {
  const marker = titleMarker(run)
  if (marker) {
    if (marker.event === 'schedule') return laneForSchedule(marker.detail) ?? laneForTime(run?.createdAt ?? run?.created_at ?? new Date())
    if (marker.event === 'workflow_dispatch') {
      const mode = marker.detail || 'full'
      return LANES.includes(mode) ? mode : null
    }
    if (marker.event === 'repository_dispatch') return DISPATCH_EVENT_TYPES[marker.detail] ?? null
    return 'full' // push
  }
  const event = String(run?.event ?? '')
  if (event === 'push') return 'full'
  if (event === 'schedule') {
    const at = run?.createdAt ?? run?.created_at
    return at ? laneForTime(at) : null
  }
  return null
}

/**
 * A full-site run the filer prefers: lane full from a scheduled full cron, a workflow_dispatch full (or bare) run, or a
 * push. A `[repository_dispatch site-changed]` run is lane full in the observer's vocabulary but may be restricted to
 * the routes the dispatch named, so it is a fallback candidate, never the preferred one.
 */
export function isPreferredRun(run) {
  if (laneFromRun(run) !== 'full') return false
  const marker = titleMarker(run)
  if (marker) return marker.event !== 'repository_dispatch'
  return String(run?.event ?? '') !== 'repository_dispatch'
}

export function normalizeRun(run) {
  const id = run?.databaseId ?? run?.id ?? null
  const createdAt = run?.createdAt ?? run?.created_at ?? null
  const createdMs = createdAt ? Date.parse(createdAt) : NaN
  return {
    id: id == null ? null : String(id),
    createdAt: Number.isFinite(createdMs) ? new Date(createdMs).toISOString() : null,
    createdMs,
    title: String(run?.displayTitle ?? run?.display_title ?? run?.name ?? ''),
    event: run?.event ?? null,
    conclusion: run?.conclusion ?? null,
    status: run?.status ?? null,
    url: run?.url ?? run?.html_url ?? null,
    lane: laneFromRun(run),
    preferred: isPreferredRun(run),
  }
}

/**
 * Pick the run to file from a `gh run list --json` array. Only successful runs created within the window
 * (now - maxAgeHours, now] are candidates, newest first; the newest preferred (full-site) candidate wins, else the
 * newest candidate of any lane; none young enough means `skip: true`.
 */
export function selectObserverRun(runs, { now = new Date(), maxAgeHours = DEFAULT_MAX_AGE_HOURS } = {}) {
  const at = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(at.getTime())) throw new SelectionError('BAD_ARG', `now must be a datetime, got ${now}`)
  const hours = Number(maxAgeHours)
  if (!Number.isFinite(hours) || hours <= 0) throw new SelectionError('BAD_ARG', `max-age-hours must be a positive number, got ${maxAgeHours}`)
  const cutoffMs = at.getTime() - hours * 3_600_000
  const considered = (Array.isArray(runs) ? runs : []).map(normalizeRun).filter((run) => /^\d+$/.test(run.id ?? '') && Number.isFinite(run.createdMs))
  const successful = considered.filter((run) => run.conclusion == null || run.conclusion === 'success')
  const candidates = successful
    .filter((run) => run.createdMs >= cutoffMs && run.createdMs <= at.getTime())
    .sort((left, right) => right.createdMs - left.createdMs || Number(right.id) - Number(left.id))
  const preferred = candidates.find((run) => run.preferred) ?? null
  const selected = preferred ?? candidates[0] ?? null
  const rejected = successful.filter((run) => !candidates.includes(run)).sort((left, right) => right.createdMs - left.createdMs)
  const strip = (run) => { const { createdMs, ...rest } = run; return rest }
  const reason = selected
    ? preferred ? `newest full-site run of ${candidates.length} candidate${candidates.length === 1 ? '' : 's'} created after ${new Date(cutoffMs).toISOString()}` : `no full-site run of the ${candidates.length} candidate${candidates.length === 1 ? '' : 's'} created after ${new Date(cutoffMs).toISOString()}; newest of any lane`
    : `no successful observer run created after ${new Date(cutoffMs).toISOString()} (${successful.length} successful run${successful.length === 1 ? '' : 's'} listed, newest ${rejected[0]?.createdAt ?? 'none'})`
  return {
    now: at.toISOString(),
    maxAgeHours: hours,
    cutoff: new Date(cutoffMs).toISOString(),
    listed: considered.length,
    skip: !selected,
    reason,
    selected: selected ? strip(selected) : null,
    candidates: candidates.map(strip),
    rejected: rejected.slice(0, 5).map(strip),
  }
}

/**
 * `gh run list` for the observer workflow file, successful runs created since `since`. A gh too old for `--created`
 * is retried without it; selectObserverRun applies the window either way.
 */
export function listObserverRuns({ repository = OBSERVER_REPOSITORY, workflowFile = OBSERVER_WORKFLOW_FILE, since, limit = DEFAULT_LIST_LIMIT, gh = 'gh', env = process.env, spawn = spawnSync } = {}) {
  const base = ['run', 'list', '--repo', repository, '--workflow', workflowFile, '--status', 'success', '--limit', String(limit), '--json', RUN_LIST_FIELDS]
  const attempts = since ? [[...base, '--created', `>=${since}`], base] : [base]
  let last = null
  for (const args of attempts) {
    const result = spawn(gh, args, { encoding: 'utf8', env })
    last = { args, result }
    if (result.error) throw new SelectionError('GH_FAILED', `${gh} could not run: ${result.error.message}`)
    if (result.status === 0) {
      const text = String(result.stdout ?? '').trim()
      return { args, runs: text ? JSON.parse(text) : [], createdFilterApplied: args.includes('--created') }
    }
    if (!(args.includes('--created') && /unknown flag|unknown shorthand flag|--created/i.test(String(result.stderr ?? '')))) break
  }
  throw new SelectionError('GH_FAILED', `gh ${last.args.join(' ')} failed (exit ${last.result.status}): ${String(last.result.stderr ?? '').trim().slice(0, 500)}`)
}

export function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new SelectionError('BAD_ARG', `unexpected argument ${token}`)
    const key = token.slice(2)
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) args[key] = true
    else { args[key] = next; index += 1 }
  }
  return args
}

export function summaryLines(selection, { source }) {
  const lines = ['## Observer run selection', '', `- Source: ${source}`, `- Window: runs created after \`${selection.cutoff}\` (${selection.maxAgeHours} h before \`${selection.now}\`); ${selection.listed} listed, ${selection.candidates.length} in the window`]
  if (selection.selected) lines.push(`- Selected: \`${selection.selected.id}\` (created \`${selection.selected.createdAt}\`, lane \`${selection.selected.lane ?? 'unknown'}\`, ${selection.selected.title}); ${selection.reason}`)
  else lines.push(`- Skipped: ${selection.reason}; nothing to file until the observer completes a run (superbuilders/aeo site-observe.yml).`)
  if (selection.candidates.length) {
    lines.push('', '| Run | Created | Lane | Title | Preferred |', '| --- | --- | --- | --- | --- |')
    for (const run of selection.candidates) lines.push(`| \`${run.id}\` | \`${run.createdAt}\` | \`${run.lane ?? 'unknown'}\` | ${run.title.replace(/\|/g, '\\|')} | ${run.preferred ? 'yes' : ''} |`)
  }
  if (selection.rejected.length) lines.push('', `- Outside the window (newest first): ${selection.rejected.map((run) => `\`${run.id}\` (${run.createdAt})`).join(', ')}`)
  lines.push('')
  return lines
}

export async function main(argv = process.argv.slice(2), env = process.env, io = { log: console.log, error: console.error }) {
  const args = parseArgs(argv)
  const usage = 'Usage: select-observer-run.mjs (--live [--repo <owner/name>] [--workflow <file>] [--limit <n>] | --json <runs.json>) [--max-age-hours 14] [--now <ISO>]'
  if (Boolean(args.live) === Boolean(args.json)) throw new SelectionError('BAD_ARG', usage)
  const now = args.now && args.now !== true ? new Date(args.now) : new Date()
  if (Number.isNaN(now.getTime())) throw new SelectionError('BAD_ARG', `--now must be an ISO datetime, got ${args.now}`)
  const maxAgeHours = args['max-age-hours'] && args['max-age-hours'] !== true ? Number(args['max-age-hours']) : DEFAULT_MAX_AGE_HOURS
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) throw new SelectionError('BAD_ARG', `--max-age-hours must be a positive number, got ${args['max-age-hours']}`)
  let runs
  let source
  if (args.live) {
    const repository = args.repo && args.repo !== true ? String(args.repo) : OBSERVER_REPOSITORY
    const workflowFile = args.workflow && args.workflow !== true ? String(args.workflow) : OBSERVER_WORKFLOW_FILE
    const limit = args.limit && args.limit !== true ? Number(args.limit) : DEFAULT_LIST_LIMIT
    const since = new Date(now.getTime() - maxAgeHours * 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
    const listed = listObserverRuns({ repository, workflowFile, since, limit, env })
    runs = listed.runs
    source = `\`gh ${listed.args.join(' ')}\``
  } else {
    if (args.json === true) throw new SelectionError('BAD_ARG', usage)
    const text = fs.readFileSync(String(args.json), 'utf8')
    runs = JSON.parse(text)
    if (!Array.isArray(runs)) throw new SelectionError('BAD_ARG', `--json ${args.json} must hold a JSON array of runs`)
    source = `file ${args.json}`
  }
  const selection = selectObserverRun(runs, { now, maxAgeHours })
  if (env.GITHUB_OUTPUT) {
    const outputs = { selected_run_id: selection.selected?.id ?? '', selection_skip: String(selection.skip), selected_lane: selection.selected?.lane ?? '', selected_created_at: selection.selected?.createdAt ?? '', candidate_count: String(selection.candidates.length) }
    fs.appendFileSync(env.GITHUB_OUTPUT, `${Object.entries(outputs).map(([key, value]) => `${key}=${String(value).replace(/[\r\n]/g, ' ')}`).join('\n')}\n`)
  }
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${summaryLines(selection, { source }).join('\n')}\n`)
  for (const run of selection.candidates) io.error(`candidate ${run.id} created ${run.createdAt} lane ${run.lane ?? 'unknown'}${run.preferred ? ' (full-site)' : ''}: ${run.title}`)
  io.error(selection.selected ? `selected ${selection.selected.id}: ${selection.reason}` : `skip: ${selection.reason}`)
  io.log(JSON.stringify({ source, ...selection }, null, 2))
  return selection
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`${error.code ?? 'ERROR'}: ${error.message}`)
    process.exit(2)
  })
}
