#!/usr/bin/env node
/**
 * Decision intake: turn a decision that arrived as an email or a Slack message into the playbook change it implies, the
 * same day and with the audit trail the decision record requires (docs/decisions.md).
 *
 *   node agent/record-decision.mjs <decision.txt> --decided-by "<person>" --source "<channel and date>" --date <YYYY-MM-DD> \
 *     --campus <slug> --cta <book-a-call|calendar|packet|apply|community> --rule <hidden|present|destination> --reason "<why>" \
 *     [--expires <YYYY-MM-DD|lifecycle:Open|none>] [--destination <url>] [--note "<text>"] [--write]
 *   node agent/record-decision.mjs <decision.txt> --decided-by "<person>" --source "<channel and date>" --date <YYYY-MM-DD> \
 *     --spec-ref <spec/... or registry/...>[,<path>] --summary "<what was decided>" [--write]
 *
 * The text file is the pasted message, kept verbatim in the fixture; nothing in it is parsed into a rule. The rule, the
 * reason, the expiry and the summary come from the flags, or the script refuses (never invents a rule). Dry run by
 * default: prints the docs/decisions.md row, the registry entry and the fixture; --write appends the row, writes the
 * registry entry (registry/campus-cta-exceptions.json, keyed by campus slug and CTA; refuses to overwrite an existing entry
 * without --replace) and saves the fixture under tests/fixtures/decisions/recorded/. A --spec-ref decision writes the row
 * and the fixture only; the change to the named spec or registry file is the operator's next edit, and npm run validate
 * fails when a Decided row dated 2026-09-24 or later cites no spec/ or registry/ path.
 *
 * Typed errors (exit 2): MISSING_ARG, MISSING_TEXT, BAD_DATE, BAD_CAMPUS, BAD_CTA, BAD_RULE, MISSING_RULE, MISSING_REASON,
 * MISSING_SUMMARY, BAD_EXPIRES, MISSING_DESTINATION, BAD_SPEC_REF, BAD_TEXT, EXISTS.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_ROOT = path.join(here, '..')
export const CTA_REGISTRY = 'registry/campus-cta-exceptions.json'
export const CAMPUS_PAGES = 'registry/campus-pages.json'
export const DECISIONS = 'docs/decisions.md'
export const FIXTURE_DIR = 'tests/fixtures/decisions/recorded'
export const RULES = ['hidden', 'present', 'destination']
export const CTAS = ['book-a-call', 'calendar', 'packet', 'apply', 'community']
const ISO_DATE = /^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/
const EM_DASH = '—'

export class RecordDecisionError extends Error {
  constructor(code, message) { super(message); this.name = 'RecordDecisionError'; this.code = code }
}

export function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { out._.push(a); continue }
    const key = a.slice(2); const next = argv[i + 1]
    out[key] = next === undefined || next.startsWith('--') ? true : (i++, next)
  }
  return out
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const flag = (args, name) => (typeof args[name] === 'string' && args[name].trim() ? args[name].trim() : null)

/** A value bound for a table cell or a registry field: one line, no pipe, no em dash (the rows are read by people and by the validator). */
function cell(value, label) {
  const text = String(value ?? '').trim()
  if (!text) throw new RecordDecisionError('BAD_TEXT', `${label} is empty`)
  if (/[\r\n|]/.test(text)) throw new RecordDecisionError('BAD_TEXT', `${label} must be one line without a pipe character`)
  if (text.includes(EM_DASH)) throw new RecordDecisionError('BAD_TEXT', `${label} carries an em dash; use a semicolon or a comma`)
  return text
}

function slugify(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) }

/**
 * Plan the decision from the flags and the pasted text: what row, what registry entry, what fixture. Pure apart from
 * reading the registries; writes nothing. `root` is the playbook checkout (tests point it at a copy).
 */
export function planDecision({ textFile, args, root = DEFAULT_ROOT, now = new Date() }) {
  if (!textFile) throw new RecordDecisionError('MISSING_ARG', 'Usage: record-decision.mjs <decision.txt> --decided-by <person> --source <channel and date> --date <YYYY-MM-DD> (--campus <slug> --cta <cta> --rule <rule> --reason <why> [--expires ...] | --spec-ref <path> --summary <text>) [--write]')
  const resolvedText = path.resolve(textFile)
  if (!fs.existsSync(resolvedText)) throw new RecordDecisionError('MISSING_TEXT', `${resolvedText} does not exist; pass the pasted email or Slack message as a text file`)
  const text = fs.readFileSync(resolvedText, 'utf8')
  if (!text.trim()) throw new RecordDecisionError('MISSING_TEXT', `${resolvedText} is empty`)
  const decidedBy = flag(args, 'decided-by')
  const source = flag(args, 'source')
  const date = flag(args, 'date')
  for (const [name, value] of [['--decided-by', decidedBy], ['--source', source], ['--date', date]]) if (!value) throw new RecordDecisionError('MISSING_ARG', `${name} is required`)
  if (!ISO_DATE.test(date)) throw new RecordDecisionError('BAD_DATE', `--date must be YYYY-MM-DD, got ${date}`)
  cell(decidedBy, '--decided-by'); cell(source, '--source')
  const textSha256 = crypto.createHash('sha256').update(text).digest('hex')
  const base = { decidedBy, source, date, text, textSha256, textFile: resolvedText, recordedAt: now.toISOString() }

  const campus = flag(args, 'campus')
  const cta = flag(args, 'cta')
  const specRef = flag(args, 'spec-ref')
  if ((campus || cta) && specRef) throw new RecordDecisionError('MISSING_ARG', 'pass --campus with --cta for a CTA exception, or --spec-ref for any other decision, not both')
  if (!specRef && !(campus && cta)) throw new RecordDecisionError('MISSING_ARG', 'a CTA exception needs both --campus and --cta; any other decision needs --spec-ref')

  if (specRef) {
    const refs = specRef.split(',').map((r) => r.trim()).filter(Boolean)
    for (const ref of refs) {
      if (!/^(spec|registry)\//.test(ref)) throw new RecordDecisionError('BAD_SPEC_REF', `--spec-ref must name spec/ or registry/ paths, got ${ref}`)
      if (!fs.existsSync(path.join(root, ref.split(' ')[0]))) throw new RecordDecisionError('BAD_SPEC_REF', `${ref.split(' ')[0]} does not exist in the playbook`)
    }
    const summary = flag(args, 'summary')
    if (!summary) throw new RecordDecisionError('MISSING_SUMMARY', '--summary is required with --spec-ref: the script records what a person decided and never derives it from the message')
    const fixtureFile = `${date}-${slugify(refs[0].split(' ')[0].replace(/^(spec|registry)\//, '').replace(/\.json$/, ''))}-${textSha256.slice(0, 8)}.json`
    const applied = [...refs, `${FIXTURE_DIR}/${fixtureFile}`].join('; ')
    const decision = `Decided (${decidedBy}, ${source}): ${cell(summary, '--summary')}`
    return { kind: 'spec-ref', ...base, specRefs: refs, summary, row: renderRow({ date, decision, by: decidedBy, applied }), applied, fixtureFile, registryEntry: null }
  }

  const registry = readJson(path.join(root, CTA_REGISTRY))
  const pages = readJson(path.join(root, CAMPUS_PAGES)).campuses || {}
  if (!pages[campus]) throw new RecordDecisionError('BAD_CAMPUS', `--campus ${campus} is not a slug in ${CAMPUS_PAGES}`)
  if (!registry.ctas?.[cta]) throw new RecordDecisionError('BAD_CTA', `--cta must be one of ${Object.keys(registry.ctas || {}).join(', ')}, got ${cta}`)
  const rule = flag(args, 'rule')
  if (!rule) throw new RecordDecisionError('MISSING_RULE', `--rule is required (${RULES.join(', ')}): the script never infers the rule from the message`)
  if (!registry.rules?.[rule]) throw new RecordDecisionError('BAD_RULE', `--rule must be one of ${Object.keys(registry.rules || {}).join(', ')}, got ${rule}`)
  const reason = flag(args, 'reason')
  if (!reason) throw new RecordDecisionError('MISSING_REASON', '--reason is required: the reason is the decider\'s words, quoted or paraphrased by the person recording')
  const expiresFlag = flag(args, 'expires')
  const expires = !expiresFlag || expiresFlag === 'none' || expiresFlag === 'null' ? null : expiresFlag
  if (expires !== null && expires !== 'lifecycle:Open' && !ISO_DATE.test(expires)) throw new RecordDecisionError('BAD_EXPIRES', `--expires must be YYYY-MM-DD, lifecycle:Open or none, got ${expires}`)
  const destination = flag(args, 'destination')
  if (rule === 'destination' && !destination) throw new RecordDecisionError('MISSING_DESTINATION', '--destination is required with --rule destination')
  const existing = registry.campuses?.[campus]?.[cta] || null
  if (existing && !args.replace) throw new RecordDecisionError('EXISTS', `${CTA_REGISTRY} already has campuses.${campus}.${cta} (${existing.rule}, ${existing.decidedBy}, ${existing.decidedOn}); pass --replace to supersede it with this decision`)
  const fixtureFile = `${date}-${campus}-${cta}.json`
  const note = flag(args, 'note')
  const entry = {
    rule,
    ...(destination ? { destination: cell(destination, '--destination') } : {}),
    reason: cell(reason, '--reason'),
    decidedBy,
    source,
    decidedOn: date,
    expires,
    note: note ? cell(note, '--note') : `Recorded with agent/record-decision.mjs on ${now.toISOString().slice(0, 10)} from the ${source} text (sha256 ${textSha256.slice(0, 12)}).`,
    decisionFixture: `${FIXTURE_DIR}/${fixtureFile}`,
  }
  const campusName = pages[campus].names?.[0] || campus
  const ctaLabel = registry.ctas[cta].label || cta
  const expiryText = expires === null ? 'standing until revoked' : expires === 'lifecycle:Open' ? 'ends when the HubSpot Program type becomes Open' : `ends ${expires}`
  const summary = `${campusName} (${pages[campus].url}): ${ctaLabel} CTA ${rule}${destination ? ` to ${destination}` : ''}; ${entry.reason}; ${expiryText}${existing ? ` (supersedes the ${existing.decidedOn} entry)` : ''}`
  const applied = `${CTA_REGISTRY} campuses.${campus}.${cta}; ${FIXTURE_DIR}/${fixtureFile}`
  const decision = `Decided (${decidedBy}, ${source}): ${cell(summary, 'summary')}`
  return { kind: 'cta-exception', ...base, campus, campusName, cta, rule, expires, summary, registryEntry: entry, superseded: existing, row: renderRow({ date, decision, by: decidedBy, applied }), applied, fixtureFile }
}

export function renderRow({ date, decision, by, applied }) { return `| ${date} | ${decision} | ${by} | ${applied} |` }

/** The fixture: the verbatim text, the flags, the row and the entry, so the decision replays and the audit trail is complete. */
export function fixtureFor(plan) {
  return {
    kind: plan.kind,
    recordedAt: plan.recordedAt,
    decidedBy: plan.decidedBy,
    source: plan.source,
    date: plan.date,
    ...(plan.kind === 'cta-exception' ? { campus: plan.campus, campusName: plan.campusName, cta: plan.cta, rule: plan.rule, expires: plan.expires, registryEntry: plan.registryEntry, superseded: plan.superseded } : { specRefs: plan.specRefs, summary: plan.summary }),
    decisionRow: plan.row,
    appliedIn: plan.applied,
    textSha256: plan.textSha256,
    text: plan.text,
  }
}

/** Apply the plan: append the row, write the registry entry, save the fixture. Returns what was written. */
export function applyDecision(plan, { root = DEFAULT_ROOT } = {}) {
  const written = []
  const decisionsFile = path.join(root, DECISIONS)
  const current = fs.readFileSync(decisionsFile, 'utf8')
  if (current.includes(plan.row)) throw new RecordDecisionError('EXISTS', `${DECISIONS} already carries this row`)
  fs.writeFileSync(decisionsFile, `${current.trimEnd()}\n${plan.row}\n`)
  written.push(DECISIONS)
  if (plan.kind === 'cta-exception') {
    const file = path.join(root, CTA_REGISTRY)
    const registry = readJson(file)
    registry.campuses = registry.campuses || {}
    registry.campuses[plan.campus] = { ...(registry.campuses[plan.campus] || {}), [plan.cta]: plan.registryEntry }
    registry.asOf = plan.date > (registry.asOf || '') ? plan.date : registry.asOf
    fs.writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`)
    written.push(CTA_REGISTRY)
  }
  const fixtureDir = path.join(root, FIXTURE_DIR)
  fs.mkdirSync(fixtureDir, { recursive: true })
  const fixturePath = path.join(fixtureDir, plan.fixtureFile)
  fs.writeFileSync(fixturePath, `${JSON.stringify(fixtureFor(plan), null, 2)}\n`)
  written.push(`${FIXTURE_DIR}/${plan.fixtureFile}`)
  return { written }
}

export async function main(argv = process.argv.slice(2), io = { log: console.log, error: console.error }) {
  const args = parseArgs(argv)
  const root = args.root && args.root !== true ? path.resolve(args.root) : DEFAULT_ROOT
  const plan = planDecision({ textFile: args._[0], args, root })
  const mode = args.write ? 'write' : 'dry-run'
  const summary = { mode, kind: plan.kind, decidedBy: plan.decidedBy, source: plan.source, date: plan.date, row: plan.row, ...(plan.registryEntry ? { registry: `${CTA_REGISTRY} campuses.${plan.campus}.${plan.cta}`, entry: plan.registryEntry, superseded: plan.superseded } : { specRefs: plan.specRefs }), fixture: `${FIXTURE_DIR}/${plan.fixtureFile}`, textSha256: plan.textSha256 }
  if (args.write) summary.written = applyDecision(plan, { root }).written
  else summary.next = 'nothing written; add --write to append the row, write the registry entry and save the fixture, then run npm run validate and npm run build:checks if a row cites the registry'
  io.log(JSON.stringify(summary, null, 2))
  return { plan, summary }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch((error) => {
    if (error instanceof RecordDecisionError) { console.error(`${error.code}: ${error.message}`); process.exit(2) }
    console.error(error.stack || error.message)
    process.exit(3)
  })
}
