import { api } from '../api'
import { Card, Stat, Table, BarList, Bars, Loading, ErrorNote, useLoad, ExportButton, ago, minutes, num,
  PHASES, PHASE_LABEL, FREQUENCY, FREQUENCY_HINT, CHANNEL_LABEL } from '../ui'
import { TripCurve, Legend } from './MemberActivity'

// Plain names for the event codes track() sends
const FEATURE = {
  sign_in: 'Signed in', sign_up: 'Signed up', trip_created: 'Created a trip', booking_added: 'Added a booking',
  booking_edited: 'Edited a booking', booking_deleted: 'Deleted a booking', guide_viewed: 'Read a city guide',
  guide_load_more: 'Loaded more of a guide', honk_used: 'Used HONK', translate_used: 'Opened Translate',
  text_translated: 'Translated text', phrases_loaded: 'Loaded a phrasebook', checklist_generated: 'Made a packing list',
  idea_added: 'Saved an idea', idea_booked: 'Booked an idea', currency_converted: 'Converted currency', sos_opened: 'Opened SOS',
  get_there: 'Used Get there', section_overview_open: 'Opened a section overview', import_parsed: 'Imported (read)', import_saved: 'Imported (saved)', import_failed: 'Import failed',
  invite_accepted: 'Accepted an invite', collaborator_role_changed: 'Changed a traveller\'s access', ai_quota_hit: 'Hit an AI limit',
  share_card_preview: 'Previewed a trip card', share_card_shared: 'Shared a trip card',
}
const label = (e) => FEATURE[e] || e.replace(/_/g, ' ')

export default function Product({ filters }) {
  const u = useLoad(() => api.usage(filters), [filters])
  const ctx = useLoad(() => api.context(filters), [filters])
  const eng = useLoad(() => api.engagement(filters), [filters])
  const d = u.data
  if (u.error) return <ErrorNote error={u.error} onRetry={u.reload} />
  if (!d) return <Loading />
  const at = d.active_time || {}
  const features = d.features.map(f => ({ ...f, name: label(f.event) }))
  const least = [...features].sort((a, b) => a.users - b.users || a.uses - b.uses).slice(0, 5)

  return (
    <div className="a-grid">
      <Card title="At a glance" icon="chart" className="a-span-12">
        <div className="a-stats">
          <Stat label="Active members" value={d.active} />
          <Stat label="Free" value={d.active_free} />
          <Stat label="First Class" value={d.active_first_class} />
          <Stat label="Sessions" value={d.sessions} />
          <Stat label="Active time per session" value={at.per_session_min != null ? `${at.per_session_min} min` : '—'}
            hint={at.since ? `measured since ${new Date(at.since).toLocaleDateString()}` : 'starts with the next app release'} />
          <Stat label="Errors" value={d.errors.reduce((s, e) => s + e.n, 0)} invert />
        </div>
        {d.active < 30 && <p className="a-hint">Fewer than 30 active members: read these as counts of people, not percentages.</p>}
      </Card>

      <Engagement e={eng.data} error={eng.error} reload={eng.reload} />

      <Card title="Features, most to least used" icon="compass" className="a-span-7" actions={<ExportButton name="features" rows={features} />}>
        <Table rowKey={f => f.event} rows={features} cols={[
          { key: 'name', label: 'Feature' },
          { key: 'users', label: 'Members', num: true },
          { key: 'pct', label: '% of active', num: true, render: f => f.pct == null ? '—' : `${f.pct}%` },
          { key: 'uses', label: 'Uses', num: true },
          { key: 'free_users', label: 'Free', num: true },
          { key: 'fc_users', label: 'First Class', num: true },
        ]} />
        <p className="a-hint">Measured against everyone active. Exposure (who saw each entry point) is added in build step 2, so a hard-to-find feature isn't mistaken for an unwanted one.</p>
      </Card>

      <div className="a-span-5 a-col">
        <Card title="Least used" icon="alert-circle">
          <BarList rows={least.map(f => ({ label: f.name, value: f.users, sub: `${num(f.uses)} uses` }))} />
        </Card>
        <Card title="Platforms and versions" icon="smartphone">
          <BarList rows={Object.entries(d.platforms).map(([k, v]) => ({ label: k, value: v }))} />
          <BarList rows={Object.entries(d.versions).map(([k, v]) => ({ label: `v${k}`, value: v }))} />
        </Card>
        <Card title="Daily events" icon="chart">
          <Bars data={d.daily.map(x => ({ day: x.day, value: x.events }))} label="Events per day" />
        </Card>
      </div>

      <Card title="Screens" icon="smartphone" className="a-span-7" actions={<ExportButton name="screens" rows={d.screens} />}>
        <Table rowKey={s => s.path} rows={d.screens} cols={[
          { key: 'path', label: 'Screen' },
          { key: 'views', label: 'Views', num: true },
          { key: 'users', label: 'Members', num: true },
          { key: 'seconds', label: 'Active time', num: true, render: s => minutes(s.seconds) },
        ]} />
      </Card>

      <Card title="Devices and context" icon="smartphone" className="a-span-12" subtitle={ctx.data ? `${num(ctx.data.sessions)} sessions` : null}>
        {!ctx.data ? <Loading /> : !ctx.data.sessions ? <p className="a-empty">Recorded from the next website release on: device type, app vs browser, language, time zone, theme, connection, and how long since a device's last visit.</p> : (
          <div className="a-ctx">
            {[['os', 'System'], ['display', 'App, installed or browser'], ['screen', 'Screen'], ['return_gap', 'Back after'], ['lang', 'Language'], ['tz', 'Time zone'], ['theme', 'Theme'], ['net', 'Connection']].map(([k, label]) => (
              <div key={k}><h3>{label}</h3><BarList rows={(ctx.data.dist[k] || []).slice(0, 6).map(x => ({ label: x.value, value: x.n }))} /></div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Errors" icon="alert-triangle" className="a-span-5" actions={<ExportButton name="errors" rows={d.errors} />}>
        <Table rowKey={(e, i) => i} rows={d.errors} empty="No errors in this period." cols={[
          { key: 'event', label: 'Type', render: e => e.event === 'ai_error' ? `AI: ${e.kind}` : e.kind },
          { key: 'screen', label: 'Screen' },
          { key: 'version', label: 'Version' },
          { key: 'n', label: 'Count', num: true },
          { key: 'users', label: 'Members', num: true },
          { key: 'last', label: 'Last', render: e => ago(e.last) },
        ]} />
        <p className="a-hint">App errors from members with usage stats on. Server errors are in System.</p>
      </Card>
    </div>
  )
}

const KIND_LABEL = { booking: 'bookings', plan: 'plans', idea: 'ideas' }

// Usage on and off trips, how often members come back, and how plans get added (admin_engagement, from member_activity_daily)
function Engagement({ e, error, reload }) {
  if (error) return <Card title="On and off trips" icon="compass" className="a-span-12"><ErrorNote error={error} onRetry={reload} /></Card>
  if (!e) return <Card title="On and off trips" icon="compass" className="a-span-12"><Loading /></Card>
  const phases = PHASES.map(([k, label]) => ({ k, label, ...(e.phases.find(p => p.phase === k) || {}) })).filter(p => p.days)
  const topByPhase = PHASES.map(([k]) => [k, e.phase_features.filter(f => f.phase === k).sort((a, b) => b.members - a.members || b.uses - a.uses).slice(0, 5)])
    .filter(([, rows]) => rows.length)
  const channels = Object.values(e.added.reduce((acc, a) => {
    const c = acc[a.channel] || (acc[a.channel] = { channel: a.channel, n: 0, members: 0, parts: [], kinds: [] })
    c.n += a.n; c.members = Math.max(c.members, a.members); c.parts.push(`${a.n} ${KIND_LABEL[a.kind] || a.kind}`); c.kinds.push(KIND_LABEL[a.kind] || a.kind)
    return acc
  }, {})).sort((a, b) => b.n - a.n)
  return (
    <>
      <Card title="How often members come back" icon="users" className="a-span-5"
        actions={<ExportButton name="frequency" rows={FREQUENCY.map(([k, label]) => ({ frequency: label, members: e.frequency[k] || 0 }))} />}>
        <BarList rows={FREQUENCY.map(([k, label]) => ({ label, value: e.frequency[k] || 0 }))} />
        <p className="a-hint">{FREQUENCY_HINT} Counted from days they open the app, as of today (not the date window).</p>
      </Card>

      <Card title="Use by trip phase" icon="compass" className="a-span-7" actions={<ExportButton name="trip-phases" rows={phases} />}>
        <Table rowKey={p => p.k} rows={phases} empty="No days of use in this window." cols={[
          { key: 'label', label: 'Where they were' },
          { key: 'members', label: 'Members', num: true },
          { key: 'days', label: 'Member-days', num: true },
          { key: 'sessions', label: 'Sessions', num: true },
          { key: 'active_min', label: 'Minutes', num: true },
          { key: 'per', label: 'Min per day', num: true, render: p => p.days ? (p.active_min / p.days).toFixed(1) : '—', sortValue: p => p.days ? p.active_min / p.days : 0 },
        ]} />
        <p className="a-hint">Before a trip: one starts within 60 days. Just back: one ended within 14 days. Each member's own local day.</p>
      </Card>

      <Card title="Activity around a trip" icon="chart" className="a-span-7" subtitle="all members, all trips, minutes per day"
        actions={<ExportButton name="trip-curve" rows={e.curve} />}>
        {e.curve.length ? <TripCurve rows={e.curve} tripDays={e.median_trip_days} /> : <p className="a-empty">No use around dated trips yet.</p>}
        <Legend />
        <p className="a-hint">Day 0 is the day the trip starts{e.median_trip_days ? `; the median trip lasts ${e.median_trip_days} days, so green bars are after a typical trip` : ''}. All history since {e.since ? new Date(`${e.since}T12:00`).toLocaleDateString() : 'tracking began'}, not just the window. Hover a bar for numbers; export for members and sessions per day.</p>
      </Card>

      <Card title="How plans get added" icon="plus" className="a-span-5" actions={<ExportButton name="added-via" rows={e.added} />}>
        <BarList rows={channels.map(c => ({ label: CHANNEL_LABEL[c.channel] || c.channel, value: c.n, sub: c.parts.length > 1 ? `(${c.parts.join(', ')})` : c.kinds[0] }))} empty="Nothing added in this window." />
        <p className="a-hint">Bookings, plans and saved ideas added in the window. Paste or file import includes older in-app email imports.</p>
      </Card>

      <Card title="What they use, by trip phase" icon="compass" className="a-span-12">
        {!topByPhase.length ? <p className="a-empty">No feature use in this window.</p> : (
          <div className="a-ctx">
            {topByPhase.map(([k, rows]) => (
              <div key={k}><h3>{PHASE_LABEL[k]}</h3>
                <BarList rows={rows.map(f => ({ label: label(f.feature), value: f.members, sub: `${num(f.uses)} uses` }))} />
              </div>
            ))}
          </div>
        )}
        <p className="a-hint">Top features by members in each phase. Bars are members; uses alongside.</p>
      </Card>
    </>
  )
}
