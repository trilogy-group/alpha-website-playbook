// agent/record-decision.mjs: a decision that arrived by email or Slack becomes the docs/decisions.md row, the registry entry
// (a CTA exception) and a replayable fixture, dry-run by default and never inventing a rule. The validator rule it feeds
// (tests/validate-playbook.mjs validateDecisionRows) is tested here too.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { CTA_REGISTRY, DECISIONS, FIXTURE_DIR, RecordDecisionError, applyDecision, fixtureFor, parseArgs, planDecision, renderRow } from '../agent/record-decision.mjs'
import { DECISION_RULE_SINCE, parseDecisionRows, validateDecisionRows } from './validate-playbook.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NOW = new Date('2026-09-24T18:00:00Z')

/** A throwaway playbook root with the files the script reads and writes, copied from the repository. */
function scratchRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-record-decision-'))
  for (const relative of [CTA_REGISTRY, 'registry/campus-pages.json', DECISIONS, 'spec/campus-page-controls.json']) {
    fs.mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true })
    fs.copyFileSync(path.join(root, relative), path.join(dir, relative))
  }
  const text = path.join(dir, 'decision.txt')
  fs.writeFileSync(text, 'From: a campus lead\nSubject: Nashville calendar\n\nPlease take the calendar button off the Nashville page until the 2026-27 calendar is approved.\n')
  return { dir, text }
}

const ctaArgs = (text, extra = {}) => ({ _: [text], 'decided-by': 'Matt Barge', source: 'email relayed 2026-09-24', date: '2026-09-24', campus: 'nashville', cta: 'calendar', rule: 'hidden', reason: 'no calendar button until the 2026-27 calendar is approved', expires: '2026-12-31', ...extra })

test('record-decision: plans a CTA exception from the flags, never from the message, and refuses what it cannot know', () => {
  const { dir, text } = scratchRoot()
  const plan = planDecision({ textFile: text, args: ctaArgs(text), root: dir, now: NOW })
  assert.equal(plan.kind, 'cta-exception')
  assert.deepEqual([plan.campus, plan.campusName, plan.cta, plan.rule, plan.expires], ['nashville', 'Alpha Nashville', 'calendar', 'hidden', '2026-12-31'])
  assert.equal(plan.row, '| 2026-09-24 | Decided (Matt Barge, email relayed 2026-09-24): Alpha Nashville (https://alpha.school/nashville/): Calendar CTA hidden; no calendar button until the 2026-27 calendar is approved; ends 2026-12-31 | Matt Barge | registry/campus-cta-exceptions.json campuses.nashville.calendar; tests/fixtures/decisions/recorded/2026-09-24-nashville-calendar.json |')
  assert.deepEqual(plan.registryEntry, { rule: 'hidden', reason: 'no calendar button until the 2026-27 calendar is approved', decidedBy: 'Matt Barge', source: 'email relayed 2026-09-24', decidedOn: '2026-09-24', expires: '2026-12-31', note: `Recorded with agent/record-decision.mjs on 2026-09-24 from the email relayed 2026-09-24 text (sha256 ${plan.textSha256.slice(0, 12)}).`, decisionFixture: 'tests/fixtures/decisions/recorded/2026-09-24-nashville-calendar.json' })
  assert.match(plan.textSha256, /^[0-9a-f]{64}$/)
  const fixture = fixtureFor(plan)
  assert.equal(fixture.text, fs.readFileSync(text, 'utf8'), 'the message is kept verbatim')
  assert.equal(fixture.decisionRow, plan.row)
  assert.deepEqual(validateDecisionRows(`${fs.readFileSync(path.join(dir, DECISIONS), 'utf8')}\n${plan.row}\n`), [], 'the row the script writes satisfies the validator')
  // Nothing is derived from the text: the rule and the reason must be given; lifecycle:Open and none are the other expiries; the rest is checked.
  const fails = (extra, code, pattern) => assert.throws(() => planDecision({ textFile: text, args: ctaArgs(text, extra), root: dir, now: NOW }), (e) => e instanceof RecordDecisionError && e.code === code && (!pattern || pattern.test(e.message)), `${code} for ${JSON.stringify(extra)}`)
  fails({ rule: undefined }, 'MISSING_RULE', /never infers the rule/)
  fails({ reason: undefined }, 'MISSING_REASON')
  fails({ rule: 'sometimes' }, 'BAD_RULE')
  fails({ cta: 'newsletter' }, 'BAD_CTA')
  fails({ campus: 'atlantis' }, 'BAD_CAMPUS')
  fails({ date: '24 Sep 2026' }, 'BAD_DATE')
  fails({ expires: 'soon' }, 'BAD_EXPIRES')
  fails({ rule: 'destination' }, 'MISSING_DESTINATION')
  fails({ reason: 'a | b' }, 'BAD_TEXT', /pipe/)
  fails({ reason: 'a — b' }, 'BAD_TEXT', /em dash/)
  fails({ 'decided-by': undefined }, 'MISSING_ARG', /--decided-by/)
  fails({ 'spec-ref': 'spec/site-rules.json' }, 'MISSING_ARG', /not both/)
  fails({ campus: 'boston-suburbs', cta: 'book-a-call' }, 'EXISTS', /pass --replace/)
  assert.equal(planDecision({ textFile: text, args: ctaArgs(text, { expires: 'lifecycle:Open' }), root: dir, now: NOW }).expires, 'lifecycle:Open')
  assert.equal(planDecision({ textFile: text, args: ctaArgs(text, { expires: 'none' }), root: dir, now: NOW }).expires, null)
  assert.match(planDecision({ textFile: text, args: ctaArgs(text, { expires: undefined }), root: dir, now: NOW }).summary, /standing until revoked$/)
  const replaced = planDecision({ textFile: text, args: ctaArgs(text, { campus: 'boston-suburbs', cta: 'book-a-call', replace: true }), root: dir, now: NOW })
  assert.equal(replaced.superseded.decidedOn, '2026-09-24')
  assert.match(replaced.summary, /\(supersedes the 2026-09-24 entry\)$/)
  const destination = planDecision({ textFile: text, args: ctaArgs(text, { rule: 'destination', destination: 'https://alpha.school/upcoming-events/?event_school=alpha-nashville' }), root: dir, now: NOW })
  assert.equal(destination.registryEntry.destination, 'https://alpha.school/upcoming-events/?event_school=alpha-nashville')
  assert.match(destination.summary, /Calendar CTA destination to https:\/\/alpha\.school\/upcoming-events\/\?event_school=alpha-nashville; /)
  assert.throws(() => planDecision({ textFile: path.join(dir, 'missing.txt'), args: ctaArgs(text), root: dir, now: NOW }), (e) => e.code === 'MISSING_TEXT')
  fs.writeFileSync(path.join(dir, 'empty.txt'), '  \n')
  assert.throws(() => planDecision({ textFile: path.join(dir, 'empty.txt'), args: ctaArgs(text), root: dir, now: NOW }), (e) => e.code === 'MISSING_TEXT')
  assert.throws(() => planDecision({ textFile: null, args: {}, root: dir, now: NOW }), (e) => e.code === 'MISSING_ARG' && /Usage/.test(e.message))
})

test('record-decision: a --spec-ref decision writes the row and the fixture with the summary a person gave', () => {
  const { dir, text } = scratchRoot()
  const args = { _: [text], 'decided-by': 'Matt Barge', source: 'Slack #support-websites 2026-09-24', date: '2026-09-24', 'spec-ref': 'spec/campus-page-controls.json hero.book-a-call, registry/campus-pages.json', summary: 'Book a Call destinations come from HubSpot call_scheduling_link' }
  const plan = planDecision({ textFile: text, args, root: dir, now: NOW })
  assert.equal(plan.kind, 'spec-ref')
  assert.deepEqual(plan.specRefs, ['spec/campus-page-controls.json hero.book-a-call', 'registry/campus-pages.json'])
  assert.equal(plan.registryEntry, null)
  assert.match(plan.row, /^\| 2026-09-24 \| Decided \(Matt Barge, Slack #support-websites 2026-09-24\): Book a Call destinations come from HubSpot call_scheduling_link \| Matt Barge \| spec\/campus-page-controls\.json hero\.book-a-call; registry\/campus-pages\.json; tests\/fixtures\/decisions\/recorded\/2026-09-24-campus-page-controls-[0-9a-f]{8}\.json \|$/)
  assert.throws(() => planDecision({ textFile: text, args: { ...args, summary: undefined }, root: dir, now: NOW }), (e) => e.code === 'MISSING_SUMMARY')
  assert.throws(() => planDecision({ textFile: text, args: { ...args, 'spec-ref': 'docs/decisions.md' }, root: dir, now: NOW }), (e) => e.code === 'BAD_SPEC_REF' && /spec\/ or registry\//.test(e.message))
  assert.throws(() => planDecision({ textFile: text, args: { ...args, 'spec-ref': 'spec/no-such-file.json' }, root: dir, now: NOW }), (e) => e.code === 'BAD_SPEC_REF' && /does not exist/.test(e.message))
  assert.throws(() => planDecision({ textFile: text, args: { ...args, campus: 'nashville' }, root: dir, now: NOW }), (e) => e.code === 'MISSING_ARG')
  const applied = applyDecision(plan, { root: dir })
  assert.deepEqual(applied.written, [DECISIONS, `${FIXTURE_DIR}/${plan.fixtureFile}`])
  assert.ok(fs.readFileSync(path.join(dir, DECISIONS), 'utf8').endsWith(`${plan.row}\n`))
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, CTA_REGISTRY), 'utf8')).campuses.nashville, undefined, 'a spec-ref decision touches no registry')
})

test('record-decision: the CLI is a dry run by default and --write appends the row, writes the entry and saves the fixture once', () => {
  const { dir, text } = scratchRoot()
  const before = { decisions: fs.readFileSync(path.join(dir, DECISIONS), 'utf8'), registry: fs.readFileSync(path.join(dir, CTA_REGISTRY), 'utf8') }
  const cli = (extra = []) => spawnSync(process.execPath, ['agent/record-decision.mjs', text, '--decided-by', 'Matt Barge', '--source', 'email relayed 2026-09-24', '--date', '2026-09-24', '--campus', 'nashville', '--cta', 'calendar', '--rule', 'hidden', '--reason', 'no calendar button until the 2026-27 calendar is approved', '--expires', '2026-12-31', '--root', dir, ...extra], { cwd: root, encoding: 'utf8' })
  const dry = cli()
  assert.equal(dry.status, 0, dry.stderr)
  const summary = JSON.parse(dry.stdout)
  assert.equal(summary.mode, 'dry-run')
  assert.equal(summary.registry, 'registry/campus-cta-exceptions.json campuses.nashville.calendar')
  assert.match(summary.next, /^nothing written; add --write/)
  assert.equal(fs.readFileSync(path.join(dir, DECISIONS), 'utf8'), before.decisions)
  assert.equal(fs.readFileSync(path.join(dir, CTA_REGISTRY), 'utf8'), before.registry)
  assert.ok(!fs.existsSync(path.join(dir, FIXTURE_DIR)))
  const write = cli(['--write'])
  assert.equal(write.status, 0, write.stderr)
  const written = JSON.parse(write.stdout)
  assert.deepEqual(written.written, [DECISIONS, CTA_REGISTRY, `${FIXTURE_DIR}/2026-09-24-nashville-calendar.json`])
  const registry = JSON.parse(fs.readFileSync(path.join(dir, CTA_REGISTRY), 'utf8'))
  assert.deepEqual(registry.campuses.nashville.calendar, written.entry)
  assert.equal(registry.campuses['boston-suburbs']['book-a-call'].rule, 'hidden', 'other entries are untouched')
  const rows = parseDecisionRows(fs.readFileSync(path.join(dir, DECISIONS), 'utf8'))
  assert.equal(rows.at(-1).line, written.row)
  const fixture = JSON.parse(fs.readFileSync(path.join(dir, FIXTURE_DIR, '2026-09-24-nashville-calendar.json'), 'utf8'))
  assert.equal(fixture.kind, 'cta-exception')
  assert.equal(fixture.text, fs.readFileSync(text, 'utf8'))
  assert.deepEqual(fixture.registryEntry, written.entry)
  const again = cli(['--write'])
  assert.equal(again.status, 2)
  assert.match(again.stderr, /^EXISTS: registry\/campus-cta-exceptions\.json already has campuses\.nashville\.calendar/)
  const noRule = spawnSync(process.execPath, ['agent/record-decision.mjs', text, '--decided-by', 'Matt Barge', '--source', 'email', '--date', '2026-09-24', '--campus', 'nashville', '--cta', 'packet', '--reason', 'x', '--root', dir], { cwd: root, encoding: 'utf8' })
  assert.equal(noRule.status, 2)
  assert.match(noRule.stderr, /^MISSING_RULE: --rule is required/)
  const usage = spawnSync(process.execPath, ['agent/record-decision.mjs'], { cwd: root, encoding: 'utf8' })
  assert.equal(usage.status, 2)
  assert.match(usage.stderr, /^MISSING_ARG: Usage: record-decision\.mjs/)
  assert.deepEqual(parseArgs(['a.txt', '--write', '--campus', 'x']), { _: ['a.txt'], write: true, campus: 'x' })
})

test('record-decision: the committed Lexington decision replays from its fixture and the validator rule holds', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, FIXTURE_DIR, '2026-09-24-boston-suburbs-book-a-call.json'), 'utf8'))
  const registry = JSON.parse(fs.readFileSync(path.join(root, CTA_REGISTRY), 'utf8'))
  assert.deepEqual(registry.campuses['boston-suburbs']['book-a-call'], fixture.registryEntry)
  assert.deepEqual([fixture.decidedBy, fixture.source, fixture.rule, fixture.expires], ['Matt Barge', 'email relayed 2026-09-24', 'hidden', 'lifecycle:Open'])
  const decisions = fs.readFileSync(path.join(root, DECISIONS), 'utf8')
  assert.ok(decisions.includes(fixture.decisionRow), 'the row is in docs/decisions.md')
  assert.deepEqual(validateDecisionRows(decisions), [])
  assert.equal(DECISION_RULE_SINCE, '2026-09-24')
  const header = '| Date | Decision | By | Applied in |\n| --- | --- | --- | --- |\n'
  const decided = (date, applied) => renderRow({ date, decision: 'Decided (Matt Barge): something', by: 'Matt Barge', applied })
  assert.deepEqual(validateDecisionRows(`${header}${decided('2026-09-24', 'protocols/apex-website-ticket-protocol.md 1c')}\n`).length, 1, 'a Decided row on or after 2026-09-24 must cite spec/ or registry/')
  assert.deepEqual(validateDecisionRows(`${header}${decided('2026-09-25', 'registry/campus-cta-exceptions.json campuses.x.y')}\n`), [])
  assert.deepEqual(validateDecisionRows(`${header}${decided('2026-09-25', 'spec/check-rows.json rows')}\n`), [])
  assert.deepEqual(validateDecisionRows(`${header}${decided('2026-09-23', 'protocol step 7')}\n`), [], 'older rows are exempt')
  assert.deepEqual(validateDecisionRows(`${header}${renderRow({ date: '2026-09-25', decision: 'Applied (workstream): x', by: 'Matt Barge', applied: 'agent/intake.mjs' })}\n`), [], 'only Decided rows are held to it')
  assert.deepEqual(validateDecisionRows(`${header}${renderRow({ date: '2026-09-25', decision: 'Proposed, awaiting Matt: x', by: 'Matt Barge', applied: 'docs/x.md' })}\n`), [])
  assert.equal(parseDecisionRows(header).length, 0)
  assert.equal(execFileSync(process.execPath, ['tests/validate-playbook.mjs'], { cwd: root, encoding: 'utf8' }).includes('"ok": true'), true)
})
