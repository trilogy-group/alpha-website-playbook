#!/usr/bin/env node
/**
 * Ring 2 page check for alpha.school campus pages (protocol step 5), agent-independent.
 *
 *   node tests/page-check.mjs --url https://alpha.school/atlanta/ [--url ...] [--state Open] [--json out.json]
 *                             [--playwright <dir>] [--skip-rendered]
 *
 * Fetches the canonical public URL as a visitor (no cache-busting), then checks the rendered HTML:
 *   structure  header template linked to its stylesheet, footer present, H1, hero CTA row, intro section
 *   state      Open pages carry no launch-era words; Announced pages name a month or season and year when the HubSpot
 *              Program has launch_date or opening_date, and read "<name> is coming soon." when it has neither
 *              (bundle 1.8 campus.intro.status-source; tests/announced-status.mjs reads the Program with
 *              HUBSPOT_SERVICE_KEY or HUBSPOT_PRIVATE_APP_TOKEN; without a token "coming soon" is warn, not fail)
 *   identity   no sister-brand words; no other campus named in image file names or alt text
 *   links      every hero/resource CTA resolves (HEAD/GET 2xx, no cross-host surprises)
 *   media      intro card slot is an approved card, a video, or flagged
 *   sync       the CSS IDs the n8n workflow writes are still present (a layout change that drops one breaks the daily sync)
 * Then one rendered check in a real browser on desktop (1440x1000) and mobile (390x844):
 *   framing    team-photo-framing: no team-card image (leadership row and carousel slides, lazy loading forced
 *              eager) has the top of its portrait cut off by its object-fit: cover box, which is where a head sits
 *              (Jason Tan, San Francisco, 2026-09-22). A top-anchored portrait cropped only at the bottom passes;
 *              the check stopped judging how much of the file the box uses on 2026-10-01. Math in
 *              tests/photo-framing.mjs.
 *              Playwright is borrowed like rendered-controls.mjs does (--playwright <dir>, PLAYWRIGHT_ROOT, or the
 *              sibling aeo checkout); without it the check is reported as skipped, never as passed. --skip-rendered
 *              skips it on purpose (ring 3 header and footer checks on untouched pages do not need a browser).
 *   brand      brand-visual: computed font-family is Montserrat on every text element (icon fonts and the allowlisted
 *              embeds in spec/brand-visual.json listed as allowed), no "never" contrast pair from the brand guide's
 *              table (sky blue on white, white on sky or light blue at body size), off-palette large fields and
 *              headline colours (INFO), and every logo image classified against playbook/brand/assets (INFO).
 *              Maths in tests/brand-visual.mjs. Advisory on the first version: fail-severity findings make the row
 *              `warn`, listed and not counted in the exit code, until spec check.enforcement.mode is enforced.
 * Screenshots are still required by the protocol; this script covers the text, structure, and framing part.
 * Exit code 1 when any check fails.
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadChromium, SectionShotError } from './section-shot.mjs'
import { measureTeamCards, teamPhotoFramingCheck } from './photo-framing.mjs'
import { CHECK_ID as BRAND_CHECK_ID, brandVisualCheck, loadBrandVisual, measureBrandVisual } from './brand-visual.mjs'
import { announcedStatusCheck, hubspotProgramIdFor, readHubSpotProgramDates } from './announced-status.mjs'
import { APPROVED_WAITLIST_WORDING, WAITLIST_LABEL, applyControlLabels, enrollmentStateControlsCheck, openStatusCheck } from './open-status.mjs'

const here = path.dirname(new URL(import.meta.url).pathname)
const brandVisual = loadBrandVisual()
const lifecycle = JSON.parse(fs.readFileSync(path.join(here, '../spec/campus-lifecycle.json'), 'utf8'))
const media = JSON.parse(fs.readFileSync(path.join(here, '../registry/campus-open-media.json'), 'utf8'))
const campusPages = JSON.parse(fs.readFileSync(path.join(here, '../registry/campus-pages.json'), 'utf8')).campuses
const syncedTargets = JSON.parse(fs.readFileSync(path.join(here, '../spec/synced-targets.json'), 'utf8'))
// Bundle 1.11 row campus.enrollment-state.controls: which Open campuses are on the waitlist, from MacKenzie Price's
// 2026-10-05 named list. The checks measure each page against this list, never against the copy on the page itself.
const enrollmentStates = JSON.parse(fs.readFileSync(path.join(here, '../registry/campus-enrollment-state.json'), 'utf8'))

const brandExceptions = fs.existsSync(path.join(here, '..', 'registry', 'sister-brand-exceptions.json')) ? JSON.parse(fs.readFileSync(path.join(here, '..', 'registry', 'sister-brand-exceptions.json'), 'utf8')) : { properNouns: [], campuses: {} }
const SISTER_BRANDS = [/\bNova\b/, /\bNextGen(?:\s+Academy)?\b/, /\bWaypoint(?:\s+Academy)?\b/, /\b(?:Texas\s+Sports\s+Academy|TSA)\b/]
const LAUNCH_WORDS = [/\bComing\s+Soon\b/i, /\bComing\s+(?:Fall|Spring|Winter|Summer)\b/i, /\bis\s+launching\b/i, /\bLaunching\s+(?:in\s+)?(?:Fall|Spring|Winter|Summer)\b/i, /\bOpening\s+(?:Fall|Spring|Winter|Summer)\b/i]
const UA = 'alpha-website-playbook-page-check/0.1 (read-only)'

const args = parse(process.argv.slice(2))
const urls = [].concat(args.url || [])
if (!urls.length) { console.error('Usage: page-check.mjs --url <canonical url> [--url ...] [--state Open|Announced] [--json out.json] [--playwright <dir>] [--skip-rendered]'); process.exit(2) }

// Rendered checks need a browser. Resolve it once; a missing Playwright makes every rendered check "skipped" with the
// reason, so a run without a browser never reads as a pass on framing.
let chromium = null
let renderedSkipReason = args['skip-rendered'] ? 'skipped on request (--skip-rendered)' : null
if (!renderedSkipReason) { try { chromium = loadChromium(args) } catch (e) { renderedSkipReason = e instanceof SectionShotError ? e.message.split('\n')[0] : e.message } }

const results = []
for (const url of urls) results.push(await checkPage(url, args.state))
if (args.json) fs.writeFileSync(args.json, `${JSON.stringify(results, null, 2)}\n`)
for (const r of results) {
  const fails = r.checks.filter((c) => c.result === 'fail')
  const warns = r.checks.filter((c) => c.result === 'warn')
  const skips = r.checks.filter((c) => c.result === 'skipped')
  console.log(`${fails.length ? 'FAIL' : 'PASS'}  ${r.url}  state=${r.state}  ${r.checks.length} checks, ${fails.length} failing${fails.length ? ': ' + fails.map((c) => c.id).join(', ') : ''}${warns.length ? `, ${warns.length} warning: ${warns.map((c) => c.id).join(', ')}` : ''}${skips.length ? `, ${skips.length} skipped: ${skips.map((c) => c.id).join(', ')}` : ''}`)
  for (const c of fails) console.log(`      ${c.id}: ${c.detail}`)
  for (const c of warns) console.log(`      ${c.id}: warn, ${c.detail}`)
  for (const c of skips) console.log(`      ${c.id}: skipped, ${c.detail}`)
}
process.exitCode = results.some((r) => r.checks.some((c) => c.result === 'fail')) ? 1 : 0
// Keep-alive sockets from the destination checks held the event loop open after the last page; exit explicitly.
process.exit(process.exitCode)

async function checkPage(url, stateOverride) {
  const slug = new URL(url).pathname.replace(/^\/+|\/+$/g, '')
  const campus = lifecycle.campuses[slug]
  const state = stateOverride || campus?.lifecycle || 'unknown'
  const checks = []
  const add = (id, ok, detail = '') => checks.push({ id, result: ok ? 'pass' : 'fail', detail })
  let html = ''
  let status = 0
  let headers = {}
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(30_000) })
    status = res.status
    headers = Object.fromEntries(res.headers.entries())
    html = status === 200 ? await res.text() : ''
  } catch (e) { add('page-reachable', false, e.message); return { url, slug, state, checks } }
  add('page-reachable', status === 200, `HTTP ${status}`)
  if (status !== 200) return { url, slug, state, checks }
  // Edge cache currency: the plain URL above is what a visitor gets (Cloudflare and WP Engine may serve a cached copy);
  // rendered checks bypass that cache with ?nocache. Compare the page-owned element ids of both fetches so a stale
  // edge copy after an edit fails here instead of hiding behind the bypass (Southlake, 2026-09-18).
  try {
    const fresh = await fetch(url + (url.includes('?') ? '&' : '?') + 'nocache=' + Date.now(), { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(30_000) })
    const freshHtml = fresh.status === 200 ? await fresh.text() : ''
    const ids = (h) => new Set([...h.matchAll(/elementor-element-([a-z0-9]{6,8})\b/g)].map((m) => m[1]))
    const a = ids(html), b = ids(freshHtml)
    const missing = [...b].filter((id) => !a.has(id)).length, extra = [...a].filter((id) => !b.has(id)).length
    add('edge-cache-current', freshHtml !== '' && missing === 0 && extra === 0, `cf-cache-status ${headers['cf-cache-status'] || 'n/a'}, age ${headers.age || 'n/a'}; ${missing} elements missing from the cached copy, ${extra} stale elements still served`)
  } catch (e) { add('edge-cache-current', false, `fresh fetch failed: ${e.message}`) }
  const text = visibleText(html)
  // Page-owned content only: between the header template and the footer template, so shared
  // navigation (which lists the specialty schools) and footer media do not count against the page.
  const headerEnd = html.search(/elementor-location-header[\s\S]*?<\/header>|elementor-location-header/) >= 0 ? html.indexOf('</header>') + 9 : 0
  const footerStart = (() => { const i = html.search(/<footer[^>]*elementor-location-footer|elementor-location-footer/); return i > 0 ? i : html.length })()
  const mainHtml = html.slice(headerEnd, footerStart)
  const mainText = visibleText(mainHtml)

  // structure
  const header = html.match(/data-elementor-id="(\d+)"[^>]*class="[^"]*elementor-location-header/) || html.match(/class="[^"]*elementor-location-header[^"]*"[^>]*data-elementor-id="(\d+)"/)
  add('header-template-present', Boolean(header), header ? `header template ${header[1]}` : 'no elementor-location-header')
  if (header) add('header-stylesheet-linked', html.includes(`elementor/css/post-${header[1]}.css`), `post-${header[1]}.css ${html.includes(`elementor/css/post-${header[1]}.css`) ? 'linked' : 'MISSING (cached render without header CSS)'}`)
  const footer = html.match(/data-elementor-id="(\d+)"[^>]*class="[^"]*elementor-location-footer/) || html.match(/class="[^"]*elementor-location-footer/)
  add('footer-template-present', Boolean(footer))
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]
  add('h1-present', Boolean(h1), h1 ? visibleText(h1).slice(0, 80) : 'no H1')
  if (h1 && campus) add('h1-names-campus', (campusPages[slug]?.names || [slug.replace(/-/g, ' ')]).some((n) => new RegExp(n.replace('Alpha ', '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(visibleText(h1))), visibleText(h1).slice(0, 80))
  // Bundle 1.11 (MacKenzie Price, 2026-10-05): on a waitlist campus the apply control reads "Apply for [segment]
  // waitlist", so the Apply control is present under that label instead. The control's presence is what this check
  // measures; whether the label is the right one for the recorded state is open-enrollment-state-controls.
  const recordedEnrollmentState = enrollmentStates.campuses?.[slug]?.enrollmentState ?? (campus ? enrollmentStates.default : null)
  const applyLabels = applyControlLabels(mainHtml, visibleText)
  const ctaPresent = (label) => new RegExp(label.replace(/[-\s]+/g, '[\\s-]+'), 'i').test(text)
    || (label === 'Apply now' && recordedEnrollmentState === 'waitlist' && applyLabels.some((l) => WAITLIST_LABEL.test(l)))
  const ctaLabelNote = (label) => (label === 'Apply now' && recordedEnrollmentState === 'waitlist' ? `${label} (or the recorded waitlist label)` : label)
  for (const label of ['STAY IN-THE-KNOW', 'Attend an Info Session', 'Apply now']) add(`cta-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`, ctaPresent(label), ctaLabelNote(label))
  add('intro-section-present', /Join us for an info session/i.test(text), 'intro paragraph "Join us for an info session"')
  add('canonical-tag', new RegExp(`<link[^>]+rel=["']canonical["'][^>]+href=["']${url.replace(/\/$/, '')}/?["']`, 'i').test(html) || new RegExp(`href=["']${url.replace(/\/$/, '')}/?["'][^>]+rel=["']canonical["']`, 'i').test(html), 'rel=canonical matches the URL')

  // state
  const launchHits = LAUNCH_WORDS.map((re) => mainText.match(re)?.[0]).filter(Boolean)
  if (state === 'Open') {
    add('open-no-launch-words', launchHits.length === 0, launchHits.length ? `found: ${launchHits.join(', ')}` : '')
    // Bundle 1.11 row campus.intro.status-source (MacKenzie Price, 2026-10-05): an Open campus reads either the
    // enrolling sentence or the approved waitlist sentence, verbatim. The sentence must still name this campus:
    // Greenwich passed with "Alpha Greenwich Port Chester is open and enrolling." after the rename to Armonk
    // (sweep 2026-09-21). Waitlist language that is not the approved wording, and a page claiming both states, fail.
    const campusNames = [...new Set([...(campus?.names || []), ...(campus?.mapPrograms || []).map((p) => p?.name).filter(Boolean), ...(campusPages[slug]?.names || [])])]
    const statusVerdict = openStatusCheck({ mainText, campusNames, waitlistWording: APPROVED_WAITLIST_WORDING })
    add('open-status-sentence', statusVerdict.result === 'pass', statusVerdict.detail)
    // The rest of the coordinated state: the top banner and resources-section application buttons, in both directions.
    const controls = enrollmentStateControlsCheck({ recordedState: recordedEnrollmentState, labels: applyLabels, mainText })
    checks.push({ id: 'open-enrollment-state-controls', ...controls }) // CONTROLS_CHECK_ID; the literal keeps tests/build-checks.mjs pageCheckIds able to see it
  } else if (state === 'Announced') {
    // Bundle 1.8 campus.intro.status-source (2026-09-28): dated Program (launch_date or opening_date) names a month or
    // season and year; undated Program reads "<name> is coming soon."; no HubSpot read makes "coming soon" a warn.
    const hubspot = await readHubSpotProgramDates(hubspotProgramIdFor(campus))
    const campusNames = [...new Set([...(campus?.mapPrograms || []).map((p) => p?.name).filter(Boolean), ...(campusPages[slug]?.names || [])])]
    checks.push({ id: 'announced-names-launch-date', ...announcedStatusCheck({ mainText, campusNames, hubspot }) })
  }

  // identity: page-owned copy only. Shared navigation is already outside mainHtml; HubSpot-fed event cards and the
  // In the News gallery are not page-owned, proper nouns that contain a brand word are not brand words, and a campus
  // may carry a named exception (registry/sister-brand-exceptions.json). Batch 2 (2026-09-18) traced three false
  // tickets to this check: a university name, an event venue, and the documented Brownsville/Nova path.
  const identityHtml = mainHtml
    // Alpha HubSpot Events cards (class prefix ahse-): venue, title, and time come from the HubSpot Marketing Event.
    .replace(/<(span|div|p|a|h[1-6])\b[^>]*class="[^"]*\bahse-[^"]*"[^>]*>[\s\S]*?<\/\1>/g, ' ')
    // Navigation menus that render after </header> (mobile dropdown, off-canvas): shared template, not page copy.
    .replace(/<a\b[^>]*class="[^"]*\belementor-(?:sub-item|item)\b[^"]*"[^>]*>[\s\S]*?<\/a>/g, ' ')
    .replace(/<(nav|ul)\b[^>]*class="[^"]*\belementor-nav-menu[^"]*"[^>]*>[\s\S]*?<\/\1>/g, ' ')
    // In the News gallery (Airtable video gallery): article thumbnails are not campus media.
    .replace(/<div[^>]*class="[^"]*\batvg-wrapper\b[^"]*"[\s\S]*?(?=<\/section>|<section|<div[^>]*data-element_type="container")/g, ' ')
  let identityText = visibleText(identityHtml)
  for (const noun of brandExceptions.properNouns || []) identityText = identityText.split(noun).join(' ')
  for (const phrase of brandExceptions.campuses?.[slug]?.allowedPhrases || []) identityText = identityText.split(phrase).join(' ')
  const brandHits = SISTER_BRANDS.map((re) => identityText.match(re)?.[0]).filter(Boolean)
  add('no-sister-brand-words', brandHits.length === 0, brandHits.length ? `${brandHits.join(', ')} in page-owned copy` : (brandExceptions.campuses?.[slug] ? 'named exception applied' : ''))
  // Elementor emits section and container background images into the page's generated stylesheet, not the HTML
  // (post-<id>.css); a visitor sees them just the same (Lake Travis hero showed Dorado's beach, 2026-09-21).
  const pageId = html.match(/data-elementor-id="(\d+)"[^>]*data-elementor-type="wp-page"/)?.[1] || html.match(/class="[^"]*\bpage-id-(\d+)\b/)?.[1]
  const pageCss = pageId ? html.match(new RegExp(`https?://[^"'\\s]+/elementor/css/post-${pageId}\\.css[^"'\\s]*`))?.[0] : null
  let cssRefs = []
  if (pageCss) {
    try { const cssRes = await fetch(pageCss.replace(/&amp;/g, '&'), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) }); if (cssRes.ok) cssRefs = [...(await cssRes.text()).matchAll(/wp-content\/uploads\/[^"')\s]+/g)].map((m) => m[0]) } catch { /* the HTML refs still apply */ }
  }
  const imageRefs = [...new Set([...[...mainHtml.matchAll(/wp-content\/uploads\/[^"'\s)]+/g)].map((m) => m[0]), ...cssRefs])]
  // person names on the page (Team cards render "Name | Title" headings); a headshot named after a person is not a campus reference
  const personTokens = new Set([...mainText.matchAll(/([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3})\s*\|\s*[A-Z]/g)].flatMap((m) => m[1].toLowerCase().split(/\s+/)))
  const otherCampus = new Set()
  for (const [otherSlug, page] of Object.entries(campusPages)) {
    if (otherSlug === slug || slug.startsWith(otherSlug + '-') || otherSlug.startsWith(slug + '-')) continue // miami vs miami-beach
    const token = otherSlug.replace(/-/g, '[-_ ]?')
    for (const ref of imageRefs) {
      const file = ref.split('/').pop()
      if (!new RegExp(`(?:^|[/_-])${token}(?:[-_.]|$)`, 'i').test(file) || /headshot|profile|guide|director|staff/i.test(ref)) continue
      const parts = file.toLowerCase().replace(/\.[a-z0-9]+$/, '').split(/[-_]/)
      if (parts.some((w) => personTokens.has(w) && w === otherSlug.split('-')[0]) && parts.some((w) => personTokens.has(w) && w !== otherSlug.split('-')[0])) continue
      otherCampus.add(`${page.names[0]}: ${file}`)
    }
  }
  add('no-other-campus-in-image-names', otherCampus.size === 0, [...otherCampus].slice(0, 3).join('; '))

  // media
  const entry = media.campuses[slug]
  // The approved card is the one the registry records. A waitlist campus's card is "<slug>-waitlist-2026-27.png"
  // (bundle 1.11, MacKenzie Price 2026-10-05); an enrolling campus's is the Open and Enrolling card. Either the
  // recorded attachment id or the state's card filename counts, so the check never passes on an unrecorded asset.
  const cardPattern = entry?.cardVariant === 'waitlist-2026-27'
    ? new RegExp(`${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-waitlist-2026-27(?:-\\d+x\\d+)?\\.png`, 'i')
    : /Open-and-Enrolling\.png/
  const hasCard = entry?.openMedia === 'card'
    && (cardPattern.test(mainHtml) || (entry.attachmentId ? new RegExp(`wp-image-${entry.attachmentId}\\b`).test(mainHtml) : false))
  const hasVideo = /elementor-widget-video|youtube\.com\/embed|youtu\.be/.test(mainHtml)
  if (state === 'Open') add('open-intro-media-approved', hasCard || (entry?.openMedia === 'video' && hasVideo), hasCard ? `approved ${entry.cardVariant || 'open-and-enrolling'} card (attachment ${entry.attachmentId})` : (entry?.openMedia === 'video' ? 'approved video' : (entry ? `registry: ${entry.status}${entry.openMedia === 'card' ? `, approved attachment ${entry.attachmentId} not in the slot` : ''}` : 'no registry entry')))

  // synced targets: every CSS ID the n8n workflow expects must still exist on an Open or Announced campus page
  if (state === 'Open' || state === 'Announced') {
    const ids = new Set([...mainHtml.matchAll(/\sid="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]))
    const suffix = syncedTargets.overrideSuffix
    const overridden = syncedTargets.expectedOnCampusPages.filter((id) => ids.has(id + suffix))
    const missing = syncedTargets.expectedOnCampusPages.filter((id) => !ids.has(id) && !ids.has(id + suffix))
    add('n8n-synced-elements-present', missing.length === 0, missing.length ? `missing CSS IDs: ${missing.join(', ')}` : `${syncedTargets.expectedOnCampusPages.length} expected IDs present${overridden.length ? '; overridden: ' + overridden.map((id) => id + suffix).join(', ') : ''}`)
    if (overridden.length) add('n8n-override-recorded', false, `override in place (${overridden.map((id) => id + suffix).join(', ')}); confirm the APEX ticket and restore condition are recorded`)
  }

  // links (hero CTAs and resource links on the same host or known hosts)
  const linkTargets = [...new Set([...mainHtml.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].filter((m) => /apply|info session|book a call|book a tour|info packet|calendar|stay in-the-know/i.test(visibleText(m[2]))).map((m) => m[1]))].slice(0, 12)
  let bad = []
  for (const target of linkTargets) {
    try {
      const res = await fetch(target, { method: 'GET', headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(10_000) })
      if (res.status >= 400) bad.push(`${target} -> ${res.status}`)
    } catch (e) { bad.push(`${target} -> ${e.name}`) }
  }
  add('cta-links-resolve', bad.length === 0, bad.length ? bad.join('; ') : `${linkTargets.length} CTA links checked`)

  // rendered-visibility proxies (static): an Elementor wrapper hidden on desktop, tablet and mobile renders nowhere.
  // Source presence of a CTA proves nothing to a parent; this catches the Oklahoma City / Tulsa Book a Call case (2026-09-17).
  const hiddenEverywhere = []
  const bookACall = { visible: 0, hiddenWithLink: 0, hiddenNoLink: 0 }
  const wrapperRe = /<div\b([^>]*\bclass="[^"]*elementor-widget\b[^"]*"[^>]*)>([\s\S]*?)<\/div>\s*<\/div>/gi
  for (const m of mainHtml.matchAll(wrapperRe)) {
    const attrs = m[1]; const inner = m[2]
    const cls = (attrs.match(/class="([^"]*)"/) || [, ''])[1]
    const id = (attrs.match(/(?:^|\s)id="([^"]*)"/) || [, ''])[1]
    const allHidden = /elementor-hidden-desktop/.test(cls) && /elementor-hidden-tablet/.test(cls) && /elementor-hidden-mobile/.test(cls)
    const anchor = inner.match(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
    const label = anchor ? visibleText(anchor[2]).trim() : ''
    const isCta = /apply|info session|book a call|book a tour|info packet|calendar|stay in-the-know|admission guide|video library/i.test(label) && !/update link|placeholder/i.test(label)
    if (/^book_a_call/.test(id)) {
      const hasLink = !!(anchor && /^https?:\/\//.test(anchor[1]))
      if (!allHidden) bookACall.visible++; else if (hasLink) bookACall.hiddenWithLink++; else bookACall.hiddenNoLink++
    }
    // A hidden placeholder (label "update link", href ending in "/...") is the correct state until an approved packet or
    // calendar exists (spec/campus-page-controls.json); it is not a hidden CTA (small batch finding, 2026-09-17).
    const placeholder = anchor && (/\/\.\.\.$/.test(anchor[1]) || /update link/i.test(label))
    if (isCta && allHidden && anchor && !placeholder && /^https?:\/\//.test(anchor[1])) hiddenEverywhere.push(`${label} (${id || cls.match(/elementor-element-([a-z0-9]+)/)?.[1] || 'widget'}) -> ${anchor[1]}`)
  }
  // A hidden prior-year packet or calendar is the retired state when a newer year's is visible on the page (14 campuses
  // hide 2025/26 next to a visible 2026/27; sweep 2026-09-21). Compare school years in the labels.
  const visibleYears = [...mainHtml.matchAll(wrapperRe)].filter((m) => !(/elementor-hidden-desktop/.test(m[1]) && /elementor-hidden-tablet/.test(m[1]) && /elementor-hidden-mobile/.test(m[1]))).flatMap((m) => [...visibleText(m[2]).matchAll(/\b(20\d\d)\s*[/-]\s*(?:20)?(\d\d)\b/g)].map((y) => Number(y[1])))
  const newestVisible = visibleYears.length ? Math.max(...visibleYears) : null
  const retired = (entry) => { const y = entry.match(/\b(20\d\d)\s*[/-]\s*(?:20)?\d\d\b/); return Boolean(y && newestVisible && Number(y[1]) < newestVisible && /info packet|calendar/i.test(entry)) }
  // No Book a Call while Announced or Pre-Announcement (Matt Barge, 2026-10-06): a hidden Book a Call that keeps its link is
  // the decided state there, and a visible one is the defect.
  const bookingHiddenState = state === 'Announced' || state === 'Pre-Announcement'
  const stillHidden = hiddenEverywhere.filter((entry) => !retired(entry) && !(bookingHiddenState && /^book a (call|tour)\b/i.test(entry)))
  add('cta-hidden-everywhere', stillHidden.length === 0, stillHidden.length ? stillHidden.join('; ') : (hiddenEverywhere.length ? `only retired prior-year packets or calendars are hidden (${hiddenEverywhere.length})` : 'no linked CTA is hidden on every breakpoint'))
  if (bookACall.visible + bookACall.hiddenWithLink + bookACall.hiddenNoLink > 0) {
    if (bookingHiddenState) add('book-a-call-consistency', bookACall.visible === 0, `${state}: visible ${bookACall.visible} (must be 0 until the Program type is Open, decision 2026-10-06), hidden with link ${bookACall.hiddenWithLink}, hidden without link ${bookACall.hiddenNoLink}`)
    else add('book-a-call-consistency', bookACall.hiddenWithLink === 0, `visible ${bookACall.visible}, hidden with link ${bookACall.hiddenWithLink}, hidden without link ${bookACall.hiddenNoLink}`)
  }

  // rendered: team-photo-framing (desktop and mobile). Static HTML cannot see the box a headshot is squeezed into.
  if (chromium) {
    try { checks.push(teamPhotoFramingCheck(await measureTeamCards(chromium, url))) } catch (e) { add('team-photo-framing', false, `browser measurement failed: ${e.message.split('\n')[0]}`) }
  } else {
    checks.push({ id: 'team-photo-framing', result: 'skipped', detail: renderedSkipReason })
  }

  // rendered: brand-visual (desktop). Computed font-family, colour and background need a browser; a page without one
  // is skipped, never passed. The "never" contrast rows and the palette come from spec/brand-visual.json.
  if (chromium) {
    try { checks.push(brandVisualCheck(await measureBrandVisual(chromium, url, brandVisual), brandVisual)) } catch (e) { add(BRAND_CHECK_ID, false, `browser measurement failed: ${e.message.split('\n')[0]}`) }
  } else {
    checks.push({ id: BRAND_CHECK_ID, result: 'skipped', detail: renderedSkipReason })
  }

  return { url, slug, state, cache: { cfCacheStatus: headers['cf-cache-status'] || null, age: headers.age || null }, checks }
}

function visibleText(html) {
  return String(html).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/\s+/g, ' ')
}

function parse(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    const value = next === undefined || next.startsWith('--') ? true : (i++, next)
    if (key === 'url') out.url = [].concat(out.url || [], value); else out[key] = value
  }
  return out
}
