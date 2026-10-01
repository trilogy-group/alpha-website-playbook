/**
 * Team-card photo framing: the math and the in-browser measurement behind the `team-photo-framing` check in
 * tests/page-check.mjs and the `--ratio auto` mode of agent/frame-headshot.mjs.
 *
 * Why: a team-card image box on a campus page is a fixed-height landscape (carousel slides: 220 css px tall, width
 * from the column) rendered with object-fit: cover. A portrait bound at its native ratio is scaled to the box width
 * and the browser throws away the rest. "Image present and decoded" never saw it. This module measures what the
 * visitor sees: how much of the bound file is inside the frame, and, which is the part that matters, on which edges
 * the rest was taken.
 *
 * What it judges, and what it used to judge (decision 2026-10-01, Matt Barge, superseding 2026-09-22). Until
 * 2026-10-01 a card failed when less than 95% of the image height was visible. That is a measurement of how much of
 * the FILE the box uses, not of whether a face is cut, and after the cards were anchored to the top
 * (`object-position: top center`, applied 2026-09-23 and 2026-10-01) the part being removed was shoulders and chest.
 * The check still failed, and the tickets it produced still said "cut heads on desktop", which was no longer true: of
 * the 22 crops it proposed in the 2026-10-01 reframe run, 21 changed nothing a visitor would notice.
 *
 * So the measurement is now the TOP cut: the share of the image height the box removes above the visible window,
 * which follows from the two ratios and the stored `object-position`. A head sits at the top of a portrait, so that is
 * where clipping it shows. A top-anchored portrait has a top cut of zero and passes however tall the file is.
 *
 * Coverage = min(imageRatio, boxRatio) / max(imageRatio, boxRatio), the fraction of the image that is visible along
 * the cropped axis (1 when the ratios match). The cropped axis is vertical when the image is taller than the box and
 * horizontal when it is wider. Which edges are cut follows the image's object-position: 50% 0% cuts only the bottom,
 * 50% 50% cuts both edges evenly, 50% 100% cuts only the top.
 *
 * Thresholds, taken from 112 card-viewport measurements read live on the seven campus pages of the 2026-10-01 run
 * (marketingsupport work-assets/apex-website-tickets/reframe-2026-10-01/measure/measure-live.json):
 *
 *   MAX_TOP_CUT (0.08). Every top cut in that set is 0 (top-anchored), 0.0082 (two New York cards at `50% 50%` whose
 *   ratios nearly match, visually fine), or 0.2848 / 0.3971 (Fort Worth's Kimberley Dillard, stored `50% 100%`, whose
 *   crown and hair are genuinely gone from the card). 0.08 sits in the empty band between 0.0082 and 0.2848.
 *
 *   MIN_VISIBLE_HEIGHT (0.40). A floor for the case the top cut cannot see: a top-anchored window so short that it
 *   ends above the chin. It is deliberately not 0.55. The shallowest window measured is 0.4299 (Palm Beach, Dr. Tasha
 *   Arnold, desktop, top-anchored) and that card renders a complete, well-framed head; 0.5911 (Plano) and 0.6535
 *   (Chantilly, Victoria Schoch) likewise. A 0.55 floor would fail all three, which is the false positive this rule
 *   exists to remove. 0.40 is below every card the contact sheets confirmed correct and still catches an extreme box
 *   (a 2:3 portrait in a 3:1 band shows 22% of its height: forehead only).
 *
 *   HORIZONTAL_MAX_EDGE_CUT (0.30) and HORIZONTAL_MIN_COVERAGE (0.50) are unchanged from 2026-09-22. The card box is a
 *   fixed height whose width follows the column, so it is wider on desktop than on mobile, and a file framed to the
 *   desktop box necessarily loses width on mobile, symmetrically, with the face still in the middle. That is the
 *   layout's doing. It fails only when an edge takes more than 30%, or under half the width survives.
 *
 * object-fit contain or scale-down never crops (pass, letterboxed); fill stretches, and fails when the ratios differ
 * by more than five percent.
 */

/** The share of the image height the card may take off the TOP before the head is at risk (decision 2026-10-01). */
export const MAX_TOP_CUT = 0.08
/** The shortest visible window a top-anchored portrait may have before even a tight headshot risks losing its chin. */
export const MIN_VISIBLE_HEIGHT = 0.40
export const HORIZONTAL_MIN_COVERAGE = 0.50
export const HORIZONTAL_MAX_EDGE_CUT = 0.30
export const FILL_MAX_DISTORTION = 0.05
export const VIEWPORTS = { desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } }

/** "50% 0%", "center top", "left 25%" -> { x: 0..1, y: 0..1 } (fractions of the overflow placed before the visible window). */
export function parseObjectPosition(value) {
  const words = String(value || '50% 50%').trim().split(/\s+/)
  const keyword = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 }
  const num = (w) => (w === undefined ? 0.5 : (w in keyword ? keyword[w] : (/%$/.test(w) ? Math.min(1, Math.max(0, parseFloat(w) / 100)) : (Number.isFinite(parseFloat(w)) ? 0.5 : 0.5))))
  let [a, b] = words
  // "top left" order: a vertical keyword first means the axes are swapped.
  if (a === 'top' || a === 'bottom') [a, b] = [b, a]
  if (b === 'left' || b === 'right') [a, b] = [b, a]
  return { x: num(a), y: num(b) }
}

/**
 * The visible fraction of an image rendered with object-fit: cover in a box, and which edges are cut.
 * Sizes are in any consistent unit (natural pixels for the image, css pixels for the box; only ratios matter).
 */
export function frameCoverage({ naturalWidth, naturalHeight, boxWidth, boxHeight, objectPosition = '50% 50%' }) {
  const nw = Number(naturalWidth), nh = Number(naturalHeight), bw = Number(boxWidth), bh = Number(boxHeight)
  if (!(nw > 0 && nh > 0 && bw > 0 && bh > 0)) return { coverage: null, imageRatio: nw > 0 && nh > 0 ? nw / nh : null, boxRatio: bw > 0 && bh > 0 ? bw / bh : null, croppedAxis: 'unknown', croppedEdges: [], cut: {} }
  const imageRatio = nw / nh
  const boxRatio = bw / bh
  const pos = parseObjectPosition(objectPosition)
  const round = (v) => Math.round(v * 10000) / 10000
  // Sub-pixel layout rounding (303.47x455.2 for a 2:3 image) is not a crop: within 0.1% counts as the same ratio.
  if (Math.abs(imageRatio - boxRatio) / boxRatio < 1e-3) return { coverage: 1, imageRatio: round(imageRatio), boxRatio: round(boxRatio), croppedAxis: 'none', croppedEdges: [], cut: {} }
  if (imageRatio < boxRatio) {
    // Taller than the box: scaled to the box width, height overflows.
    const coverage = imageRatio / boxRatio
    const overflow = 1 - coverage // fraction of the image height that is cut
    const top = overflow * pos.y, bottom = overflow * (1 - pos.y)
    const edges = [top > 0.005 ? 'top' : null, bottom > 0.005 ? 'bottom' : null].filter(Boolean)
    return { coverage: round(coverage), imageRatio: round(imageRatio), boxRatio: round(boxRatio), croppedAxis: 'vertical', croppedEdges: edges, cut: { top: round(top), bottom: round(bottom) } }
  }
  // Wider than the box: scaled to the box height, width overflows.
  const coverage = boxRatio / imageRatio
  const overflow = 1 - coverage
  const left = overflow * pos.x, right = overflow * (1 - pos.x)
  const edges = [left > 0.005 ? 'left' : null, right > 0.005 ? 'right' : null].filter(Boolean)
  return { coverage: round(coverage), imageRatio: round(imageRatio), boxRatio: round(boxRatio), croppedAxis: 'horizontal', croppedEdges: edges, cut: { left: round(left), right: round(right) } }
}

/**
 * Pass or fail for one measured card image, with the reason a reviewer can read. A card with no rendered box (a
 * hidden slide) or no natural size is `unmeasured`: not a framing verdict either way, and listed as such.
 */
export function judgeFraming(frame) {
  if (frame.coverage === null) return { result: 'unmeasured', reason: frame.boxRatio === null ? 'no rendered box (hidden or zero-size image)' : 'no natural size (image never loaded)' }
  const pct = Math.round(frame.coverage * 100)
  const topCut = frame.cut?.top || 0
  if (frame.croppedAxis === 'stretched') return { result: 'fail', reason: `object-fit fill stretches the image by ${Math.round(frame.distortion * 100)}%` }
  // The defect a visitor sees: the window starts below the top of the file, where the head is.
  if (topCut > MAX_TOP_CUT) return { result: 'fail', reason: `the card removes the top ${Math.round(topCut * 100)}% of the image, where the head sits` }
  if (frame.croppedAxis === 'vertical' && frame.coverage < MIN_VISIBLE_HEIGHT) return { result: 'fail', reason: `only ${pct}% of the image height is inside the card, short enough to cut the chin` }
  if (frame.croppedAxis === 'horizontal') {
    const worst = Math.max(frame.cut.left || 0, frame.cut.right || 0)
    if (frame.coverage < HORIZONTAL_MIN_COVERAGE || worst > HORIZONTAL_MAX_EDGE_CUT) return { result: 'fail', reason: `${pct}% of the image width is visible (${Math.round((frame.cut.left || 0) * 100)}% cut left, ${Math.round((frame.cut.right || 0) * 100)}% cut right); the head band is not inside the frame` }
  }
  if (frame.croppedAxis === 'none') return { result: 'pass', reason: frame.note || 'ratios match' }
  if (frame.croppedAxis === 'vertical') return { result: 'pass', reason: `${pct}% of the image height is visible, cut ${frame.croppedEdges.join(' and ') || 'nowhere'}; the top of the image is inside the card` }
  return { result: 'pass', reason: `${pct}% visible along the ${frame.croppedAxis} axis, within tolerance` }
}

/** frameCoverage with the image's object-fit taken into account: contain never crops, fill distorts, cover crops. */
export function frameForFit(card) {
  const fit = card.objectFit || 'cover'
  if (fit === 'contain' || fit === 'scale-down') return { coverage: 1, imageRatio: null, boxRatio: null, croppedAxis: 'none', croppedEdges: [], cut: {}, note: `object-fit ${fit}: letterboxed, nothing cropped` }
  if (fit === 'fill') {
    const nw = Number(card.naturalWidth), nh = Number(card.naturalHeight), bw = Number(card.boxWidth), bh = Number(card.boxHeight)
    if (!(nw > 0 && nh > 0 && bw > 0 && bh > 0)) return frameCoverage(card)
    const distortion = Math.abs((bw / bh) / (nw / nh) - 1)
    return distortion > FILL_MAX_DISTORTION
      ? { coverage: 1, imageRatio: nw / nh, boxRatio: bw / bh, croppedAxis: 'stretched', croppedEdges: [], cut: {}, distortion }
      : { coverage: 1, imageRatio: nw / nh, boxRatio: bw / bh, croppedAxis: 'none', croppedEdges: [], cut: {}, note: `object-fit fill within ${Math.round(FILL_MAX_DISTORTION * 100)}%` }
  }
  return frameCoverage(card)
}

/** "1130x1533 into 285x220" style summary for reports. */
export function describeFrame(card) {
  const f = card.frame
  const box = `${Math.round(card.boxWidth)}x${Math.round(card.boxHeight)} css px`
  return `${card.name}: ${f.coverage === null ? 'unmeasured' : Math.round(f.coverage * 100) + '% visible'}, natural ${card.naturalWidth}x${card.naturalHeight}, box ${box}${f.croppedEdges.length ? `, ${f.croppedEdges.join(' and ')} cropped` : ''}`
}

/**
 * Runs inside the page (page.evaluate). Finds every team card image (leadership row and carousel or scroll-row
 * slides), forces lazy loading eager, awaits decode() with one shared deadline, and returns the rendered box,
 * natural size, object-fit and object-position per card, with the card's "Name | Title" heading when it has one.
 * Slides that are translated out of view still have a computed box, so the carousel is not scrolled to measure.
 */
export function measureTeamCardsInPage({ timeoutMs = 15000 } = {}) {
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim()
  // The team section: #team plus the top-level Elementor section or container around every team_* / top_staff* id
  // (on some pages #team is only the title block and the carousel sits beside it). A page with none of these has no
  // team cards to measure; grade-level cards on older templates also use "A | B" headings and must not count.
  const roots = new Set()
  for (const el of document.querySelectorAll('#team, [id^="team_"], [id^="top_staff"]')) {
    const top = el.closest('.e-parent, .elementor-top-section, .elementor-section') || el
    roots.add(top.contains(el) ? top : el)
  }
  const cards = new Map()
  const record = (img, name, kind, container) => {
    if (!img || cards.has(img)) return
    // A looped Swiper clones its slides (swiper-slide-duplicate); the clone shows the same file in the same box.
    if (container?.classList?.contains('swiper-slide-duplicate')) return
    cards.set(img, { img, name, kind, container })
  }
  const within = (selector) => { const seen = new Set(); const out = []; for (const root of roots) for (const el of root.querySelectorAll(selector)) if (!seen.has(el)) { seen.add(el); out.push(el) } return out }
  // Primary: every "Name | Title" heading; the card is the nearest ancestor holding exactly one such heading and an image.
  const headings = within('.elementor-heading-title').filter((h) => /\S\s*\|\s*\S/.test(clean(h.textContent)))
  for (const h of headings) {
    let node = h.closest('.elementor-widget') || h
    let card = null
    while (node && node !== document.body) {
      node = node.parentElement
      if (!node) break
      const inner = [...node.querySelectorAll('.elementor-heading-title')].filter((x) => /\S\s*\|\s*\S/.test(clean(x.textContent)))
      if (inner.length > 1) break
      if (node.querySelector('img')) { card = node; break }
    }
    if (!card) continue
    const slide = card.closest('.swiper-slide')
    record(card.querySelector('img'), clean(h.textContent).split('|')[0].trim(), slide ? 'carousel' : (card.querySelector('[id^="team_head"], [id^="top_staff"]') ? 'leadership' : 'row'), slide || card)
  }
  // Fallback: image widgets named like team cards that carry no heading (an add that lost its heading is still a card).
  for (const widget of within('[id^="team_head_picture"], [id^="team_member_picture"], [id^="top_staff"] .elementor-widget-image, [id^="top_staff_picture"]')) {
    const img = widget.querySelector('img') || (widget.tagName === 'IMG' ? widget : null)
    record(img, `(no heading) ${widget.id || 'team image'}`, widget.closest('.swiper-slide') ? 'carousel' : 'leadership', widget.closest('.swiper-slide') || widget)
  }
  const list = [...cards.values()]
  for (const { img } of list) { if (img.loading === 'lazy') img.loading = 'eager' }
  // The slide index is read here, before any await, and never after one. A looped carousel reorders its slides while
  // the decodes are in flight, so an index read afterwards names a different card - the same class of mistake that
  // made section-shot.mjs capture the wrong person on 2026-10-01. The name/image binding itself is safe, because the
  // card is a live node reference, not a selector; it is only the positional index that goes stale.
  for (const card of list) {
    card.slide = card.container?.classList?.contains('swiper-slide') ? card.container : null
    card.slideIndex = card.slide ? [...card.slide.parentElement.children].indexOf(card.slide) : null
  }
  const deadline = Date.now() + timeoutMs
  return Promise.all(list.map(async ({ img, name, kind, slide, slideIndex }) => {
    let decoded = true, reason = null
    const remaining = Math.max(0, deadline - Date.now())
    let timer
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`decode timed out after ${timeoutMs}ms`)), remaining) })
    try { if (!img.currentSrc && !img.src) throw new Error('no src'); await Promise.race([img.decode(), timeout]) } catch (e) { decoded = false; reason = e.message || String(e) } finally { clearTimeout(timer) }
    const r = img.getBoundingClientRect()
    const cs = getComputedStyle(img)
    const widget = img.closest('.elementor-widget')
    return {
      name, kind, decoded, ...(reason ? { reason } : {}),
      src: (img.currentSrc || img.src || '').slice(0, 300),
      naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
      boxWidth: Math.round(r.width * 100) / 100, boxHeight: Math.round(r.height * 100) / 100,
      objectFit: cs.objectFit, objectPosition: cs.objectPosition,
      widgetId: widget?.id || null, widgetElement: (widget?.className.match(/elementor-element-([a-z0-9]+)/) || [])[1] || null,
      slideIndex,
      // A positional carousel selector is a measurement artefact, not an address: on a looped carousel the slide at
      // :nth-child(n) changes. Downstream tools that take --selector should prefer widgetId, and anything that
      // captures a card must pick it by its heading (tests/section-shot.mjs --slide-containing).
      selector: slide ? `#team_carousel .swiper-slide:nth-child(${slideIndex + 1})` : (widget?.id ? `#${widget.id}` : null),
      ...(slide ? { selectorStable: false } : {}),
    }
  }))
}

/** Score one viewport's measurements: attach frame and verdict to each card, return the failing ones. */
export function scoreCards(cards) {
  for (const card of cards) {
    card.frame = frameForFit(card)
    card.verdict = card.decoded ? judgeFraming(card.frame) : { result: 'fail', reason: `image never decoded (${card.reason})` }
  }
  return cards.filter((c) => c.verdict.result === 'fail')
}

/**
 * Measure a page's team cards in a real browser on the given viewports. `chromium` is the Playwright export
 * (borrowed the way rendered-controls.mjs borrows it). Returns { viewports: { desktop: { cards, failing }, ... } }.
 */
export async function measureTeamCards(chromium, url, { viewports = Object.keys(VIEWPORTS), timeoutMs = 15000, userAgent = 'alpha-website-playbook page-check (read-only)', browser: existing = null } = {}) {
  const browser = existing || await chromium.launch()
  const out = { url, viewports: {} }
  try {
    for (const name of viewports) {
      const context = await browser.newContext({ viewport: VIEWPORTS[name], userAgent })
      const page = await context.newPage()
      try {
        await page.goto(url + (url.includes('?') ? '&' : '?') + 'nocache=' + Date.now(), { waitUntil: 'load', timeout: 90_000 })
        await page.waitForTimeout(800)
        const team = page.locator('#team')
        if (await team.count()) await team.first().scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {})
        await page.waitForTimeout(300)
        const cards = await page.evaluate(measureTeamCardsInPage, { timeoutMs })
        out.viewports[name] = { cards, failing: scoreCards(cards) }
      } catch (error) {
        out.viewports[name] = { error: error.message.split('\n')[0], cards: [], failing: [] }
      } finally {
        await context.close()
      }
    }
  } finally {
    if (!existing) await browser.close()
  }
  return out
}

/** One page-check row from the measurements: fail when any card on any viewport fails or a viewport did not load. */
export function teamPhotoFramingCheck(measured) {
  const problems = []
  const summary = []
  const unmeasured = []
  for (const [viewport, v] of Object.entries(measured.viewports)) {
    if (v.error) { problems.push(`${viewport}: ${v.error}`); continue }
    summary.push(`${viewport} ${v.cards.length} card${v.cards.length === 1 ? '' : 's'}`)
    for (const card of v.failing) problems.push(`${viewport} ${describeFrame(card)} (${card.verdict.reason})`)
    for (const card of v.cards.filter((c) => c.verdict.result === 'unmeasured')) unmeasured.push(`${viewport} ${card.name} (${card.verdict.reason})`)
  }
  const total = Object.values(measured.viewports).reduce((n, v) => n + (v.cards?.length || 0), 0)
  const tail = unmeasured.length ? `; unmeasured: ${unmeasured.join(', ')}` : ''
  return {
    id: 'team-photo-framing',
    result: problems.length ? 'fail' : 'pass',
    detail: (problems.length ? problems.join('; ') : (total ? `${summary.join(', ')}: no card cuts the top of its portrait (top cut <= ${MAX_TOP_CUT}; visible height >= ${MIN_VISIBLE_HEIGHT}; side cut <= ${HORIZONTAL_MAX_EDGE_CUT} per edge)` : 'no team cards on this page')) + tail,
    viewports: Object.fromEntries(Object.entries(measured.viewports).map(([name, v]) => [name, v.error ? { error: v.error } : { cards: v.cards.map(({ name: n, kind, decoded, naturalWidth, naturalHeight, boxWidth, boxHeight, objectFit, objectPosition, frame, verdict, selector, src }) => ({ name: n, kind, decoded, naturalWidth, naturalHeight, boxWidth, boxHeight, objectFit, objectPosition, coverage: frame.coverage, croppedAxis: frame.croppedAxis, croppedEdges: frame.croppedEdges, cut: frame.cut, result: verdict.result, reason: verdict.reason, selector, src })) }])),
  }
}
