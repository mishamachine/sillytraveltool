import { useMemo, useState } from 'react'
import Icon from '../../ui/icons/Icon'
import { api } from '../api'
import { Card, Table, Badge, Loading, ErrorNote, useLoad, ExportButton, Segmented, Stat, BarList, ago, fmtDate, STAGES, STAGE_LABEL,
  STATUS_LABEL, PLAN_LABEL, statusTone, stageTone } from '../ui'
import MemberPanel from './MemberPanel'
import EmailComposer from './EmailComposer'
import EmailsView from './EmailsView'
import { money } from './StripePanel'

// Segment filters that live in the URL (#seg_affluence=Premium) and come from admin_insight_rows
const SEGMENTS = [
  ['traveller_type', 'Traveller type'], ['affluence', 'Affluence'], ['trip_style', 'Trip style'], ['planning_style', 'Planning'],
  ['persona', 'Uses STT as'], ['channel', 'Books through'], ['region', 'Regions'], ['source', 'Came from'], ['platform', 'Platform'],
]
const AFF_TONE = { Value: 'neutral', Comfort: 'info', Premium: 'accent', Luxury: 'ok' }
const healthTone = (h) => (h >= 60 ? 'ok' : h >= 30 ? 'info' : h >= 10 ? 'warn' : 'neutral')

export default function Members({ filters, view, go, role }) {
  const [search, setSearch] = useState('')
  const [composing, setComposing] = useState(false)
  const mode = view.mode || 'list'
  const list = useLoad(() => api.membersPlus(search, filters), [filters, search])
  const audience = useLoad(() => (mode === 'audience' ? api.audience(filters) : null), [filters, mode])

  const all = list.data || []
  const segs = SEGMENTS.filter(([k]) => view[`seg_${k}`]).map(([k, label]) => [k, label, view[`seg_${k}`]])
  const match = (m) => (!view.stage || m.stage === view.stage) && (!view.plan || m.plan === view.plan) && (!view.status || m.status === view.status)
    && segs.every(([k, , v]) => (k === 'region' ? (m.regions || []).includes(v) : (m[k] ?? 'Not known yet') === v))
  const rows = all.filter(match)
  const counts = useMemo(() => Object.fromEntries(STAGES.map(([s]) => [s, all.filter(m => m.stage === s).length])), [all])
  const pickSeg = (k, v) => go({ mode: 'list', [`seg_${k}`]: view[`seg_${k}`] === v ? null : v })

  const cols = [
    { key: 'name', label: 'Member', render: m => <div className="a-who"><strong>{m.name || '—'}</strong><span>{m.email}</span></div>, sortValue: m => (m.name || m.email || '').toLowerCase() },
    { key: 'stage', label: 'Trip stage', render: m => <Badge tone={stageTone(m.stage)}>{STAGE_LABEL[m.stage] || m.stage}</Badge> },
    { key: 'health', label: 'Health', num: true, render: m => <Badge tone={healthTone(m.health)}>{m.health ?? '—'}</Badge> },
    { key: 'next_trip', label: 'Next trip', render: m => fmtDate(m.next_trip) },
    { key: 'trips', label: 'Trips', num: true },
    { key: 'trips_per_year', label: 'Trips/yr', num: true, render: m => m.trips_per_year ?? '—' },
    { key: 'traveller_type', label: 'Travels as', render: m => m.traveller_type || '—' },
    { key: 'affluence', label: 'Affluence', render: m => m.affluence ? <Badge tone={AFF_TONE[m.affluence]}>{m.affluence}</Badge> : <span className="a-muted">—</span> },
    { key: 'persona', label: 'Uses STT as', render: m => m.persona || '—' },
    { key: 'plan', label: 'Plan', render: m => <Badge tone={m.plan === 'first_class' ? 'accent' : 'neutral'}>{PLAN_LABEL[m.plan]}</Badge> },
    { key: 'lifetime_value', label: 'Paid', num: true, render: m => m.lifetime_value ? money(m.lifetime_value) : '—' },
    { key: 'status', label: 'Status', render: m => m.status === 'active' ? <span className="a-muted">Active</span> : <Badge tone={statusTone(m.status)}>{STATUS_LABEL[m.status]}</Badge> },
    { key: 'offers', label: 'Offers', render: m => m.offers === false ? <Badge>Off</Badge> : <span className="a-muted">On</span>, sortValue: m => m.offers },
    { key: 'next_action', label: 'Next best action', render: m => <span className="a-small">{m.next_action || '—'}</span> },
    { key: 'last_seen', label: 'Last seen', render: m => ago(m.last_seen), sortValue: m => m.last_seen || '' },
  ]

  return (
    <div className="a-grid">
      <Card title="Trip cycle" icon="compass" className="a-span-12"
        subtitle="Between trips is healthy. Lapsed means quieter than this member's own rhythm."
        actions={<Segmented size="sm" options={[['list', 'Members'], ['audience', 'Audience'], ['emails', 'Emails']]} value={mode} onChange={(m) => go({ mode: m === 'list' ? null : m })} />}>
        <div className="a-stages">
          <button className={`a-stage ${!view.stage ? 'is-on' : ''}`} onClick={() => go({ stage: null })}>
            <span className="a-stage__n">{all.length}</span><span>Everyone</span>
          </button>
          {STAGES.map(([s, label]) => (
            <button key={s} className={`a-stage a-stage--${s} ${view.stage === s ? 'is-on' : ''}`} onClick={() => go({ stage: view.stage === s ? null : s })}>
              <span className="a-stage__n">{counts[s] || 0}</span><span>{label}</span>
            </button>
          ))}
        </div>
      </Card>

      {mode === 'emails' ? <EmailsView role={role} go={go} /> : mode === 'audience' ? <Audience a={audience} pick={pickSeg} view={view} /> : (
        <Card title="Members" icon="users" className="a-span-12" subtitle={`${rows.length} shown`}
          actions={<>
            <div className="a-search"><Icon name="search" size={16} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, email or tag" aria-label="Search members" /></div>
            <select className="a-select a-select--sm" value={view.plan || ''} onChange={e => go({ plan: e.target.value || null })} aria-label="Plan">
              <option value="">All plans</option><option value="free">Free</option><option value="first_class">First Class</option>
            </select>
            <select className="a-select a-select--sm" value={view.status || ''} onChange={e => go({ status: e.target.value || null })} aria-label="Status">
              <option value="">Any status</option>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {role !== 'analyst' && <button className="a-btn a-btn--ghost a-btn--sm" disabled={!rows.length || rows.length > 200} onClick={() => setComposing(true)}
              title={rows.length > 200 ? 'Filter to 200 or fewer' : undefined}><Icon name="mail" size={16} /> Email these {rows.length}</button>}
            <ExportButton name="members" rows={rows.map(({ tags, regions, ...m }) => ({ ...m, tags: (tags || []).join(' '), regions: (regions || []).join(' ') }))} />
          </>}>
          {!!segs.length && (
            <div className="a-chips a-chips--filters">
              {segs.map(([k, label, v]) => (
                <button key={k} className="a-chip a-chip--on" onClick={() => go({ [`seg_${k}`]: null })}>{label}: {v} <Icon name="close" size={12} /></button>
              ))}
            </div>
          )}
          <ErrorNote error={list.error} onRetry={list.reload} />
          {!list.data ? <Loading /> : (
            <Table cols={cols} rows={rows} onRow={m => go({ member: m.id })}
              empty={filters.excludeInternal ? 'No members match. Internal accounts are hidden (top bar).' : 'No members match.'} />
          )}
        </Card>
      )}

      {composing && <EmailComposer to={{ userIds: rows.map(m => m.id), label: `${rows.length} member${rows.length === 1 ? '' : 's'}` }}
        template={view.stage === 'just_back' ? 'recap' : view.stage === 'lapsed' ? 'win_back' : view.stage === 'new' ? 'welcome' : undefined}
        role={role} onClose={() => setComposing(false)} />}
      {view.member && <MemberPanel id={view.member} role={role} onClose={() => go({ member: null })} onChanged={list.reload} />}
    </div>
  )
}

function Audience({ a, pick, view }) {
  if (a.error) return <Card className="a-span-12"><ErrorNote error={a.error} onRetry={a.reload} /></Card>
  if (!a.data) return <Card className="a-span-12"><Loading /></Card>
  const d = a.data
  return (
    <>
      <Card title="Your travellers" icon="globe" className="a-span-12" subtitle="who they are, from what they've planned and booked"
        actions={<ExportButton name="audience" rows={Object.entries(d.dist || {}).flatMap(([k, vals]) => vals.map(v => ({ dimension: k, value: v.value, members: v.n })))} />}>
        <div className="a-stats">
          <Stat label="Members" value={d.members} hint={`${d.with_trips} with trips`} />
          <Stat label="Trips a year" value={d.avg_trips_per_year ?? '—'} hint="average" />
          <Stat label="Trip length" value={d.avg_trip_days != null ? `${d.avg_trip_days} days` : '—'} />
          <Stat label="Plans ahead" value={d.avg_lead_days != null ? `${d.avg_lead_days} days` : '—'} />
          <Stat label="Premium or luxury" value={d.premium_or_better_pct != null ? `${d.premium_or_better_pct}%` : '—'} hint={`of ${d.affluence_known} with enough booking data`} />
          <Stat label="Paying" value={d.paying} hint={d.lifetime_value ? `${money(d.lifetime_value)} paid` : null} />
          <Stat label="Average health" value={d.avg_health ?? '—'} hint="0–100" />
        </div>
        {!!d.offers_off && <p className="a-hint">{d.offers_off} member{d.offers_off === 1 ? ' has' : 's have'} turned off tailored offers and {d.offers_off === 1 ? 'is' : 'are'} left out of these numbers.</p>}
        {d.members < 30 && <p className="a-hint">Small numbers: read these as people, not percentages. Click any bar to see those members.</p>}
      </Card>
      {SEGMENTS.map(([k, label]) => (
        <Card key={k} title={label} className="a-span-4 a-card--compact">
          <BarList rows={(d.dist?.[k] || []).map(x => ({
            label: k === 'stage' ? STAGE_LABEL[x.value] || x.value : x.value, value: x.n,
            onClick: x.value === 'Not known yet' && k === 'region' ? undefined : () => pick(k, x.value),
            sub: view[`seg_${k}`] === x.value ? '· filtered' : null,
          }))} />
        </Card>
      ))}
      <Card title="How the affluence band works" icon="info" className="a-span-12">
        <p className="a-small">Each member's band averages the signals in their own bookings, on a 1 (value) to 5 (luxury) scale:
          cabin class, hotel price per night in USD (approximate rates), room type, low-cost airlines and airline or hotel
          status tiers. More signals means more confidence, shown on their profile with the reasons. It's for understanding
          the audience, choosing partners and writing messages: never shown to members, never used to change prices or limits.</p>
      </Card>
    </>
  )
}
