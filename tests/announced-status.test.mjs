// tests/announced-status.mjs: page-check announced-names-launch-date following bundle 1.8 campus.intro.status-source
// (2026-09-29: Franklin, dated in HubSpot but unsynced, and Houston Heights, undated, both failed the old month-or-season rule).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { ANNOUNCED_CHECK_ID, DATED_LAUNCH, announcedStatusCheck, hubspotProgramIdFor, readHubSpotProgramDates, subjectNamesCampus } from './announced-status.mjs'
import { pageCheckIds } from './build-checks.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'page-check', 'announced-status-2026-09-29.json'), 'utf8'))
const lifecycle = JSON.parse(fs.readFileSync(path.join(root, 'spec', 'campus-lifecycle.json'), 'utf8'))

/** A fetch stub serving the fixture's HubSpot properties for one Program id. */
const hubspotFetch = (id, properties, status = 200) => async (url) => {
  assert.match(url, new RegExp(`/crm/v3/objects/2-43470849/${id}\\?properties=`))
  return { ok: status === 200, status, json: async () => ({ id, properties }) }
}
const read = async (name, status) => readHubSpotProgramDates(fixture.cases[name].hubspotProgramId, { token: 'test-token', fetchImpl: hubspotFetch(fixture.cases[name].hubspotProgramId, fixture.cases[name].hubspot, status) })

test('Houston Heights (Announced, no launch_date or opening_date): "Alpha Houston is coming soon." passes', async () => {
  const houston = fixture.cases.houston
  const hubspot = await read('houston')
  assert.deepEqual([hubspot.available, hubspot.dated, hubspot.launchDate, hubspot.openingDate], [true, false, null, null])
  const verdict = announcedStatusCheck({ mainText: houston.pageText, campusNames: houston.campusNames, hubspot })
  assert.equal(verdict.result, 'pass', verdict.detail)
  assert.match(verdict.detail, /^Alpha Houston is coming soon; HubSpot Program 26459919662: launch_date empty, opening_date empty, so the undated form applies/)
  // Launch wording with no date behind it is still a defect for an undated Program.
  const launch = announcedStatusCheck({ mainText: 'Alpha Houston Heights is launching in Fall 2027.', campusNames: houston.campusNames, hubspot })
  assert.equal(launch.result, 'fail')
  assert.match(launch.detail, /names a date the Program does not carry .*; an undated Announced campus reads "Alpha Houston Heights is coming soon\."/)
  // Neither wording: fail, naming the expected sentence.
  assert.match(announcedStatusCheck({ mainText: 'Join us for an info session.', campusNames: houston.campusNames, hubspot }).detail, /^expects "Alpha Houston Heights is coming soon\."/)
  // The sentence must be this campus's: another campus's coming-soon line fails.
  const other = announcedStatusCheck({ mainText: 'Alpha Miami is coming soon.', campusNames: houston.campusNames, hubspot })
  assert.equal(other.result, 'fail')
  assert.match(other.detail, /sentence names "Alpha Miami", not this campus \(Alpha Houston Heights \/ Alpha Houston\)/)
  // The lifecycle record points the page check at the Program the decision names.
  assert.equal(hubspotProgramIdFor(lifecycle.campuses.houston), '26459919662')
})

test('Franklin (Announced, opening_date 2027-08-11, page unsynced): "coming soon" fails, the dated sentence passes', async () => {
  const franklin = fixture.cases.franklin
  const hubspot = await read('franklin')
  assert.deepEqual([hubspot.available, hubspot.dated, hubspot.launchDate, hubspot.openingDate], [true, true, null, '2027-08-11'])
  const verdict = announcedStatusCheck({ mainText: franklin.pageText, campusNames: franklin.campusNames, hubspot })
  assert.equal(verdict.result, 'fail')
  assert.match(verdict.detail, /^"Alpha Franklin is coming soon" HubSpot Program 57601909511: launch_date empty, opening_date 2027-08-11; a dated Announced campus names the month or season and year/)
  const synced = announcedStatusCheck({ mainText: 'Alpha Franklin is launching in Fall 2027. Join us for an info session.', campusNames: franklin.campusNames, hubspot })
  assert.equal(synced.result, 'pass')
  assert.equal(synced.detail, 'launching in Fall 2027; HubSpot Program 57601909511: launch_date empty, opening_date 2027-08-11')
  assert.equal(hubspotProgramIdFor(lifecycle.campuses.franklin), '57601909511')
  assert.equal(announcedStatusCheck({ mainText: 'Alpha Franklin opens January 2027.', campusNames: franklin.campusNames, hubspot }).result, 'pass')
})

test('without a HubSpot read, coming soon is an advisory warn (never a failure) and the dated sentence still passes', async () => {
  const noToken = await readHubSpotProgramDates('26459919662', { token: '' })
  assert.deepEqual(noToken, { available: false, note: 'no HubSpot token in env (HUBSPOT_SERVICE_KEY or HUBSPOT_PRIVATE_APP_TOKEN)' })
  for (const hubspot of [noToken, null, await readHubSpotProgramDates(null, { token: 't' }), await read('houston', 403), await readHubSpotProgramDates('1', { token: 't', fetchImpl: async () => { throw new Error('ECONNRESET') } })]) {
    assert.equal(hubspot?.available ?? false, false)
    const houston = announcedStatusCheck({ mainText: fixture.cases.houston.pageText, campusNames: fixture.cases.houston.campusNames, hubspot })
    assert.equal(houston.result, 'warn', houston.detail)
    assert.match(houston.detail, /^Alpha Houston is coming soon: passes only if the Program has neither launch_date nor opening_date .*; HubSpot not read \(.+\), so confirm the dates in HubSpot$/)
    const franklin = announcedStatusCheck({ mainText: fixture.cases.franklin.pageText, campusNames: fixture.cases.franklin.campusNames, hubspot })
    assert.equal(franklin.result, 'warn', 'Franklin reads the same on the page; only HubSpot tells the two apart')
    assert.equal(announcedStatusCheck({ mainText: 'Alpha Franklin is launching in Fall 2027.', campusNames: fixture.cases.franklin.campusNames, hubspot }).result, 'pass')
    const neither = announcedStatusCheck({ mainText: 'Join us for an info session.', campusNames: fixture.cases.franklin.campusNames, hubspot })
    assert.equal(neither.result, 'fail')
    assert.match(neither.detail, /^launch statement must name a month or season and a year, or "Alpha Franklin is coming soon\." for an undated Program; HubSpot not read/)
  }
  assert.match((await read('houston', 403)).note, /^HubSpot 403 reading Program 26459919662 \(token lacks Programs read scopes/)
  assert.match((await readHubSpotProgramDates('1', { token: 't', fetchImpl: async () => { throw new Error('ECONNRESET') } })).note, /^HubSpot read failed: ECONNRESET$/)
})

test('names, the dated pattern, the Program id lookup and the page-check id stay as the bundle and the builder expect', () => {
  assert.equal(subjectNamesCampus('Alpha Houston', ['Alpha Houston Heights']), true, 'a shorter subject that the display name extends')
  assert.equal(subjectNamesCampus('Alpha Houston Heights', ['Alpha Houston']), true)
  assert.equal(subjectNamesCampus('Alpha Houston', ['Alpha Houston Heights', 'Alpha Miami']), true)
  assert.equal(subjectNamesCampus('Alpha Hou', ['Alpha Houston']), false, 'a prefix inside a word is not a name')
  assert.equal(subjectNamesCampus('', ['Alpha Houston']), false)
  for (const text of ['opens January 2027', 'launching in Fall 2027', 'Opening Spring 2027', 'coming Fall 2026']) assert.match(text, DATED_LAUNCH)
  for (const text of ['is coming soon', 'launching soon', 'opens in 2027']) assert.doesNotMatch(text, DATED_LAUNCH)
  assert.equal(hubspotProgramIdFor({ mapPrograms: [{ id: 'program-1' }, { id: 'program-2' }] }), null, 'two Programs on one page: no id, the read is skipped with the note')
  assert.equal(hubspotProgramIdFor({ mapPrograms: [{ id: 'program-1' }, { id: 'program-1' }] }), '1')
  assert.equal(hubspotProgramIdFor({ introStatementException: { hubspotProgramId: '51223157555' }, mapPrograms: [{ id: 'program-9' }] }), '51223157555', 'a decided exception names the Program')
  assert.equal(hubspotProgramIdFor(undefined), null)
  assert.equal(ANNOUNCED_CHECK_ID, 'announced-names-launch-date')
  assert.ok(pageCheckIds().includes('announced-names-launch-date'), 'the builder still extracts the id from page-check.mjs')
  const source = fs.readFileSync(path.join(root, 'tests', 'page-check.mjs'), 'utf8')
  assert.match(source, /checks\.push\(\{ id: 'announced-names-launch-date', \.\.\.announcedStatusCheck\(\{ mainText, campusNames, hubspot \}\) \}\)/)
  assert.match(source, /readHubSpotProgramDates\(hubspotProgramIdFor\(campus\)\)/)
})
