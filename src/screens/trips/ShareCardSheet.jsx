import { useEffect, useMemo, useRef, useState } from 'react'
import { Sheet, Button, Field, Switch, SegmentedControl, Text } from '../../ui'
import { useAuthStore } from '../../store'
import { track } from '../../lib/analytics'
import { buildShareCard } from '../../lib/shareCard'
import { renderShareCard, canvasToBlob, shareCardImage, canShareFiles } from '../../lib/shareCardRender'

const PREF_KEY = 'stt_share_card'
const SIZES = [{ value: 'story', label: 'Story' }, { value: 'square', label: 'Square' }]
const LOOKS = [{ value: 'dark', label: 'Dark' }, { value: 'terracotta', label: 'Terracotta' }]

function readPref() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}')
    return { size: SIZES.some(o => o.value === p.size) ? p.size : 'story', look: LOOKS.some(o => o.value === p.look) ? p.look : 'dark' }
  } catch { return { size: 'story', look: 'dark' } }
}

/** Preview and share the trip recap image. Nothing leaves the device until the member taps Share. */
export default function ShareCardSheet({ trip, onClose }) {
  const stats = useAuthStore(s => s.stats)
  const badges = useAuthStore(s => s.badges)
  const [pref, setPref] = useState(readPref)
  const [title, setTitle] = useState(trip.title || '')
  const [hideDates, setHideDates] = useState(false)
  const [caption, setCaption] = useState(null) // null = follow the title; a string once the member edits it
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef(null)
  const blobRef = useRef(null)
  const canFiles = useMemo(canShareFiles, [])

  const model = useMemo(() => buildShareCard({
    trip, stops: trip.trip_stops || [], bookings: trip.bookings || [], stats, badges, title, hideDates,
  }), [trip, stats, badges, title, hideDates])
  const text = caption ?? model.caption

  useEffect(() => { track('share_card_preview') }, [])
  // Draw the preview (debounced) and keep the PNG ready, so the Share tap can call the share sheet at once
  useEffect(() => {
    let alive = true
    blobRef.current = null
    const t = setTimeout(() => {
      renderShareCard(model, { size: pref.size, look: pref.look, canvas: canvasRef.current })
        .then(canvasToBlob)
        .then(b => { if (alive) { blobRef.current = b; setStatus(s => (s === 'Could not draw the card' ? '' : s)) } })
        .catch(() => { if (alive) setStatus('Could not draw the card') })
    }, 150)
    return () => { alive = false; clearTimeout(t) }
  }, [model, pref])

  const choose = (patch) => {
    setPref(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(PREF_KEY, JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }

  const share = () => {
    const blob = blobRef.current
    if (!blob) { setStatus('Still drawing the card. Try again in a moment.'); return }
    setBusy(true); setStatus('')
    // shareCardImage calls navigator.share (or starts the clipboard write) before any await
    shareCardImage({ blob, caption: text, title: model.title }).then(({ result, copied }) => {
      if (result === 'cancelled') return
      if (result === 'failed') { setStatus('Could not share the image. Try again.'); return }
      track('share_card_shared', { size: pref.size, look: pref.look, how: result === 'shared' ? 'sheet' : 'download', edited: title.trim() !== (trip.title || '').trim(), hide_dates: hideDates })
      setStatus(result === 'shared' ? 'Shared' : copied ? 'Download started and caption copied' : 'Download started')
    }).catch(() => setStatus('Could not share the image. Try again.')).finally(() => setBusy(false))
  }

  const copyCaption = async () => {
    try { await navigator.clipboard.writeText(text); setStatus('Caption copied') } catch { setStatus('Select the caption to copy it') }
  }

  return (
    <Sheet onClose={onClose} title="Share trip" subtitle="Preview the card before you share it" size="tall"
      footer={(
        <div className="share-card__actions">
          <Button variant="primary" size="lg" block icon={canFiles ? 'share' : 'download'} loading={busy} onClick={share}>
            {canFiles ? 'Share image' : 'Download image'}
          </Button>
          <Button variant="ghost" block icon="copy" onClick={copyCaption}>Copy caption</Button>
        </div>
      )}>
      <div className="share-card">
        <div className="share-card__stage">
          <canvas ref={canvasRef} className={`share-card__canvas share-card__canvas--${pref.size}`} role="img" aria-label={model.alt} />
        </div>
        <SegmentedControl role="radiogroup" label="Card size" options={SIZES} value={pref.size} onChange={v => choose({ size: v })} idPrefix="sc-size" />
        <SegmentedControl role="radiogroup" label="Card look" options={LOOKS} value={pref.look} onChange={v => choose({ look: v })} idPrefix="sc-look" />
        <Field label="Edit title" value={title} maxLength={60} onChange={e => setTitle(e.target.value)}
          hint="Only what you see in the preview is shared." />
        <Switch checked={hideDates} onChange={setHideDates} label="Hide dates" description="Leaves the month and year off the card" />
        <Field label="Caption" as="textarea" rows={4} value={text} onChange={e => setCaption(e.target.value)} />
        <Text variant="caption" tone="muted" as="p" role="status" aria-live="polite" className="share-card__status">{status}</Text>
      </div>
    </Sheet>
  )
}
