#!/usr/bin/env node
/**
 * Rendered-controls check: loads a campus page in a real browser on desktop and mobile and reports,
 * for every control the playbook expects, whether a parent can actually see it. Source presence is not
 * evidence; this is. Required output for closing any ticket as "already correct" and for the link-cta,
 * media, and staff classes (protocol step 7, decision 2026-09-17).
 *
 * Usage: node tests/rendered-controls.mjs --url <canonical url> [--url ...] [--state Open|Announced|Pre-Announcement] [--json out.json] [--playwright <dir with node_modules/playwright>]
 * Exit 1 when a required control is hidden, a Book a Call widget has a link but is hidden, or a book_a_call_* widget
 * has been relabelled to something else. --screenshots <dir> writes full-page desktop and mobile PNGs (ring 2).
 * Book a Call depends on the lifecycle state (spec/campus-lifecycle.json campuses[slug].lifecycle, or --state): on an
 * Announced or Pre-Announcement page a VISIBLE Book a Call is the failure and a hidden one with its link is the decided
 * state (Matt Barge, 2026-10-06: no Book a Call while Announced; docs/decisions.md).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const args = parse(process.argv.slice(2))
const urls = [].concat(args.url || [])
if (!urls.length) { console.error('Usage: rendered-controls.mjs --url <url> [--url ...] [--json out.json] [--playwright <dir>]'); process.exit(2) }
const here = path.dirname(new URL(import.meta.url).pathname)
const controls = JSON.parse(fs.readFileSync(path.join(here, '..', 'spec', 'campus-page-controls.json'), 'utf8')).controls
const lifecycle = JSON.parse(fs.readFileSync(path.join(here, '..', 'spec', 'campus-lifecycle.json'), 'utf8'))
// States in which Book a Call must not be visible (decision 2026-10-06, spec/campus-page-requirements.json states/Announced/campus.hero.book-a-call).
const BOOKING_HIDDEN_STATES = ['Announced', 'Pre-Announcement']
const stateFor = (url) => args.state || lifecycle.campuses?.[new URL(url).pathname.replace(/^\/+|\/+$/g, '')]?.lifecycle || 'unknown'

// Playwright is not a dependency of the playbook; borrow it from a sibling project or an explicit dir.
const candidates = [args.playwright, process.env.PLAYWRIGHT_ROOT, path.join(here, '..'), path.join(process.env.HOME || '', 'DevProjects', 'aeo')].filter(Boolean)
let chromium = null
const loadErrors = []
for (const dir of candidates) { try { chromium = createRequire(path.join(dir, 'package.json'))('playwright').chromium; break } catch (e) { loadErrors.push(`${dir}: ${e.message.split('\n')[0]}`) } }
if (!chromium) { console.error('playwright not found; pass --playwright <dir> or set PLAYWRIGHT_ROOT\n' + loadErrors.join('\n')); process.exit(2) }

// Labels a parent must be able to see. Book a Call is conditional on the link existing (HubSpot call_scheduling_link).
const LABELS = [
  { key: 'hero.apply', re: /^apply( now| today!?)?$/i, required: true },
  { key: 'hero.info-session', re: /attend an info session/i, required: true },
  { key: 'hero.stay-in-the-know', re: /stay in-the-know/i, required: false },
  { key: 'hero.book-a-call', re: /^book a call$/i, required: 'when-linked' },
  { key: 'resources.admission-guide', re: /admission guide/i, required: false },
  { key: 'resources.calendar', re: /calendar/i, required: false },
  { key: 'resources.info-packet', re: /info packet/i, required: false },
]

const browser = await chromium.launch()
const results = []
for (const url of urls) {
  const state = stateFor(url)
  const bookingHidden = BOOKING_HIDDEN_STATES.includes(state)
  const page = { url, state, viewports: {}, checks: [] }
  for (const [name, vp] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const tab = await browser.newPage({ viewport: vp, userAgent: 'alpha-website-playbook rendered-controls' })
    try { await tab.goto(url + (url.includes('?') ? '&' : '?') + 'nocache=' + Date.now(), { waitUntil: 'load', timeout: 90000 }); await tab.waitForTimeout(1500) } catch (e) { page.viewports[name] = { error: e.message.split('\n')[0] }; await tab.close(); continue }
    const anchors = await tab.evaluate(() => {
      const out = []
      for (const a of document.querySelectorAll('a')) {
        const text = (a.textContent || '').replace(/\s+/g, ' ').trim(); if (!text || text.length > 60) continue
        const r = a.getBoundingClientRect(); let hiddenBy = null; let n = a
        while (n && n !== document.body) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') { hiddenBy = (n.id ? '#' + n.id + ' ' : '') + [...n.classList].filter((c) => /hidden/.test(c)).join(' ') || n.tagName; break } n = n.parentElement }
        const w = a.closest('.elementor-widget'); out.push({ text, href: a.getAttribute('href') || '', w: Math.round(r.width), h: Math.round(r.height), hiddenBy, widgetId: w?.id || '', widget: (w?.className.match(/elementor-element-([a-z0-9]+)/) || [])[1] || '' })
      }
      return out
    })
    page.viewports[name] = { anchors: anchors.length }
    // Ring 2 requires actor-inspected screenshots (protocol step 6); write them next to the JSON when --screenshots <dir> is given.
    if (args.screenshots) {
      fs.mkdirSync(args.screenshots, { recursive: true })
      const slug = (new URL(url).pathname.replace(/\/+$/, '').split('/').pop() || 'home')
      const file = path.join(args.screenshots, `${slug}-${name}.png`)
      try { await tab.screenshot({ path: file, fullPage: true }); page.viewports[name].screenshot = file } catch (e) { page.viewports[name].screenshotError = e.message.split('\n')[0] }
    }
    // Widgets that carry a Book a Call CSS id must still be Book a Call: a repurposed or hidden widget is reported
    // even when no anchor is labelled Book a Call any more (Houston, 2026-09-17: both ids relabelled Join The Community and hidden).
    const bookIds = await tab.evaluate(() => [...document.querySelectorAll('[id^="book_a_call"]')].map((el) => {
      const a = el.querySelector('a'); const r = el.getBoundingClientRect(); let hidden = false; let n = el
      while (n && n !== document.body) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden') { hidden = true; break } n = n.parentElement }
      return { id: el.id, text: (a?.textContent || '').replace(/\s+/g, ' ').trim(), href: a?.getAttribute('href') || '', hidden: hidden || r.width === 0 || r.height === 0 }
    }))
    for (const b of bookIds) {
      const repurposed = b.text && !/^book a call$/i.test(b.text)
      // Open: a hidden widget that carries a link is the defect. Announced / Pre-Announcement: a visible widget is the defect.
      const wrongVisibility = bookingHidden ? !b.hidden : (b.hidden && /^https?:\/\//.test(b.href))
      page.checks.push({ viewport: name, control: `widget.${b.id}`, result: repurposed || wrongVisibility ? 'fail' : 'pass', detail: `${b.hidden ? 'hidden' : 'visible'}; label "${b.text}"; link ${b.href || 'none'}${repurposed ? '; repurposed away from Book a Call' : ''}${bookingHidden && !b.hidden ? `; visible while ${state} (no Book a Call before Open, 2026-10-06)` : ''}` })
    }
    for (const L of LABELS) {
      const hits = anchors.filter((a) => L.re.test(a.text))
      const visible = hits.filter((a) => !a.hiddenBy && a.w > 0 && a.h > 0)
      const linked = hits.filter((a) => /^https?:\/\//.test(a.href))
      let result = 'pass', detail = `${visible.length} visible of ${hits.length}`
      if (L.key === 'hero.book-a-call' && bookingHidden) {
        // Decision 2026-10-06: no Book a Call while the Program type is Announced or Pre-Announcement.
        result = visible.length ? 'fail' : (hits.length ? 'pass' : 'n/a')
        detail = visible.length ? `${visible.length} visible while ${state}; must be hidden on every breakpoint until the Program type is Open` : (hits.length ? `hidden while ${state} (decided state)${linked.length ? `; link ${linked[0].href}` : ''}` : 'no such control')
        page.checks.push({ viewport: name, control: L.key, result, detail })
        continue
      }
      if (!hits.length) { result = L.required === true ? 'fail' : 'n/a'; detail = 'no such control' }
      else if (!visible.length) { result = (L.required === true || (L.required === 'when-linked' && linked.length)) ? 'fail' : 'pass'; detail = `hidden: ${[...new Set(hits.map((h) => h.hiddenBy || 'zero-size'))].join(', ')}${linked.length ? `; link ${linked[0].href}` : '; no link'}` }
      page.checks.push({ viewport: name, control: L.key, result, detail })
    }
    await tab.close()
  }
  results.push(page)
  const fails = page.checks.filter((c) => c.result === 'fail')
  console.log(`${fails.length ? 'FAIL' : 'PASS'}  ${url}  [${state}]  ${page.checks.filter((c) => c.result !== 'n/a').length} rendered checks, ${fails.length} failing`)
  for (const c of fails) console.log(`      ${c.viewport} ${c.control}: ${c.detail}`)
}
await browser.close()
if (args.json) fs.writeFileSync(args.json, JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2) + '\n')
process.exitCode = results.some((p) => p.checks.some((c) => c.result === 'fail')) ? 1 : 0

function parse(argv) { const out = {}; for (let i = 0; i < argv.length; i++) { if (!argv[i].startsWith('--')) continue; const key = argv[i].slice(2); const next = argv[i + 1]; const value = next === undefined || next.startsWith('--') ? true : (i++, next); if (key === 'url') out.url = [].concat(out.url || [], value); else out[key] = value } return out }
