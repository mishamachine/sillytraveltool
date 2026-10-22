// Google place media: photos, static maps, ratings. All load lazily through src/lib/places.js and
// render nothing when Google has nothing (or the app is offline / in demo mode).
import { useEffect, useRef, useState } from 'react'
import { photoUrl, staticMapUrl } from '../../lib/places'
import { getSavedTheme, resolveDark } from '../../lib/theme'
import { Chip, Text, cx } from '../../ui'
import './placeMedia.css'

/** Starts loading once the element is near the viewport. */
function useNearViewport() {
  const ref = useRef(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (near || !ref.current) return
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect() } }, { rootMargin: '200px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [near])
  return [ref, near]
}

function useAsync(fn, deps, enabled) {
  const [value, setValue] = useState(null)
  useEffect(() => {
    if (!enabled) return
    let live = true
    fn().then(v => { if (live) setValue(v) })
    return () => { live = false }
  }, [enabled, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  return value
}

/** A Google place photo (`name` is the photo reference). */
export function PlacePhoto({ name, alt = '', w = 640, className }) {
  const [ref, near] = useNearViewport()
  const url = useAsync(() => photoUrl(name, w), [name, w], near && !!name)
  const [failed, setFailed] = useState(false)
  if (!name || failed) return null
  return (
    <div ref={ref} className={cx('place-photo', !url && 'is-loading', className)}>
      {url && <img src={url} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />}
    </div>
  )
}

/** Static Google map with terracotta pins; follows the app theme. */
export function StaticMap({ markers, alt = 'Map', w = 600, h = 260, zoom, className }) {
  const [ref, near] = useNearViewport()
  const dark = resolveDark(getSavedTheme())
  const key = JSON.stringify(markers || [])
  const url = useAsync(() => staticMapUrl({ markers, w, h, zoom, dark }), [key, w, h, zoom, dark], near)
  if (!markers?.some(m => m && isFinite(m.lat) && isFinite(m.lng))) return null
  return (
    <div ref={ref} className={cx('place-map', !url && 'is-loading', className)}>
      {url && <img src={url} alt={alt} decoding="async" />}
    </div>
  )
}

/** "4.6 (2,341)" from Google reviews. */
export function GoogleRating({ rating, count }) {
  if (rating == null) return null
  const n = count ? ` (${Number(count).toLocaleString()})` : ''
  return <Chip icon="star" aria-label={`Google rating ${rating} out of 5${count ? ` from ${count} reviews` : ''}`}>{`${Number(rating).toFixed(1)}${n}`}</Chip>
}

export function OpenNow({ open }) {
  if (open == null) return null
  return <Chip tone={open ? 'success' : 'danger'} icon="clock">{open ? 'Open now' : 'Closed now'}</Chip>
}

/** Google's terms require attribution wherever Places data is shown without a Google map. */
export function GoogleAttribution({ className }) {
  return <Text variant="micro" tone="muted" as="p" className={cx('place-attrib', className)}>Places data from Google Maps</Text>
}

/** Where the Goose's words will appear: faint lines that hold the space while they're written. */
export function InkWait({ lines = 1, label }) {
  return (
    <span className="ink-wait" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, i) => <span key={i} className={i === lines - 1 ? 'ink-wait__line ink-wait__line--short' : 'ink-wait__line'} />)}
    </span>
  )
}
