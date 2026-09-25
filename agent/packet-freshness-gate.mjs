#!/usr/bin/env node
/**
 * Packet freshness gate for .github/workflows/observer-filer.yml (2026-09-25: the scheduled filer applied a 17-day-old
 * packet). Reads a downloaded observer packet and decides, before any filer call, whether it may be used at all:
 *
 *   node agent/packet-freshness-gate.mjs --run-dir <packet dir> [--max-packet-age-hours 6] [--apply] \
 *     [--after-run-id <run id>] [--ledger-file <filer-apply-ledger.json>] [--github-run-id <n>] [--now <ISO>]
 *
 * Refuses (exit 2, `STALE_PACKET: ...` on stderr) unless `manifest.checkBundle.status` is `verified` and
 * `manifest.completedAt` is within `--max-packet-age-hours` of now (agent/file-observer-findings.mjs assessPacketFreshness,
 * the same test the filer's --apply applies). With --apply it also requires the packet's `manifest.runId` to be newer
 * (compareRunIds) than the last applied run id: the newer of `--after-run-id` (the repository variable
 * OBSERVER_FILER_LAST_APPLIED_RUN) and the `runId` in `--ledger-file` (the filer-apply-ledger artifact). Without --apply the
 * last applied run is reported, not enforced.
 *
 * Prints one JSON object to stdout; with GITHUB_OUTPUT set it appends manifest_run_id, completed_at, bundle_status,
 * bundle_sha256, age_hours, last_applied, last_applied_source and fresh; with GITHUB_STEP_SUMMARY set it appends the gate
 * section (GitHub run id, manifest run id, bundle sha, completedAt, age, last applied run, result). Never reads the queue,
 * never needs a token, never writes anything else.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ObserverFilerError, STALE_PACKET, assessPacketFreshness, compareRunIds, loadRunFolder, packetGateOptions, parseArgs } from './file-observer-findings.mjs'

/** The last applied run id among the candidates (each `{ runId, source }`), by compareRunIds; null when none is set. */
export function lastAppliedRun(candidates) {
  let best = null
  for (const candidate of candidates) {
    const runId = String(candidate?.runId || '').trim()
    if (!runId) continue
    if (!best || compareRunIds(runId, best.runId) > 0) best = { runId, source: candidate.source }
  }
  return best
}

export function readLedgerFile(file) {
  if (!file) return null
  const resolved = path.resolve(file)
  if (!fs.existsSync(resolved)) return null
  const ledger = JSON.parse(fs.readFileSync(resolved, 'utf8'))
  return ledger && typeof ledger.runId === 'string' ? { runId: ledger.runId, source: `ledger artifact ${resolved}`, appliedAt: ledger.appliedAt || null } : null
}

export function gate({ runDir, apply = false, maxAgeHours, afterRunId = null, ledgerFile = null, now = new Date() }) {
  const run = loadRunFolder(runDir)
  const lastApplied = lastAppliedRun([{ runId: afterRunId, source: 'OBSERVER_FILER_LAST_APPLIED_RUN' }, readLedgerFile(ledgerFile)])
  const freshness = assessPacketFreshness(run.manifest, { now, maxAgeHours, afterRunId: apply ? lastApplied?.runId || null : null })
  const order = lastApplied ? compareRunIds(run.manifest.runId, lastApplied.runId) : null
  return { ...freshness, mode: apply ? 'apply' : 'dry-run', lastApplied, newerThanLastApplied: order === null ? null : order > 0, runDir: run.dir }
}

function summaryLines(result, githubRunId) {
  return [
    '## Observer packet freshness gate', '',
    `- Observer GitHub run: \`${githubRunId || 'n/a'}\``,
    `- Run id (manifest): \`${result.runId}\``,
    `- Bundle: \`${result.bundleStatus || 'missing'}\` (\`${result.bundleSha256 || 'no sha256'}\`)`,
    `- Completed at: \`${result.completedAt || 'missing'}\` (${result.ageHours === null ? 'age unknown' : `${result.ageHours} h old`}; limit ${result.maxAgeHours} h)`,
    `- Mode: \`${result.mode}\``,
    `- Last applied run: ${result.lastApplied ? `\`${result.lastApplied.runId}\` (${result.lastApplied.source}); this packet is ${result.newerThanLastApplied ? 'newer' : 'not newer'}` : 'none recorded'}`,
    `- Result: ${result.fresh ? '**proceed**' : `**refused** (${result.problems.join('; ')})`}`, '',
  ]
}

export async function main(argv = process.argv.slice(2), env = process.env, io = { log: console.log, error: console.error }) {
  const args = parseArgs(argv)
  if (!args['run-dir'] || args['run-dir'] === true) throw new ObserverFilerError('MISSING_ARG', 'Usage: packet-freshness-gate.mjs --run-dir <packet dir> [--max-packet-age-hours 6] [--apply] [--after-run-id <run id>] [--ledger-file <json>] [--github-run-id <n>] [--now <ISO>]')
  const now = args.now && args.now !== true ? new Date(args.now) : new Date()
  if (Number.isNaN(now.getTime())) throw new ObserverFilerError('MISSING_ARG', `--now must be an ISO datetime, got ${args.now}`)
  const options = packetGateOptions(args)
  const result = gate({ runDir: args['run-dir'], apply: Boolean(args.apply), maxAgeHours: options.maxAgeHours, afterRunId: options.afterRunId, ledgerFile: args['ledger-file'] && args['ledger-file'] !== true ? args['ledger-file'] : null, now })
  const githubRunId = args['github-run-id'] && args['github-run-id'] !== true ? String(args['github-run-id']) : null
  if (env.GITHUB_OUTPUT) {
    const outputs = { manifest_run_id: result.runId || '', completed_at: result.completedAt || '', bundle_status: result.bundleStatus || '', bundle_sha256: result.bundleSha256 || '', age_hours: result.ageHours ?? '', last_applied: result.lastApplied?.runId || '', last_applied_source: result.lastApplied?.source || '', fresh: String(result.fresh) }
    fs.appendFileSync(env.GITHUB_OUTPUT, `${Object.entries(outputs).map(([k, v]) => `${k}=${String(v).replace(/[\r\n]/g, ' ')}`).join('\n')}\n`)
  }
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${summaryLines(result, githubRunId).join('\n')}\n`)
  io.log(JSON.stringify({ githubRunId, ...result }, null, 2))
  if (!result.fresh) throw new ObserverFilerError(STALE_PACKET, `refusing the packet: ${result.problems.join('; ')}`, { packet: result })
  return result
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch((error) => {
    if (error instanceof ObserverFilerError) { console.error(`${error.code}: ${error.message}`); process.exit(2) }
    console.error(error.stack || error.message)
    process.exit(3)
  })
}
