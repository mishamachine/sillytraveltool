// Share card drawing, canvas 2D only: text, rounded rectangles, dots, the Goose mark and badge icons.
// No DOM access here (the Goose image and icon painter come in through `assets`), so tests can drive it with a
// recording context. Story keeps the top 250 px and bottom 340 px free of key content (Stories and TikTok UI sit there).
// Layout: blocks are measured first, scaled down until they fit the safe area, then spread evenly to fill it.
import { CARD_SIZES } from './shareCard.js'

export const SAFE_TOP = 250
export const SAFE_BOTTOM = 340

const HEAD = '"Space Grotesk", system-ui, sans-serif'
const BODY = '"DM Sans", system-ui, sans-serif'
const head = n => `700 ${n}px ${HEAD}`
const body = (n, w = 400) => `${w} ${n}px ${BODY}`

// top/bottom: the band the blocks fill (story: inside the safe area; the CTA ends at `bottom`)
const LAYOUT = {
  story: { mx: 90, top: 262, bottom: 1560, title: 154, date: 42, route: 42, num: 250, hero: 380, label: 40, heroLabel: 52, extra: 46, line: 46, goose: 380, chip: 80, cta: 36, site: 32, minGap: 40, maxGap: 120 },
  square: { mx: 72, top: 64, bottom: 1020, title: 112, date: 34, route: 34, num: 150, hero: 250, label: 30, heroLabel: 40, extra: 36, line: 36, goose: 230, chip: 64, cta: 30, site: 28, minGap: 24, maxGap: 60 },
}

/** Cut at a word boundary and add an ellipsis; only a single over-long word is cut by characters. */
function fit(ctx, str, maxW) {
  if (ctx.measureText(str).width <= maxW) return str
  const words = str.split(' ')
  while (words.length > 1) {
    words.pop()
    const s = `${words.join(' ')}…`
    if (ctx.measureText(s).width <= maxW) return s
  }
  let s = words[0]
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1)
  return `${s}…`
}

/** Word-wrap to maxW; breaks a single over-long word by characters. */
function wrap(ctx, str, maxW) {
  const lines = []
  let cur = ''
  for (const word of str.split(' ')) {
    const next = cur ? `${cur} ${word}` : word
    if (ctx.measureText(next).width <= maxW) { cur = next; continue }
    if (cur) lines.push(cur)
    cur = ''
    let w = word
    while (ctx.measureText(w).width > maxW && w.length > 1) {
      let i = w.length - 1
      while (i > 1 && ctx.measureText(w.slice(0, i)).width > maxW) i--
      lines.push(w.slice(0, i)); w = w.slice(i)
    }
    cur = w
  }
  if (cur) lines.push(cur)
  return lines
}

const circle = (ctx, x, y, r, fill) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill() }
const pill = (ctx, x, y, w, h, fill) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, h / 2) : ctx.rect(x, y, w, h); ctx.fillStyle = fill; ctx.fill() }

/** Title: the largest size (down to 72) that fits in two lines; else three lines at the largest size that fits; else cut at a word. */
function titleLines(ctx, title, maxW, start) {
  for (const maxLines of [2, 3]) {
    for (let ts = start; ts >= 72; ts -= 6) {
      ctx.font = head(ts)
      const lines = wrap(ctx, title, maxW)
      if (lines.length <= maxLines) return { ts, lines }
    }
  }
  ctx.font = head(72)
  const lines = wrap(ctx, title, maxW)
  return { ts: 72, lines: [...lines.slice(0, 2), fit(ctx, lines.slice(2).join(' '), maxW)] }
}

export function drawShareCard(ctx, model, { size = 'story', palette: P, assets }) {
  const { w: W, h: H } = CARD_SIZES[size]
  const L = LAYOUT[size] || LAYOUT.story
  const maxW = W - L.mx * 2
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  const put = (str, x, y, font, color, align = 'left') => {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align
    ctx.fillText(str, x, y)
  }

  // Build every block at scale k: { h, draw(y) }
  const build = (k) => {
    const blocks = []
    const hero = model.trio.length === 1 && model.trio[0].hero

    // Header: overline, title, month and year
    const { ts, lines } = titleLines(ctx, model.title, maxW, Math.round(L.title * (0.6 + 0.4 * k)))
    const lh = Math.round(ts * 1.08)
    const dateH = model.dateLine ? 14 + L.date : 0
    blocks.push({
      h: 30 + 22 + lines.length * lh + dateH,
      draw(y) {
        if ('letterSpacing' in ctx) ctx.letterSpacing = '6px'
        put(model.overline, L.mx, y, body(28, 600), P.accent)
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'
        y += 52
        for (const ln of lines) { put(ln, L.mx, y, head(ts), P.text); y += lh }
        if (model.dateLine) put(model.dateLine, L.mx, y + 14, body(L.date, 500), P.soft)
      },
    })

    // Route strip: city names joined by dots, first city first, up to two lines
    const items = [...model.route.cities, ...(model.route.more ? [`+${model.route.more} more`] : [])]
    if (items.length) {
      const rlh = Math.round(L.route * 1.5)
      ctx.font = body(L.route, 500)
      let x = L.mx, row = 0
      const placed = items.map((raw, i) => {
        const t = fit(ctx, raw, maxW), tw = ctx.measureText(t).width
        let dot = false
        if (i > 0 && x + 36 + tw > L.mx + maxW) { row++; x = L.mx } else if (i > 0) { dot = true; x += 36 }
        const it = { t, x, row, dot }
        x += tw
        return it
      })
      blocks.push({
        h: (row + 1) * rlh - (rlh - L.route),
        draw(y) {
          for (const it of placed) {
            if (it.dot) circle(ctx, it.x - 18, y + it.row * rlh + L.route * 0.55, 5, P.accent)
            put(it.t, it.x, y + it.row * rlh, body(L.route, 500), P.text)
          }
        },
      })
    }

    // Big trio (days, cities, countries); with one city a single giant days number and the place under it
    if (model.trio.length) {
      const colW = maxW / model.trio.length
      const base = Math.round((hero ? L.hero : L.num) * k)
      const labelS = hero ? L.heroLabel : L.label
      blocks.push({
        h: base + 4 + labelS,
        draw(y) {
          model.trio.forEach((s, i) => {
            let ns = base
            ctx.font = head(ns)
            while (ns > 60 && ctx.measureText(String(s.value)).width > colW - 24) { ns -= 6; ctx.font = head(ns) }
            put(String(s.value), L.mx + i * colW, y, head(ns), P.text)
            put(s.label, L.mx + i * colW + 4, y + base + 4, body(labelS, 600), P.soft)
          })
        },
      })
    }

    // Smaller row: flights and trips completed
    if (model.extras.length) {
      blocks.push({
        h: L.extra,
        draw(y) {
          let x = L.mx
          model.extras.forEach((s, i) => {
            if (i) { circle(ctx, x + 22, y + L.extra * 0.55, 5, P.accent); x += 44 }
            const n = String(s.value)
            put(n, x, y, head(L.extra), P.text); ctx.font = head(L.extra); x += ctx.measureText(n).width + 12
            put(s.label, x, y + 2, body(L.extra - 6, 600), P.soft); ctx.font = body(L.extra - 6, 600); x += ctx.measureText(s.label).width
          })
        },
      })
    }

    // Goose line (left) and the Goose (right), never over text
    const gs = Math.round(L.goose * k)
    const gx = W - L.mx - gs
    ctx.font = body(L.line, 500)
    const gl = wrap(ctx, model.gooseLine, Math.max(200, gx - L.mx - 30)).slice(0, 4)
    const glh = Math.round(L.line * 1.35)
    const bandH = Math.max(gl.length * glh, gs * 0.85)
    const goose = {}
    blocks.push({
      h: bandH,
      draw(y) {
        goose.x = gx + gs / 2; goose.y = y + bandH / 2
        assets.goose(ctx, goose.x, goose.y, gs)
        const top = y + (bandH - gl.length * glh) / 2
        gl.forEach((ln, i) => put(ln, L.mx, top + i * glh, body(L.line, 500), P.text))
      },
    })

    // Chip row: Goose score, then up to four badge icons
    if (model.score || model.badges.length) {
      blocks.push({
        h: L.chip,
        draw(y) {
          let x = L.mx
          if (model.score) {
            const num = model.score.toLocaleString('en-US')
            ctx.font = head(L.chip * 0.5)
            const nw = ctx.measureText(num).width
            ctx.font = body(L.chip * 0.38, 600)
            const lw = ctx.measureText('Goose score').width
            const cw = nw + lw + 28 + 20
            pill(ctx, x, y, cw, L.chip, P.chip)
            put(num, x + 28, y + L.chip * 0.22, head(L.chip * 0.5), P.text)
            put('Goose score', x + 28 + nw + 12, y + L.chip * 0.3, body(L.chip * 0.38, 600), P.text)
            x += cw + 14
          }
          for (const b of model.badges) {
            circle(ctx, x + L.chip / 2, y + L.chip / 2, L.chip / 2, P.chip)
            assets.icon(ctx, b.icon, x + L.chip / 2, y + L.chip / 2, L.chip * 0.56, P.text)
            x += L.chip + 12
          }
        },
      })
    }

    // Footer: call to action, ends at the bottom of the band
    blocks.push({
      cta: true,
      h: L.cta + 8 + L.site,
      draw(y) {
        put(model.cta, L.mx, y, body(L.cta, 600), P.text)
        put(model.site, L.mx, y + L.cta + 8, body(L.site, 600), P.accent)
      },
    })
    return { blocks, goose }
  }

  // Shrink the big numbers, title and Goose until everything fits, then spread the blocks to fill the band
  const avail = L.bottom - L.top
  let k = 1, built = build(k)
  const total = b => b.blocks.reduce((n, x) => n + x.h, 0)
  while (k > 0.45 && total(built) + L.minGap * (built.blocks.length - 1) > avail) { k = Math.round((k - 0.05) * 100) / 100; built = build(k) }
  const { blocks, goose } = built
  const gap = Math.min(L.maxGap, Math.max(L.minGap, (avail - total(built)) / (blocks.length - 1)))
  let y = L.top
  for (const b of blocks) {
    if (b.cta) b.draw(L.bottom - b.h)
    else { b.draw(y); y += b.h + gap }
  }

  // Background and the large soft circle behind the Goose, painted last and underneath everything already drawn
  ctx.globalCompositeOperation = 'destination-over'
  circle(ctx, goose.x + 40, goose.y, L.goose * 1.7, P.disc)
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'source-over'
}
