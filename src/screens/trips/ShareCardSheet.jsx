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
  const canFiles = useMemo(canShareFiles, [])

  const model = useMemo(() => buildShareCard({
    trip, stops: trip.trip_stops || [], bookings: trip.bookings || [], stats, badges, title, hideDates,
  }), [trip, stats, badges, title, hideDates])
  const text = caption ?? model.caption

  useEffect(() => { track('share_card_preview') }, [])
  useEffect(() => {
    let alive = true
    renderShareCard(model, { size: pref.size, look: pref.look, canvas: canvasRef.current }).catch(() => { if (alive) setStatus('Could not draw the card') })
    return () => { alive = false }
  }, [model, pref])

  const choose = (patch) => {
    const next = { ...pref, ...patch }
    setPref(next)
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)) } catch { /* private mode */ }
  }

  const share = async () => {
    setBusy(true); setStatus('')
    try {
      const canvas = await renderShareCard(model, { size: pref.size, look: pref.look })
      const blob = await canvasToBlob(canvas)
      const how = await shareCardImage({ blob, caption: text, title: model.title })
      if (how === 'cancelled') return
      track('share_card_shared', { size: pref.size, look: pref.look, how: how === 'shared' ? 'sheet' : 'download', edited_title: title.trim() !== (trip.title || '').trim(), hide_dates: hideDates })
      setStatus(how === 'shared' ? 'Shared' : 'Image saved and caption copied')
    } catch { setStatus('Could not make the image. Try again.') } finally { setBusy(false) }
  }

  const copyCaption = async () => {
    try { await navigator.clipboard.writeText(text); setStatus('Caption copied') } catch { setStatus('Select the caption to copy it') }
  }

  return (
    <Sheet onClose={onClose} title="Share trip" subtitle="Preview the card before you share it" size="tall"
      footer={(
        <div className="share-card__actions">
          <Button variant="primary" size="lg" block icon={canFiles ? 'share' : 'download'} loading={busy} onClick={share}>
            {canFiles ? 'Share image' : 'Save image'}
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
          hint="Only the title, month, route and counts go on the card. No bookings, names or prices." />
        <Switch checked={hideDates} onChange={setHideDates} label="Hide dates" description="Leaves the month and year off the card" />
        <Field label="Caption" as="textarea" rows={4} value={text} onChange={e => setCaption(e.target.value)} />
        <Text variant="caption" tone="muted" as="p" role="status" aria-live="polite" className="share-card__status">{status}</Text>
      </div>
    </Sheet>
  )
}
