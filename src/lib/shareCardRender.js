// Share card in the browser: loads the fonts, paints the card onto a canvas at the exact pixel size (the size is
// never multiplied by devicePixelRatio, so the exported PNG is always 1080 wide), and hands the PNG to the share sheet.
import gooseSvg from '../../docs/brand/logos/goose-mark.svg?raw'
import { ICONS } from '../ui/icons/paths'
import { CARD_SIZES } from './shareCard'
import { drawShareCard } from './shareCardDraw'
import { SHARE_CARD_LOOKS } from './tokens'


/** Fonts must be ready before drawing, or the canvas silently falls back to the system font. */
export async function loadCardFonts() {
  if (!document.fonts) return
  let timer
  try {
    await Promise.race([Promise.all([
      document.fonts.load(`700 100px "Space Grotesk"`),
      document.fonts.load(`500 40px "DM Sans"`),
      document.fonts.load(`600 40px "DM Sans"`),
    ]).then(() => document.fonts.ready), new Promise(r => { timer = setTimeout(r, 4000) })])
  } catch { /* draw with the fallback font */ } finally { clearTimeout(timer) }
}

let gooseImg
function loadGoose() {
  gooseImg ||= new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(gooseSvg)}`
  })
  return gooseImg
}

const iconPaths = {}
function paintIcon(ctx, name, cx, cy, size, color) {
  const defs = ICONS[name] || ICONS.award
  const paths = (iconPaths[name] ||= defs.map(d => new Path2D(d)))
  ctx.save()
  ctx.translate(cx - size / 2, cy - size / 2)
  ctx.scale(size / 24, size / 24)
  ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const p of paths) ctx.stroke(p)
  ctx.restore()
}

/** Paint the card onto `canvas` (created when omitted) at exactly 1080 x 1920 or 1080 x 1080. */
export async function renderShareCard(model, { size = 'story', look = 'dark', canvas } = {}) {
  const { w, h } = CARD_SIZES[size]
  const [, img] = await Promise.all([loadCardFonts(), loadGoose()])
  const c = canvas || document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  const assets = {
    icon: paintIcon,
    // The mark is a 132 x 104 drawing centred in a square image
    goose: (cx, x, y, s) => img && cx.drawImage(img, x - s / 2, y - s / 2, s, s),
  }
  drawShareCard(ctx, model, { size, palette: SHARE_CARD_LOOKS[look] || SHARE_CARD_LOOKS.dark, assets })
  return c
}

export const canvasToBlob = c => new Promise((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error('png'))), 'image/png'))

/**
 * Share the PNG on the member's tap. Call it straight from the click handler with a Blob that is already made:
 * Safari only allows share and clipboard calls made before any other await. Returns
 * { result: 'shared' | 'cancelled' | 'downloaded' | 'failed', copied } and never claims more than happened:
 * 'downloaded' means the browser was asked to save the file; `copied` is true only if the caption reached the clipboard.
 */
export function shareCardImage({ blob, caption, title }) {
  const file = new File([blob], 'trip-recap.png', { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    return navigator.share({ files: [file], text: caption, title }).then(
      () => ({ result: 'shared', copied: false }),
      e => (e?.name === 'AbortError' ? { result: 'cancelled', copied: false } : downloadCard(blob, caption)),
    )
  }
  return downloadCard(blob, caption)
}

async function downloadCard(blob, caption) {
  // Start the clipboard write first, in the same tap, then the download
  const copying = navigator.clipboard?.writeText ? navigator.clipboard.writeText(caption).then(() => true, () => false) : Promise.resolve(false)
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'trip-recap.png'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
    return { result: 'downloaded', copied: await copying }
  } catch {
    return { result: 'failed', copied: await copying }
  }
}

export const canShareFiles = () => {
  try { return !!navigator.canShare?.({ files: [new File([''], 'a.png', { type: 'image/png' })] }) } catch { return false }
}
