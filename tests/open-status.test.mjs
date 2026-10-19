/**
 * tests/open-status.mjs: the Open-campus enrollment-state rule (check bundle 1.11, MacKenzie Price 2026-10-05).
 * These tests are the pin that keeps the module, the bundle literal and the registry saying the same thing.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  APPROVED_ENROLLING_WORDING,
  APPROVED_WAITLIST_SCHOOL_YEAR,
  APPROVED_WAITLIST_WORDING,
  WAITLIST_LABEL,
  applyControlLabels,
  carriesApprovedWording,
  enrollmentStateControlsCheck,
  openEnrollmentState,
  openStatusCheck,
} from './open-status.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))
const bundle = read('spec/check-bundle.generated.json')
const registry = read('registry/campus-enrollment-state.json')
const statusRow = bundle.rows.find((row) => row.id === 'campus.intro.status-source')
const controlsRow = bundle.rows.find((row) => row.id === 'campus.enrollment-state.controls')
const name = (text, campus = 'Alpha Boston') => text.replace(/<name>/g, campus)

test('the module wordings are byte-identical to the check bundle literal', () => {
  const states = statusRow.literals.openEnrollmentStates.states
  assert.equal(states.waitlist.wording, APPROVED_WAITLIST_WORDING, 'the bundle literal is authoritative; change it there first')
  assert.equal(states.enrolling.wording, APPROVED_ENROLLING_WORDING)
  assert.equal(states.waitlist.schoolYear, APPROVED_WAITLIST_SCHOOL_YEAR)
  assert.equal(statusRow.literals.openEnrollmentStates.default, 'enrolling')
  assert.equal(statusRow.literals.openEnrollmentStates.exclusive, true)
  // mirrored at expected.literal, which is where the observer reads it
  assert.equal(statusRow.expected.literal.openEnrollmentStates.states.waitlist.wording, APPROVED_WAITLIST_WORDING)
})

test('the bundle literal mirrors the registry membership list, and the registry mirrors MacKenzie Price list', () => {
  const fromRegistry = Object.entries(registry.campuses).filter(([, v]) => v.enrollmentState === 'waitlist').map(([k]) => k).sort()
  assert.deepEqual(statusRow.literals.openEnrollmentStates.campuses.waitlist.slice().sort(), fromRegistry)
  assert.equal(fromRegistry.length, 11, 'Plano returned to enrolling on 2026-10-19; Alpha High School is offSite')
  assert.equal(registry.campuses.plano.enrollmentState, 'enrolling')
  assert.equal(registry.campuses.plano.previousEnrollmentState.state, 'waitlist')
  assert.equal(registry.wordings.waitlist.statusSentence, APPROVED_WAITLIST_WORDING)
  assert.equal(registry.decision.decidedBy, 'MacKenzie Price')
  assert.equal(registry.default, 'enrolling')
  assert.equal(registry.derivedFrom, null, 'null until the HubSpot Program property exists')
  // every name in her instruction is accounted for, on the page list or offSite
  const listed = [...Object.values(registry.campuses).map((v) => v.listedAs), ...Object.values(registry.offSite).filter((v) => v && v.listedAs).map((v) => v.listedAs)]
  for (const n of ['Austin High School', 'Boca Raton', 'Boston', 'Dorado', 'New York', 'Palo Alto', 'Park City', 'Plano', 'Raleigh', 'San Francisco', 'Scottsdale', 'The Woodlands', 'Tulsa']) {
    assert.ok(listed.includes(n), `${n} is on MacKenzie Price's list and must be recorded`)
  }
  assert.equal(listed.length, 13)
})

test('the rule still bounds itself: the row says the state is not derivable from HubSpot', () => {
  const notDerivable = statusRow.literals.openEnrollmentStates.notDerivable
  assert.ok(/no hubspot program property records/i.test(notDerivable.problem))
  assert.match(notDerivable.evidence, /campuspipelinestatus|student_capacity/)
  assert.match(notDerivable.ask, /enrollmentStateField/)
  const sources = read('registry/sources.json')
  assert.equal(sources.hubspotPrograms.enrollmentStateField, null)
  assert.match(sources.hubspotPrograms.enrollmentStateFieldAsk.ask, /enrollment_state/)
  assert.equal(sources.hubspotPrograms.enrollmentStateFieldAsk.askedBy, 'Yash Chitneni')
})

test('an Open campus passes on either approved wording', () => {
  assert.equal(openEnrollmentState(name(APPROVED_ENROLLING_WORDING)).state, 'enrolling')
  assert.equal(openEnrollmentState(name(APPROVED_WAITLIST_WORDING)).state, 'waitlist')
  assert.equal(openEnrollmentState(name(APPROVED_WAITLIST_WORDING)).approved, true)
  // HubSpot stores the placeholder, the page renders the name: both match
  assert.ok(carriesApprovedWording(APPROVED_WAITLIST_WORDING.replace('<name>', '[DISPLAY_NAME]')))
})

test('a HTML round trip does not break the verbatim match, and nothing substantive is folded', () => {
  const rendered = name(APPROVED_WAITLIST_WORDING).replace(/’/g, "'").replace(/–/g, '-').replace(/ /g, ' ')
  assert.equal(openEnrollmentState(rendered).state, 'waitlist', 'curly quotes, dashes and nbsp fold')
  assert.equal(openEnrollmentState(name(APPROVED_WAITLIST_WORDING).replace('2026–27', '2025–26')).state, 'waitlist-unapproved', 'a stale school year is a finding')
  assert.equal(openEnrollmentState(name(APPROVED_WAITLIST_WORDING).replace('admissions team', 'enrollment team')).state, 'waitlist-unapproved', 'one changed word is a finding')
  assert.equal(openEnrollmentState('Alpha Boston is open. Join our waitlist for 2026–27.').state, 'waitlist-unapproved', 'a hand-written waitlist sentence is a finding')
  assert.equal(openEnrollmentState('Alpha Boston is open and has a wait list.').state, 'waitlist-unapproved')
})

test('the two states are exclusive, and an absent sentence still fails', () => {
  assert.equal(openEnrollmentState(`${name(APPROVED_ENROLLING_WORDING)} ${name(APPROVED_WAITLIST_WORDING)}`).state, 'contradiction')
  assert.equal(openEnrollmentState('Alpha Boston is open and enrolling. Ask about our waitlist.').state, 'contradiction')
  assert.equal(openEnrollmentState('Welcome to Alpha Boston.').state, 'absent')
  assert.equal(openEnrollmentState('').state, 'absent')
})

test('every other clause of the old rule is still enforced', () => {
  const names = ['Alpha Boston']
  assert.equal(openStatusCheck({ mainText: name(APPROVED_WAITLIST_WORDING), campusNames: names }).result, 'pass')
  assert.equal(openStatusCheck({ mainText: name(APPROVED_ENROLLING_WORDING), campusNames: names }).result, 'pass')
  // the sentence must name this campus (Greenwich, sweep 2026-09-21), on both wordings
  const other = openStatusCheck({ mainText: name(APPROVED_WAITLIST_WORDING, 'Alpha Raleigh'), campusNames: names })
  assert.equal(other.result, 'fail')
  assert.match(other.detail, /names "Alpha Raleigh", not this campus/)
  assert.equal(openStatusCheck({ mainText: 'Alpha Raleigh is open and enrolling.', campusNames: names }).result, 'fail')
  // the pre-2026-10 variants are neither loosened nor tightened
  assert.equal(openStatusCheck({ mainText: 'Alpha Boston is open K-8 for Fall 2026.', campusNames: names }).result, 'pass')
  // and the failure detail names both approved wordings
  assert.match(openStatusCheck({ mainText: 'Welcome to Alpha Boston.', campusNames: names }).detail, /is open and enrolling\.[\s\S]*waitlist/)
})

test('the apply controls are measured in both directions', () => {
  const visible = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const html = '<a href="#resources">Apply for waitlist</a><a href="/application/">Apply for K–8 waitlist</a><a href="/x">Learn more</a>'
  assert.deepEqual(applyControlLabels(html, visible), ['Apply for waitlist', 'Apply for K–8 waitlist'])
  const waitlist = (labels, mainText = '') => enrollmentStateControlsCheck({ recordedState: 'waitlist', labels, mainText })
  const enrolling = (labels, mainText = '') => enrollmentStateControlsCheck({ recordedState: 'enrolling', labels, mainText })
  assert.equal(waitlist(['Apply for waitlist', 'Apply for high school waitlist']).result, 'pass')
  assert.equal(waitlist(['Apply for waitlist', 'Apply now']).result, 'fail', 'a waitlist campus still showing a plain apply control')
  assert.equal(waitlist(['Apply now', 'APPLY TODAY!']).result, 'fail', 'a waitlist campus whose buttons were never changed')
  assert.equal(waitlist(['Join the waitlist']).result, 'fail', 'an unapproved waitlist label')
  assert.equal(enrolling(['Apply now', 'APPLY TODAY!']).result, 'pass')
  assert.equal(enrolling(['Apply for waitlist']).result, 'fail', 'a campus not on the list showing a waitlist control')
  assert.equal(enrolling(['Apply now'], 'Ask us about the waitlist.').result, 'fail', 'waitlist copy on an enrolling campus')
  assert.equal(enrollmentStateControlsCheck({ recordedState: null, labels: [] }).result, 'warn')
  assert.ok(WAITLIST_LABEL.test('Apply for 9th grade waitlist'))
  assert.ok(!WAITLIST_LABEL.test('Apply now'))
})

test('the controls row is in the bundle, enforced, and points at the registry', () => {
  assert.ok(controlsRow, 'campus.enrollment-state.controls is in the bundle')
  assert.equal(controlsRow.observerCheck, 'campus-enrollment-state-controls')
  assert.equal(controlsRow.status, 'enforced')
  assert.deepEqual(controlsRow.lifecycleStates, ['Open'])
  assert.equal(controlsRow.literals.registry, 'registry/campus-enrollment-state.json')
  assert.equal(controlsRow.literals.waitlistLabelPattern, WAITLIST_LABEL.source.replace(/\\\//g, '/'))
  assert.equal(bundle.version, '1.13')
  assert.ok(read('registry/observer-checks.json').families['campus-truth'].includes('campus-enrollment-state-controls'))
})

test('the waitlist cards are recorded with the attachment ids the live pages serve', () => {
  const media = read('registry/campus-open-media.json').campuses
  const expected = { 'boca-raton': 12506, boston: 12507, 'palo-alto': 12508, 'park-city': 12509, 'the-woodlands': 12510, tulsa: 12511 }
  for (const [slug, id] of Object.entries(expected)) {
    assert.equal(media[slug].attachmentId, id, `${slug} waitlist card`)
    assert.equal(media[slug].cardVariant, 'waitlist-2026-27')
    assert.equal(media[slug].enrollmentState, 'waitlist')
  }
  // a waitlist campus with no card is a recorded Missing Info ask, never a silent pass
  for (const slug of ['new-york-city', 'san-francisco', 'scottsdale', 'plano']) {
    assert.equal(media[slug].openMedia, null, `${slug} has no approved intro card`)
    assert.equal(media[slug].status, 'missing')
  }
  for (const slug of ['dorado', 'raleigh']) assert.equal(media[slug].openMedia, 'video')
})
