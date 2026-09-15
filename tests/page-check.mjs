#!/usr/bin/env node
/**
 * Ring 2 page check for alpha.school campus pages (protocol step 5), agent-independent.
 *
 *   node tests/page-check.mjs --url https://alpha.school/atlanta/ [--url ...] [--state Open] [--json out.json]
 *
 * Fetches the canonical public URL as a visitor (no cache-busting), then checks the rendered HTML:
 *   structure  header template linked to its stylesheet, footer present, H1, hero CTA row, intro section
 *   state      Open pages carry no launch-era words; Announced pages name a month and year
 *   identity   no sister-brand words; no other campus named in image file names or alt text
 *   links      every hero/resource CTA resolves (HEAD/GET 2xx, no cross-host surprises)
 *   media      intro card slot is an approved card, a video, or flagged
 * Screenshots are still required by the protocol; this script covers the text and structure part.
 * Exit code 1 when any check fails.
 */
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const lifecycle = JSON.parse(fs.readFileSync(path.join(here, '../spec/campus-lifecycle.json'), 'utf8'))
const media = JSON.parse(fs.readFileSync(path.join(here, '../registry/campus-open-media.json'), 'utf8'))
const campusPages = JSON.parse(fs.readFileSync(path.join(here, '../registry/campus-pages.json'), 'utf8')).campuses

const SISTER_BRANDS = [/\bNova\b/, /\bNextGen(?:\s+Academy)?\b/, /\bWaypoint(?:\s+Academy)?\b/, /\b(?:Texas\s+Sports\s+Academy|TSA)\b/]
const LAUNCH_WORDS = [/\bComing\s+Soon\b/i, /\bComing\s+(?:Fall|Spring|Winter|Summer)\b/i, /\bis\s+launching\b/i, /\bLaunching\s+(?:in\s+)?(?:Fall|Spring|Winter|Summer)\b/i, /\bOpening\s+(?:Fall|Spring|Winter|Summer)\b/i]
const UA = 'alpha-website-playbook-page-check/0.1 (read-only)'

const args = parse(process.argv.slice(2))
const urls = [].concat(args.url || [])
if (!urls.length) { console.error('Usage: page-check.mjs --url <canonical url> [--url ...] [--state Open|Announced] [--json out.json]'); process.exit(2) }

const results = []
for (const url of urls) results.push(await checkPage(url, args.state))
if (args.json) fs.writeFileSync(args.json, `${JSON.stringify(results, null, 2)}\n`)
for (const r of results) {
  const fails = r.checks.filter((c) => c.result === 'fail')
  console.log(`${fails.length ? 'FAIL' : 'PASS'}  ${r.url}  state=${r.state}  ${r.checks.length} checks, ${fails.length} failing${fails.length ? ': ' + fails.map((c) => c.id).join(', ') : ''}`)
  for (const c of fails) console.log(`      ${c.id}: ${c.detail}`)
}
process.exitCode = results.some((r) => r.checks.some((c) => c.result === 'fail')) ? 1 : 0

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
  for (const label of ['STAY IN-THE-KNOW', 'Attend an Info Session', 'Apply now']) add(`cta-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`, new RegExp(label.replace(/[-\s]+/g, '[\\s-]+'), 'i').test(text), label)
  add('intro-section-present', /Join us for an info session/i.test(text), 'intro paragraph "Join us for an info session"')
  add('canonical-tag', new RegExp(`<link[^>]+rel=["']canonical["'][^>]+href=["']${url.replace(/\/$/, '')}/?["']`, 'i').test(html) || new RegExp(`href=["']${url.replace(/\/$/, '')}/?["'][^>]+rel=["']canonical["']`, 'i').test(html), 'rel=canonical matches the URL')

  // state
  const launchHits = LAUNCH_WORDS.map((re) => mainText.match(re)?.[0]).filter(Boolean)
  if (state === 'Open') {
    add('open-no-launch-words', launchHits.length === 0, launchHits.length ? `found: ${launchHits.join(', ')}` : '')
    add('open-status-sentence', /is open and enrolling\.|is now open|is open K-|open and enrolling for the/i.test(mainText), 'expects "Alpha <Campus> is open and enrolling."')
  } else if (state === 'Announced') {
    add('announced-names-launch-date', /(?:opens|launching|opening|coming)\s+(?:in\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December|Fall|Spring|Winter|Summer)\s+20\d\d/i.test(mainText), 'launch statement must name a month or season and a year')
  }

  // identity
  const brandHits = SISTER_BRANDS.map((re) => mainText.match(re)?.[0]).filter(Boolean)
  add('no-sister-brand-words', brandHits.length === 0, brandHits.join(', '))
  const imageRefs = [...mainHtml.matchAll(/wp-content\/uploads\/[^"'\s)]+/g)].map((m) => m[0])
  const otherCampus = new Set()
  for (const [otherSlug, page] of Object.entries(campusPages)) {
    if (otherSlug === slug) continue
    const token = otherSlug.replace(/-/g, '[-_ ]?')
    for (const ref of imageRefs) if (new RegExp(`(?:^|[/_-])${token}(?:[-_.]|$)`, 'i').test(ref.split('/').pop()) && !/headshot|profile|guide|director|staff/i.test(ref)) otherCampus.add(`${page.names[0]}: ${ref.split('/').pop()}`)
  }
  add('no-other-campus-in-image-names', otherCampus.size === 0, [...otherCampus].slice(0, 3).join('; '))

  // media
  const entry = media.campuses[slug]
  const hasCard = /Open-and-Enrolling\.png/.test(mainHtml)
  const hasVideo = /elementor-widget-video|youtube\.com\/embed|youtu\.be/.test(mainHtml)
  if (state === 'Open') add('open-intro-media-approved', hasCard || (entry?.openMedia === 'video' && hasVideo), hasCard ? 'Open and Enrolling card' : (entry?.openMedia === 'video' ? 'approved video' : (entry ? `registry: ${entry.status}${entry.current ? ' (' + entry.current + ')' : ''}` : 'no registry entry')))

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
