/**
 * The Open-page status sentence for tests/page-check.mjs (`open-status-sentence`) and tests/site-truth-report.mjs,
 * following check bundle 1.11 row `campus.intro.status-source` literals.openEnrollmentStates (decided by MacKenzie
 * Price, relayed and confirmed by Matt Barge on 2026-10-05; fixture
 * tests/fixtures/decisions/recorded/2026-10-05-campus-lifecycle-a23bc113.json).
 *
 * An Open campus has two named enrollment states, and `type` stays Open for both:
 *
 *   enrolling  "<name> is open and enrolling." (the sentence clause; the long-standing wording)
 *   waitlist   the approved sentence pair, verbatim:
 *              "<name> is open, and we’re accepting applications for our 2026–27 waitlist. Apply for future
 *               enrollment, and our admissions team will guide you through the next steps."
 *
 * Why this is matched verbatim and not by the word "waitlist". No HubSpot Program property records which state a
 * campus is in: `campuspipelinestatus` and `student_capacity` both cut straight across the two groups (read
 * 2026-10-05: Transitioned on 5 waitlist and 10 enrolling campuses, Build Mode on 5 and 12; capacity 21-195 against
 * 10-193). The only signal that a campus is full is the hand-typed sentence itself, so the check cannot tell a full
 * campus still advertising enrolment from a correct one, nor a reopened campus still saying waitlist. That is the
 * 2026-09-28 defect class again: a hand-typed field silently contradicting the Program state. Until the property
 * exists (`registry/sources.json` hubspotPrograms.enrollmentStateField, null with the ask), the rule is made as
 * strong as the data allows: only the approved wording is accepted, the approved school year is part of it, the two
 * states may not both appear, and any other waitlist language is a finding.
 */

/** The enrolling clause, name-agnostic (HubSpot stores "[DISPLAY_NAME] is open and enrolling."). */
export const ENROLLING_CLAUSE = /\bis\s+open\s+and\s+enrolling\b/i
/**
 * Open-state wordings page-check has accepted since 2026-09-18 besides the enrolling clause (Charlotte "is open K-8",
 * Chantilly "open and enrolling for the 2026-27 school year", a "is now open" rewording). Kept as they were: this
 * change adds the waitlist state, it does not loosen or tighten the pre-existing variants.
 */
export const ENROLLING_VARIANTS = [/\bis\s+now\s+open\b/i, /\bis\s+open\s+K-/i, /\bopen\s+and\s+enrolling\s+for\s+the\b/i]
/** Any waitlist language at all. Present without the approved wording, it is a finding, never a pass. */
export const WAITLIST_MENTION = /\bwait[\s -]?lists?(?:ed|ing)?\b/i

/** The approved waitlist wording, `<name>` standing for the campus display name. Keep byte-identical to the bundle literal. */
export const APPROVED_WAITLIST_WORDING = '<name> is open, and we’re accepting applications for our 2026–27 waitlist. Apply for future enrollment, and our admissions team will guide you through the next steps.'
/** The approved school year inside that wording; a stale year is a finding, not a pass. */
export const APPROVED_WAITLIST_SCHOOL_YEAR = '2026–27'
export const APPROVED_ENROLLING_WORDING = '<name> is open and enrolling.'

/**
 * Fold only what a HTML round trip changes: curly quotes, dashes, non-breaking spaces, collapsed whitespace, case.
 * Nothing substantive, so "2026-27" still has to be the approved year and every word still has to be the approved word.
 */
export function foldWording(value) {
  return String(value ?? '')
    .replace(/[‘’ʼ′]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * The approved wording with its `<name>` subject dropped, so it matches both the HubSpot field (which still carries
 * the `[DISPLAY_NAME]` token) and the rendered page (which carries the campus name). The subject is checked
 * separately, by the caller that knows which campus it is looking at.
 */
export function wordingNeedle(wording = APPROVED_WAITLIST_WORDING) {
  return foldWording(String(wording).replace(/^\s*(?:<name>|\[DISPLAY_NAME\])\s*/i, ''))
}

/** Whether `text` carries the approved wording verbatim (typography folded, subject wildcard). */
export function carriesApprovedWording(text, wording = APPROVED_WAITLIST_WORDING) {
  const needle = wordingNeedle(wording)
  return Boolean(needle) && foldWording(text).includes(needle)
}

/**
 * The enrollment state an Open campus's text claims, and whether it is approved:
 *
 *   `{ state: 'waitlist',  approved: true  }`  the approved waitlist wording, and no enrolling claim beside it
 *   `{ state: 'enrolling', approved: true  }`  an accepted open-state wording, and no waitlist language beside it
 *   `{ state: 'contradiction', approved: false }`  both states claimed at once
 *   `{ state: 'waitlist-unapproved', approved: false }`  waitlist language that is not the approved wording
 *   `{ state: 'absent', approved: false }`  no open-state sentence at all
 *
 * `wording` overrides the approved waitlist wording (the check bundle literal, so the bundle stays authoritative).
 */
export function openEnrollmentState(text, { waitlistWording = APPROVED_WAITLIST_WORDING, variants = ENROLLING_VARIANTS } = {}) {
  const value = String(text ?? '')
  if (!value.trim()) return { state: 'absent', approved: false, detail: 'no text' }
  const waitlist = carriesApprovedWording(value, waitlistWording)
  const mentionsWaitlist = WAITLIST_MENTION.test(value)
  const enrolling = ENROLLING_CLAUSE.test(value) || variants.some((re) => re.test(value))
  if (waitlist && enrolling) return { state: 'contradiction', approved: false, detail: 'the intro claims both the waitlist state and the enrolling state' }
  if (waitlist) return { state: 'waitlist', approved: true, detail: 'the approved waitlist sentence' }
  if (mentionsWaitlist && !enrolling) return { state: 'waitlist-unapproved', approved: false, detail: 'waitlist language that is not the approved waitlist sentence' }
  if (mentionsWaitlist) return { state: 'contradiction', approved: false, detail: 'an enrolling sentence with waitlist language beside it' }
  if (enrolling) return { state: 'enrolling', approved: true, detail: 'an open and enrolling sentence' }
  return { state: 'absent', approved: false, detail: 'no open-state sentence' }
}

/** The expected wording to print for a campus, both states named. */
export function expectedOpenWordings(name, waitlistWording = APPROVED_WAITLIST_WORDING) {
  const subject = name || 'Alpha <Campus>'
  return `"${APPROVED_ENROLLING_WORDING.replace('<name>', subject)}" or the approved waitlist sentence "${String(waitlistWording).replace(/<name>/g, subject)}"`
}

/**
 * The `open-status-sentence` verdict for the page-owned text of an Open page: `{ result, detail, state }`.
 * `campusNames` are the names this campus may be called; the sentence must name one of them, as it has since the
 * 2026-09-21 Greenwich rename.
 */
export function openStatusCheck({ mainText, campusNames = [], waitlistWording = APPROVED_WAITLIST_WORDING }) {
  const text = String(mainText ?? '')
  const evaluated = openEnrollmentState(text, { waitlistWording })
  const sentence = text.match(/((?:Alpha|Nova|NextGen)[A-Za-z .'’-]{0,60}?) (?:is open and enrolling\.|is open, and we|is now open|is open K-|open and enrolling for the)/i)
  const subject = sentence ? sentence[1].trim() : null
  const namesThisCampus = subject ? campusNames.some((n) => subject.toLowerCase() === String(n).toLowerCase()) : false
  if (!evaluated.approved) {
    return { result: 'fail', state: evaluated.state, detail: `${evaluated.detail}; expects ${expectedOpenWordings(campusNames[0], waitlistWording)}` }
  }
  if (!namesThisCampus) {
    return { result: 'fail', state: evaluated.state, detail: subject ? `sentence names "${subject}", not this campus (${campusNames.join(' / ')})` : `no sentence names this campus (${campusNames.join(' / ')})` }
  }
  return { result: 'pass', state: evaluated.state, detail: `${sentence[0].trim()} (${evaluated.state} state${evaluated.state === 'waitlist' ? `, approved wording, school year ${APPROVED_WAITLIST_SCHOOL_YEAR}` : ''})` }
}

/* --------------------------------------------------------------------------------------------------------------- *
 * The rest of the coordinated state: the apply controls (bundle 1.11 row campus.enrollment-state.controls).
 * The waitlist state is four elements, not one sentence (Yash Chitneni, 2026-10-05): the intro sentence, the top
 * banner application button, the resources-section application buttons, and the intro card. The sentence is
 * `open-status-sentence` above and the card is `open-intro-media-approved`; the two apply controls are here.
 * --------------------------------------------------------------------------------------------------------------- */

export const CONTROLS_CHECK_ID = 'open-enrollment-state-controls'
/** An approved waitlist apply label: "Apply for waitlist", or with the segment a multi-program campus names. */
export const WAITLIST_LABEL = /^\s*apply\s+for\s+(?:[A-Za-z0-9–—/&+.’' -]{1,32}\s+)?waitlist\s*$/i

/** Apply-control labels in page-owned HTML: every anchor or button whose text mentions applying or a waitlist. */
export function applyControlLabels(mainHtml, visibleText) {
  const labels = []
  for (const match of String(mainHtml ?? '').matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const label = visibleText(match[2]).trim()
    if (label && /\bappl(?:y|ication|ications)\b|\bwait[\s -]?list/i.test(label)) labels.push(label)
  }
  return labels
}

/**
 * The `open-enrollment-state-controls` verdict `{ result, detail }` for an Open campus whose recorded enrollment state
 * is `recordedState` ('waitlist' or 'enrolling'; an unlisted campus is enrolling). Measured in both directions:
 * a waitlist campus must carry waitlist labels and no plain apply label, an enrolling campus must carry no waitlist
 * label and no waitlist copy. `null` recordedState skips the check (nothing recorded, nothing to measure against).
 */
export function enrollmentStateControlsCheck({ recordedState, labels = [], mainText = '' }) {
  const state = recordedState === 'waitlist' ? 'waitlist' : recordedState === 'enrolling' ? 'enrolling' : null
  if (!state) return { result: 'warn', detail: 'no enrollment state recorded for this campus in registry/campus-enrollment-state.json' }
  const approved = labels.filter((label) => WAITLIST_LABEL.test(label))
  const waitlistish = labels.filter((label) => WAITLIST_MENTION.test(label))
  const unapproved = waitlistish.filter((label) => !WAITLIST_LABEL.test(label))
  const plain = labels.filter((label) => !WAITLIST_MENTION.test(label))
  const copyMentions = WAITLIST_MENTION.test(mainText)
  if (state === 'waitlist') {
    const problems = []
    if (!approved.length) problems.push('no apply control reads "Apply for waitlist"')
    if (plain.length) problems.push(`apply controls still read ${plain.map((l) => JSON.stringify(l)).join(', ')}`)
    if (unapproved.length) problems.push(`unapproved waitlist labels ${unapproved.map((l) => JSON.stringify(l)).join(', ')}`)
    return problems.length
      ? { result: 'fail', detail: `recorded waitlist: ${problems.join('; ')}` }
      : { result: 'pass', detail: `recorded waitlist: ${approved.length} waitlist apply control(s) ${approved.map((l) => JSON.stringify(l)).join(', ')}, no plain apply control` }
  }
  const problems = []
  if (waitlistish.length) problems.push(`apply controls read ${waitlistish.map((l) => JSON.stringify(l)).join(', ')}`)
  if (copyMentions) problems.push('page-owned copy mentions a waitlist')
  return problems.length
    ? { result: 'fail', detail: `recorded enrolling: ${problems.join('; ')}; a campus not on the waitlist list carries no waitlist wording` }
    : { result: 'pass', detail: `recorded enrolling: ${labels.length} apply control(s), none mentioning a waitlist, no waitlist copy` }
}
