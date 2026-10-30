// Share card drawing, canvas 2D only: text, rounded rectangles, dots, the Goose mark and badge icons.
// No DOM access here (the Goose image and icon painter come in through `assets`), so tests can drive it with a
// recording context. Story keeps the top 250 px and bottom 340 px free of key content (Stories and TikTok UI sit there).
import { CARD_SIZES } from './shareCard.js'

export const SAFE_TOP = 250
export const SAFE_BOTTOM = 340

const HEAD = '"Space Grotesk", system-ui, sans-serif'
const BODY = '"DM Sans", system-ui, sans-serif'
const head = n => `700 ${n}px ${HEAD}`
const body = (n, w = 400) => `${w} ${n}px ${BODY}`

const LAYOUT = {
  story: { mx: 90, top: 262, title: 110, date: 38, route: 38, num: 150, label: 32, extra: 40, line: 40, goose: 250, chip: 72, cta: 32, site: 28, ctaY: 1500, gap: 56 },
  square: { mx: 72, top: 70, title: 92, date: 32, route: 32, num: 116, label: 28, extra: 34, line: 34, goose: 180, chip: 60, cta: 28, site: 26, ctaY: 960, gap: 30 },
}

function fit(ctx, str, maxW) {
  if (ctx.measureText(str).width <= maxW) return str
  let s = str
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
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

  let y = L.top
  // 1. Overline
  ctx.font = body(28, 600)
  if ('letterSpacing' in ctx) ctx.letterSpacing = '6px'
  put(model.overline, L.mx, y, body(28, 600), P.accent)
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'
  y += 28 + 22

  // 2. Title: hero, up to two lines, shrinks to fit then ellipsises
  let ts = L.title, lines
  for (;;) {
    ctx.font = head(ts)
    lines = wrap(ctx, model.title, maxW)
    if (lines.length <= 2 || ts <= 64) break
    ts -= 8
  }
  if (lines.length > 2) lines = [lines[0], fit(ctx, lines.slice(1).join(' '), maxW)]
  for (const ln of lines) { put(ln, L.mx, y, head(ts), P.text); y += Math.round(ts * 1.08) }
  y += 14

  // 3. Month and year
  if (model.dateLine) { put(model.dateLine, L.mx, y, body(L.date, 500), P.soft); y += L.date + L.gap }
  else y += 10

  // 4. Route strip: city names joined by dots, first city first, up to two lines
  const items = [...model.route.cities, ...(model.route.more ? [`+${model.route.more} more`] : [])]
  if (items.length) {
    ctx.font = body(L.route, 500)
    let x = L.mx
    items.forEach((raw, i) => {
      const t = fit(ctx, raw, maxW)
      const tw = ctx.measureText(t).width
      const lead = i === 0 ? 0 : 36
      if (x + lead + tw > L.mx + maxW && i > 0) { x = L.mx; y += Math.round(L.route * 1.5) }
      else if (i > 0) { circle(ctx, x + 18, y + L.route * 0.55, 5, P.accent); x += lead }
      put(t, x, y, body(L.route, 500), P.text); x += tw
    })
    y += Math.round(L.route * 1.5) + L.gap
  }

  // 5. Big trio: days, cities, countries (only those above zero)
  if (model.trio.length) {
    const colW = maxW / model.trio.length
    model.trio.forEach((s, i) => {
      let ns = L.num
      ctx.font = head(ns)
      while (ns > 60 && ctx.measureText(String(s.value)).width > colW - 24) { ns -= 6; ctx.font = head(ns) }
      put(String(s.value), L.mx + i * colW, y, head(ns), P.text)
      put(s.label, L.mx + i * colW + 4, y + L.num + 4, body(L.label, 500), P.soft)
    })
    y += L.num + 4 + L.label + L.gap
  }

  // 6. Smaller row: flights and trips completed
  if (model.extras.length) {
    let x = L.mx
    model.extras.forEach((s, i) => {
      if (i) { circle(ctx, x + 22, y + L.extra * 0.55, 5, P.accent); x += 44 }
      const n = String(s.value)
      put(n, x, y, head(L.extra), P.text); ctx.font = head(L.extra); x += ctx.measureText(n).width + 12
      put(s.label, x, y + 2, body(L.extra - 6, 500), P.soft); ctx.font = body(L.extra - 6, 500); x += ctx.measureText(s.label).width
    })
    y += L.extra + L.gap
  }

  // 7. Goose line (left) with the Goose, bottom-right of the hero, on its own soft circle (never over text)
  const gx = W - L.mx - L.goose
  const lineW = gx - L.mx - 30
  ctx.font = body(L.line, 500)
  const gl = wrap(ctx, model.gooseLine, lineW).slice(0, 4)
  const bandH = Math.max(gl.length * Math.round(L.line * 1.35), L.goose * 0.85)
  const gcx = gx + L.goose / 2, gcy = y + bandH / 2
  assets.goose(ctx, gcx, gcy, L.goose)
  const lineH = Math.round(L.line * 1.35), textTop = y + (bandH - gl.length * lineH) / 2
  gl.forEach((ln, i) => put(ln, L.mx, textTop + i * lineH, body(L.line, 500), P.text))
  y += bandH + L.gap * 0.6

  // 8. Chip row: Goose score, then up to four badge icons
  if (model.score || model.badges.length) {
    let x = L.mx
    if (model.score) {
      const num = model.score.toLocaleString('en-US')
      ctx.font = head(L.chip * 0.5)
      const nw = ctx.measureText(num).width
      ctx.font = body(L.chip * 0.38, 500)
      const lw = ctx.measureText('Goose score').width
      const cw = nw + lw + 28 + 20
      pill(ctx, x, y, cw, L.chip, P.chip)
      put(num, x + 28, y + L.chip * 0.22, head(L.chip * 0.5), P.text)
      put('Goose score', x + 28 + nw + 12, y + L.chip * 0.3, body(L.chip * 0.38, 500), P.soft)
      x += cw + 14
    }
    for (const b of model.badges) {
      circle(ctx, x + L.chip / 2, y + L.chip / 2, L.chip / 2, P.chip)
      assets.icon(ctx, b.icon, x + L.chip / 2, y + L.chip / 2, L.chip * 0.56, P.text)
      x += L.chip + 12
    }
  }

  // 9. Footer: call to action and site (inside the safe area on the story)
  const cy = L.ctaY
  put(model.cta, L.mx, cy, body(L.cta, 600), P.text)
  put(model.site, L.mx, cy + L.cta + 8, body(L.site, 500), P.accent)
  // Background and the large soft circle behind the Goose, painted last and underneath everything already drawn
  ctx.globalCompositeOperation = 'destination-over'
  circle(ctx, gcx + 40, gcy, L.goose * 1.7, P.disc)
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'source-over'
  return y
}
