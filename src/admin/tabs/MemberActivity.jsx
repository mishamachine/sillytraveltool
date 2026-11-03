import { api } from '../api'
import { Badge, Bars, Sized, BarList, Table, Loading, ErrorNote, useLoad, fmtDate, num, minutes,
  PHASES, PHASE_LABEL, FREQUENCY, FREQUENCY_HINT, CHANNEL_LABEL } from '../ui'

// Member page: how often they use the app, on and off their trips, and their trips with how each plan was added.
// Reads member_activity_daily (one row per day of use, refreshed hourly) through admin_member_activity.

const FREQ_LABEL = Object.fromEntries(FREQUENCY)
const freqTone = (f) => ({ daily: 'ok', weekly: 'ok', monthly: 'info', occasional: 'warn', dormant: 'warn' }[f] || 'neutral')
const DAY = 86400000
const isoDay = (t) => new Date(t).toISOString().slice(0, 10)

export function Legend() {
  return (
    <div className="a-legend">
      {PHASES.slice(0, 4).map(([k, label]) => <span key={k}><i className={`is-${k}`} />{label}</span>)}
    </div>
  )
}

// Days of use from 30 days before a trip starts to 21 after, summed over this member's (or everyone's) trips
export function TripCurve({ rows, value = 'active_min', unit = 'min', tripDays }) {
  const by = Object.fromEntries((rows || []).map(r => [r.trip_day, r]))
  const data = Array.from({ length: 52 }, (_, i) => {
    const d = i - 30
    const v = Number(by[d]?.[value] || 0)
    const tone = d < 0 ? 'pre_trip' : tripDays && d >= tripDays ? 'post_trip' : null
    return { key: d, value: v, tone, title: `${d < 0 ? `${-d} days before` : d === 0 ? 'Start day' : `Day ${d + 1}`}: ${num(v)} ${unit}` }
  })
  return (
    <>
      <Bars data={data} height={80} label="Use around the trip start" />
      <div className="a-axis"><span>30 days before</span><Sized className="a-axis__at" vars={{ '--at': `${(30.5 / 52) * 100}%` }}>Trip starts</Sized><span>3 weeks after start</span></div>
    </>
  )
}

export default function MemberActivity({ id, fallbackTrips }) {
  const r = useLoad(() => api.memberActivity(id), [id])
  if (r.error) return <section><h3>Usage</h3><ErrorNote error={r.error} onRetry={r.reload} /></section>
  if (!r.data) return <section><h3>Usage</h3><Loading /></section>
  const { frequency: f, days, phases, trips } = r.data
  const byDay = Object.fromEntries(days.map(d => [d.day, d]))
  const today = Date.now()
  const last90 = Array.from({ length: 90 }, (_, i) => {
    const day = isoDay(today - (89 - i) * DAY)
    const d = byDay[day]
    const v = d ? Math.max(1, Math.round(d.active_seconds / 60)) : 0
    return { key: day, day, value: v, tone: d?.phase === 'on_trip' ? null : d?.phase,
      title: d ? `${fmtDate(day)}: ${d.sessions} sessions, ${minutes(d.active_seconds)} · ${PHASE_LABEL[d.phase]}${d.trip_day != null && d.phase === 'on_trip' ? `, day ${d.trip_day + 1}` : ''}` : `${fmtDate(day)}: not used` }
  })
  const curve = Object.values(days.filter(d => d.trip_day != null).reduce((acc, d) => {
    const k = d.trip_day
    acc[k] = acc[k] || { trip_day: k, active_min: 0, sessions: 0 }
    acc[k].active_min += d.active_seconds / 60; acc[k].sessions += d.sessions
    return acc
  }, {}))
  const phaseRows = PHASES.filter(([k]) => phases[k]).map(([k, label]) => ({
    label, value: phases[k].days, sub: `days · ${num(phases[k].sessions)} sessions · ${num(phases[k].active_min)} min`,
  }))

  return (
    <>
      <section>
        <div className="a-row a-row--between">
          <h3>How often they use it</h3>
          <Badge tone={freqTone(f.frequency)}>{FREQ_LABEL[f.frequency] || f.frequency}</Badge>
        </div>
        <dl className="a-facts">
          <div><dt>Last 28 days</dt><dd>{f.days_28 != null ? `${f.days_28} days · ${num(f.sessions_28)} sessions · ${num(f.active_min_28)} min` : 'Not used'}</dd></div>
          <div><dt>Weeks active (of 4)</dt><dd>{f.weeks_4 ?? 0}</dd></div>
          <div><dt>Last day used</dt><dd>{f.last_day ? fmtDate(f.last_day) : '—'}</dd></div>
        </dl>
        <Bars data={last90} height={64} label="Minutes in the app per day, last 90 days" />
        <div className="a-axis"><span>90 days ago</span><span>Today</span></div>
        <Legend />
        <p className="a-hint">{FREQUENCY_HINT} A day counts when they open the app (signed in, usage stats on). Bars are minutes, coloured by where they were in their trips.</p>
      </section>

      <section>
        <h3>On and off their trips</h3>
        <BarList rows={phaseRows} empty="No days of use recorded yet." />
        {curve.length > 0 && <TripCurve rows={curve} />}
        <p className="a-hint">Before a trip: one starts within 60 days. Just back: one ended within 14 days. Recorded from Oct 21, 2026 on.</p>
      </section>

      <section>
        <h3>Trips</h3>
        <Table rowKey={t => t.id} rows={trips || fallbackTrips || []} empty="No trips yet." cols={[
          { key: 'city', label: 'Where', render: t => `${t.city || '—'}${t.country?.trim() ? `, ${t.country}` : ''}` },
          { key: 'start', label: 'Dates', render: t => t.start ? `${fmtDate(t.start)} – ${fmtDate(t.end)}` : 'No dates yet', sortValue: t => t.start },
          { key: 'bookings', label: 'Bookings', num: true },
          { key: 'plans', label: 'Plans', num: true },
          { key: 'ideas', label: 'Ideas', num: true },
          { key: 'by_channel', label: 'How they were added', render: t => Object.entries(t.by_channel || {}).sort((a, b) => b[1] - a[1])
            .map(([k, n]) => `${n} ${CHANNEL_LABEL[k] || k}`).join(', ') || '—' },
          { key: 'active_days_on', label: 'Days used on trip', num: true },
          { key: 'owner', label: 'Role', render: t => t.owner ? 'Owner' : 'Traveller' },
        ]} />
        <p className="a-hint">Places, dates and counts only. Booking details never reach the cockpit. Paste or file import includes older email imports made inside the app; the exact path is recorded for new bookings from this release on.</p>
      </section>
    </>
  )
}
