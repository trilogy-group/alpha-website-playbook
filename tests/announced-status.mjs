/**
 * The Announced-page status sentence for tests/page-check.mjs (`announced-names-launch-date`), following check bundle
 * 1.8 row campus.intro.status-source (Matt Barge, 2026-09-28; spec/campus-lifecycle.json states.Announced.introSentence):
 *
 *   dated    the HubSpot Program has launch_date or opening_date: the sentence names a month or season and a year
 *            ("Alpha Franklin is launching in Fall 2027."); "coming soon" is then a defect.
 *   undated  neither date is set: "<name> is coming soon." passes; launch wording with no date behind it is a defect.
 *   no read  the page check cannot read HubSpot (no HUBSPOT_SERVICE_KEY / HUBSPOT_PRIVATE_APP_TOKEN, or the read
 *            failed): a dated sentence passes as before, "<name> is coming soon." is `warn` with the note that it passes
 *            only for an undated Program, never a failure; neither wording is still a failure.
 *
 * Until 2026-09-29 the check required a month or season and a year on every Announced page, so Franklin ("Alpha
 * Franklin is coming soon.", opening_date 2027-08-11 in HubSpot but page 9626 unsynced) and Houston Heights ("Alpha
 * Houston is coming soon.", no dates) both failed it; only Franklin should.
 */

export const ANNOUNCED_CHECK_ID = 'announced-names-launch-date'
export const DATED_LAUNCH = /(?:opens|launching|opening|coming)\s+(?:in\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December|Fall|Spring|Winter|Summer)\s+20\d\d/i
export const COMING_SOON_SENTENCE = /((?:Alpha|Nova|NextGen)[A-Za-z .'-]{0,60}?)\s+is\s+coming\s+soon\b/i
export const HUBSPOT_PROGRAMS_OBJECT = '2-43470849'
export const HUBSPOT_DATE_FIELDS = Object.freeze(['launch_date', 'opening_date'])

/** The HubSpot Program id (bare) a lifecycle campus record points at, or null when it names none or several. */
export function hubspotProgramIdFor(campus) {
  const decided = campus?.introStatementDecision?.hubspotProgramId ?? campus?.introStatementException?.hubspotProgramId
  if (decided) return String(decided).replace(/^program-/, '')
  const ids = [...new Set((campus?.mapPrograms || []).map((p) => String(p?.id || '').replace(/^program-/, '')).filter(Boolean))]
  return ids.length === 1 ? ids[0] : null
}

/**
 * The Program's launch_date and opening_date: `{ available: true, launchDate, openingDate, dated, note }` or
 * `{ available: false, note }` when there is no token, no Program id, or the read failed. Never throws.
 */
export async function readHubSpotProgramDates(programId, { token = process.env.HUBSPOT_SERVICE_KEY || process.env.HUBSPOT_PRIVATE_APP_TOKEN || '', fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  if (!token) return { available: false, note: 'no HubSpot token in env (HUBSPOT_SERVICE_KEY or HUBSPOT_PRIVATE_APP_TOKEN)' }
  if (!programId) return { available: false, note: 'no HubSpot Program id for this campus in spec/campus-lifecycle.json' }
  try {
    const res = await fetchImpl(`https://api.hubapi.com/crm/v3/objects/${HUBSPOT_PROGRAMS_OBJECT}/${programId}?properties=${encodeURIComponent(['type', ...HUBSPOT_DATE_FIELDS].join(','))}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return { available: false, note: `HubSpot ${res.status} reading Program ${programId}${res.status === 403 ? ' (token lacks Programs read scopes, crm.objects.custom.read)' : ''}` }
    const properties = (await res.json())?.properties || {}
    const launchDate = String(properties.launch_date ?? '').trim() || null
    const openingDate = String(properties.opening_date ?? '').trim() || null
    return { available: true, programId, type: properties.type ?? null, launchDate, openingDate, dated: Boolean(launchDate || openingDate), note: `HubSpot Program ${programId}: launch_date ${launchDate || 'empty'}, opening_date ${openingDate || 'empty'}` }
  } catch (e) { return { available: false, note: `HubSpot read failed: ${e.message}` } }
}

/** Whether a coming-soon subject names this campus: equal to a known name, or one is the other's prefix (Alpha Houston / Alpha Houston Heights). */
export function subjectNamesCampus(subject, campusNames) {
  const s = String(subject || '').trim().toLowerCase()
  if (!s) return false
  return (campusNames || []).some((n) => { const name = String(n || '').trim().toLowerCase(); return name && (name === s || name.startsWith(`${s} `) || s.startsWith(`${name} `)) })
}

/**
 * The check verdict `{ result: 'pass' | 'fail' | 'warn', detail }` for the page-owned text of an Announced page.
 * `hubspot` is the readHubSpotProgramDates result (or null: not read).
 */
export function announcedStatusCheck({ mainText, campusNames = [], hubspot = null }) {
  const text = String(mainText || '')
  const dated = text.match(DATED_LAUNCH)?.[0] || null
  const comingSoon = text.match(COMING_SOON_SENTENCE)
  const subject = comingSoon ? comingSoon[1].trim() : null
  const namesCampus = comingSoon ? (campusNames.length ? subjectNamesCampus(subject, campusNames) : true) : false
  const expectedName = campusNames[0] || 'Alpha <Campus>'
  const read = hubspot?.available ? hubspot : null
  const source = read ? read.note : `HubSpot not read (${hubspot?.note || 'not attempted'})`
  if (read && !read.dated) {
    // Undated Announced: "<name> is coming soon." is the sentence; launch wording with no date behind it is a defect.
    if (comingSoon && namesCampus) return { result: 'pass', detail: `${comingSoon[0].trim()}; ${source}, so the undated form applies (bundle 1.8 campus.intro.status-source)` }
    if (comingSoon) return { result: 'fail', detail: `sentence names "${subject}", not this campus (${campusNames.join(' / ')}); expects "${expectedName} is coming soon." (${source})` }
    if (dated) return { result: 'fail', detail: `"${dated}" names a date the Program does not carry (${source}); an undated Announced campus reads "${expectedName} is coming soon." (bundle 1.8 campus.intro.status-source)` }
    return { result: 'fail', detail: `expects "${expectedName} is coming soon." (${source})` }
  }
  if (dated) return { result: 'pass', detail: `${dated}${read ? `; ${source}` : ''}` }
  if (read) return { result: 'fail', detail: `${comingSoon ? `"${comingSoon[0].trim()}" ` : ''}${source}; a dated Announced campus names the month or season and year the date supports (bundle 1.8 campus.intro.status-source)` }
  if (comingSoon && namesCampus) return { result: 'warn', detail: `${comingSoon[0].trim()}: passes only if the Program has neither launch_date nor opening_date (bundle 1.8 campus.intro.status-source); ${source}, so confirm the dates in HubSpot` }
  if (comingSoon) return { result: 'fail', detail: `sentence names "${subject}", not this campus (${campusNames.join(' / ')}); ${source}` }
  return { result: 'fail', detail: `launch statement must name a month or season and a year, or "${expectedName} is coming soon." for an undated Program; ${source}` }
}
