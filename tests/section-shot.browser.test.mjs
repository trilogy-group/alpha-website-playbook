#!/usr/bin/env node
/**
 * The regression test for the 2026-10-01 evidence defect: `tests/section-shot.mjs` captured the WRONG person on a
 * looped Swiper carousel, exited 0, and wrote a report whose own `images[0].alt` contradicted the file name
 * (Southlake 8621 "Katherine Phelps" came back as Coach KeJuan Weaver; Palm Beach 6545 "Sean McKenna" as Erin
 * Colucci). It needs a browser, so it is its own file and it SKIPS - never passes - when Playwright is absent.
 *
 * The point of the fixture (`tests/fixtures/section-shot/looped-carousel.html`) is that every card is a flat unique
 * colour, so the verdict is a pixel, not the tool's own report: `captureCentreColor` reads the middle pixel of the
 * capture and says which card the clip actually landed on. `captureSectionTheOldWay` below is the pre-fix code path,
 * line for line, and the first test asserts it captures the wrong colour - if that ever stops being true the
 * fixture has stopped reproducing the bug and the rest of this file proves nothing.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PADDING_PX, SectionShotError, VIEWPORTS, captureSection, clipWithPadding, loadChromium, planSectionShot } from './section-shot.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(here, 'fixtures', 'section-shot', 'looped-carousel.html')
const SELECTOR = '#team_carousel .swiper-slide'
const COLORS = { 'Ada Lovelace': '#c81e1e', 'Grace Hopper': '#1e7d32', 'Katherine Johnson': '#0d4ad1', 'Mary Jackson': '#f2a104' }

let chromium = null
let skip = false
try { chromium = loadChromium({}) } catch (error) { skip = `playwright not available: ${error.message.split('\n')[0]}` }

/** Serve the fixture on 127.0.0.1 for any path, so the query string chooses the reflow behaviour. */
async function serveFixture() {
  const html = fs.readFileSync(FIXTURE)
  const server = http.createServer((request, response) => { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) }
}

/** A plan for the fixture. planSectionShot insists on https, which the fixture is not, so the real planner is used for the shape and the url is swapped in. */
function fixturePlan(url, { out, slideContaining = null, name = 'team carousel: card', allowFirstMatch = false }) {
  const plan = planSectionShot({ url: 'https://alpha.school/fixture/', selector: SELECTOR, name, out, viewports: 'desktop', ...(slideContaining ? { 'slide-containing': slideContaining } : {}), ...(allowFirstMatch ? { 'allow-first-match': true } : {}) })
  return { ...plan, url }
}

/** Which card did the clip land on? The middle pixel of the capture, read through the browser so no image codec is needed. */
async function captureCentreColor(browser, file) {
  const page = await browser.newPage({ viewport: { width: 200, height: 200 } })
  try {
    const hex = await page.evaluate(async (dataUrl) => {
      const image = new Image()
      image.src = dataUrl
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      canvas.getContext('2d').drawImage(image, 0, 0)
      const [r, g, b] = canvas.getContext('2d').getImageData(Math.floor(image.naturalWidth / 2), Math.floor(image.naturalHeight / 2), 1, 1).data
      return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
    }, `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`)
    return hex
  } finally { await page.close() }
}

const nameFor = (hex) => Object.entries(COLORS).find(([, value]) => value === hex)?.[0] || `unknown colour ${hex}`

/**
 * The capture as `captureSection` did it before the fix: the match stays a lazy locator, re-resolved on every await,
 * autoplay keeps running, and the clip goes to the screenshot with nothing asserted about what is under it.
 */
async function captureSectionTheOldWay(browser, plan, viewport) {
  const context = await browser.newContext({ viewport: VIEWPORTS[viewport], deviceScaleFactor: 2 })
  const page = await context.newPage()
  try {
    await page.goto(plan.url + (plan.url.includes('?') ? '&' : '?') + 'nocache=' + Date.now(), { waitUntil: 'load', timeout: 90_000 })
    const all = page.locator(plan.selector)
    const matches = await all.count()
    const locator = plan.slideContaining ? all.filter({ hasText: plan.slideContaining }) : all
    const element = locator.first()
    const slide = await element.evaluate((el) => {
      const node = el.closest('.swiper-slide'); const swiper = node?.closest('.swiper, .swiper-container')
      if (!node || !swiper?.swiper) return null
      const index = [...node.parentElement.children].indexOf(node)
      swiper.swiper.slideTo(index, 0)
      return { index, moved: true }
    })
    if (slide?.moved) await page.waitForTimeout(400)
    await element.scrollIntoViewIfNeeded({ timeout: 10_000 })
    await page.waitForTimeout(500)
    await page.waitForTimeout(300)
    const box = await element.boundingBox()
    const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))
    const clip = clipWithPadding(box, scroll, PADDING_PX)
    fs.mkdirSync(plan.out, { recursive: true })
    const file = plan.files[viewport]
    await page.screenshot({ path: file, fullPage: true, clip })
    return { file, matches, slide, clip }
  } finally { await context.close() }
}

const tmp = (suffix) => fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', `section-shot-${suffix}-`))

test('the fixture reproduces the defect: the pre-fix capture of "Katherine Johnson" is a picture of another card', { skip }, async () => {
  const fixture = await serveFixture()
  const browser = await chromium.launch()
  try {
    const out = tmp('old')
    const plan = fixturePlan(`${fixture.origin}/?reflow=loop`, { out, slideContaining: 'Katherine Johnson', name: 'team carousel: Katherine Johnson card' })
    const result = await captureSectionTheOldWay(browser, plan, 'desktop')
    const hex = await captureCentreColor(browser, result.file)
    // Nothing threw, nothing warned, the file is named after her - and it shows someone else. That is the defect.
    assert.ok(fs.existsSync(result.file), 'the old path wrote its capture')
    assert.notEqual(hex, COLORS['Katherine Johnson'], `the old path should have captured the wrong card; it captured ${nameFor(hex)}`)
    assert.equal(hex, COLORS['Mary Jackson'], `the loop reorder puts the next card under the clip; got ${nameFor(hex)}`)
  } finally { await browser.close(); await fixture.close() }
})

test('section-shot captures the requested card on a looped carousel and reports the identity it asserted', { skip }, async () => {
  const fixture = await serveFixture()
  const browser = await chromium.launch()
  try {
    for (const person of ['Katherine Johnson', 'Mary Jackson', 'Grace Hopper']) {
      const out = tmp('new')
      const plan = fixturePlan(`${fixture.origin}/?reflow=loop`, { out, slideContaining: person, name: `team carousel: ${person} card` })
      const result = await captureSection(browser, plan, 'desktop')
      const hex = await captureCentreColor(browser, result.file)
      assert.equal(hex, COLORS[person], `${person}: the capture shows ${nameFor(hex)}`)
      // The asserted identity is in the report, and it is the heading of the element that was actually shot.
      assert.equal(result.identity.requested, person)
      assert.equal(result.identity.heading.split('|')[0].trim(), person, `${person}: report identity`)
      assert.equal(result.identity.containsRequested, true)
      assert.equal(result.identity.ok, true)
      assert.equal(result.slide.autoplayStopped, true, 'carousel autoplay is stopped before the slideTo')
      assert.equal(result.images.length, 1)
      assert.equal(result.undecoded, 0)
    }
  } finally { await browser.close(); await fixture.close() }
})

test('section-shot fails loudly, and writes nothing, when the slide no longer holds the requested person', { skip }, async () => {
  const fixture = await serveFixture()
  const browser = await chromium.launch()
  try {
    const out = tmp('recycle')
    const plan = fixturePlan(`${fixture.origin}/?reflow=recycle`, { out, slideContaining: 'Katherine Johnson', name: 'team carousel: Katherine Johnson card' })
    const error = await captureSection(browser, plan, 'desktop').then(() => null, (e) => e)
    assert.ok(error instanceof SectionShotError, `a typed error, not a silent capture; got ${error}`)
    assert.equal(error.code, 'SLIDE_IDENTITY_MISMATCH')
    assert.match(error.message, /no longer contains "Katherine Johnson"/)
    assert.match(error.message, /Mary Jackson/, 'the message names what the element holds instead')
    assert.equal(error.identity.ok, false)
    assert.equal(fs.existsSync(plan.files.desktop), false, 'no wrong capture is left behind')
  } finally { await browser.close(); await fixture.close() }
})

test('section-shot fails loudly when another slide is painted over the clip', { skip }, async () => {
  const fixture = await serveFixture()
  const browser = await chromium.launch()
  try {
    const out = tmp('overlay')
    const plan = fixturePlan(`${fixture.origin}/?reflow=overlay`, { out, slideContaining: 'Katherine Johnson', name: 'team carousel: Katherine Johnson card' })
    const error = await captureSection(browser, plan, 'desktop').then(() => null, (e) => e)
    assert.ok(error instanceof SectionShotError, `expected a typed error, got ${error}`)
    assert.equal(error.code, 'SLIDE_IDENTITY_MISMATCH')
    assert.match(error.message, /centre lands on a different slide/)
    assert.equal(error.identity.centreOnOwnSlide, false)
    assert.equal(error.identity.containsRequested, true, 'the element is right; the pixels under the clip are not')
    assert.equal(fs.existsSync(plan.files.desktop), false)
  } finally { await browser.close(); await fixture.close() }
})

test('a carousel selector matching many slides with nothing to pick one is refused, and --allow-first-match is the opt-out', { skip }, async () => {
  const fixture = await serveFixture()
  const browser = await chromium.launch()
  try {
    // This is the command line that actually produced the Southlake and Palm Beach evidence: a bare slide selector
    // and a --name claiming a person. Four slides, no way to pick one, a file named after Katherine Johnson.
    const refusedOut = tmp('ambiguous')
    const refused = fixturePlan(`${fixture.origin}/?reflow=loop`, { out: refusedOut, name: 'team carousel: Katherine Johnson card' })
    const error = await captureSection(browser, refused, 'desktop').then(() => null, (e) => e)
    assert.ok(error instanceof SectionShotError, `expected a typed error, got ${error}`)
    assert.equal(error.code, 'AMBIGUOUS_SLIDE')
    assert.match(error.message, /matches 4 carousel slides/)
    assert.match(error.message, /--slide-containing/)
    assert.match(error.message, /Ada Lovelace \| Guide/, 'the headings are listed so the right flag is obvious')
    assert.equal(fs.existsSync(refused.files.desktop), false)
    // The opt-out captures slide 1 and says in the report whose card that is.
    const allowedOut = tmp('allowed')
    const allowed = fixturePlan(`${fixture.origin}/?reflow=loop`, { out: allowedOut, name: 'team carousel first slide', allowFirstMatch: true })
    const result = await captureSection(browser, allowed, 'desktop')
    assert.equal(result.identity.heading, 'Ada Lovelace | Guide')
    assert.equal(result.identity.requested, null)
    assert.equal(await captureCentreColor(browser, result.file), COLORS['Ada Lovelace'])
  } finally { await browser.close(); await fixture.close() }
})
