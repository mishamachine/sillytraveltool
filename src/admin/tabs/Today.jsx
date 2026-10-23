import { useState } from 'react'
import Icon from '../../ui/icons/Icon'
import { api } from '../api'
import { Card, Stat, Bars, Loading, ErrorNote, useLoad, Modal, Field, num } from '../ui'

const PRIORITY = { 1: 'Now', 2: 'Today', 3: 'This week' }

export default function Today({ filters, go, view }) {
  const pulse = useLoad(() => api.pulse(filters), [filters])
  const needs = useLoad(() => api.needsYou(), [filters.tick])
  const p = pulse.data
  const range = filters.days === 1 ? 'today' : `last ${filters.days} days`

  return (
    <div className="a-grid">
      <Card title="Pulse" icon="chart" subtitle={`${range} vs the period before`} className="a-span-12">
        <ErrorNote error={pulse.error} onRetry={pulse.reload} />
        {!p ? <Loading /> : (
          <div className="a-stats a-stats--8">
            <Stat label="On now" value={p.online_now} hint="last 5 min" tone="live" />
            <Stat label="Sign-ups" value={p.signups} prev={p.signups_prev} />
            <Stat label="Active members" value={p.active} prev={p.active_prev} />
            <Stat label="Trips created" value={p.trips} prev={p.trips_prev} />
            <Stat label="Bookings added" value={p.bookings} prev={p.bookings_prev} />
            <Stat label="AI calls" value={p.ai_calls} prev={p.ai_calls_prev} />
            <Stat label="Errors" value={p.errors} prev={p.errors_prev} invert />
            <Stat label="First Class" value={p.first_class} hint={`of ${num(p.members)} members`} />
          </div>
        )}
      </Card>

      <NeedsYou needs={needs} go={go} view={view} />

      <div className="a-span-5 a-col">
        <Card title="Activity" icon="chart" subtitle={range}>
          {p ? (
            <div className="a-mini-charts">
              <div><span className="a-muted">Active members a day</span><Bars data={p.series.map(d => ({ day: d.day, value: d.active }))} label="Active members per day" /></div>
              <div><span className="a-muted">Sign-ups a day</span><Bars data={p.series.map(d => ({ day: d.day, value: d.signups }))} label="Sign-ups per day" /></div>
              <div><span className="a-muted">Bookings a day</span><Bars data={p.series.map(d => ({ day: d.day, value: d.bookings }))} label="Bookings per day" /></div>
            </div>
          ) : <Loading />}
        </Card>
        <Card title="Live test" icon="target" onOpen={() => go({ tab: 'experiments' })}>
          <p className="a-empty">No test running. The experiments engine is build step 4; the first test runs on the website, where the traffic is.</p>
        </Card>
        <Card title="Today's brief" icon="book">
          <p className="a-empty">Daily, weekly and monthly briefs written by Goose arrive in build step 5. Until then, Needs you is the brief.</p>
        </Card>
      </div>
    </div>
  )
}

function NeedsYou({ needs, go, view }) {
  const [adding, setAdding] = useState(view.new === 'task')
  const [busy, setBusy] = useState(null)
  const items = needs.data?.items || []

  const act = async (it, status, days) => {
    setBusy(it.key)
    try {
      await api.taskSet(it.key, status, days ? new Date(Date.now() + days * 86400000).toISOString() : null, it.title)
      needs.reload()
    } finally { setBusy(null) }
  }
  const open = (it) => go({ tab: it.tab, ...(it.filter ? { stage: it.filter } : {}), ...(it.member ? { member: it.member } : {}), ...(it.code ? { code: it.code } : {}) })

  return (
    <Card title="Needs you" icon="bell" className="a-span-7" subtitle={items.length ? `${items.length} open` : null}
      actions={<button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add</button>}>
      <ErrorNote error={needs.error} onRetry={needs.reload} />
      {!needs.data ? <Loading /> : !items.length ? (
        <p className="a-empty">Nothing needs you right now. Goose is keeping watch.</p>
      ) : (
        <ol className="a-needs">
          {items.map(it => (
            <li key={it.key} className={`a-needs__item a-needs__item--p${it.priority}`}>
              <span className="a-needs__when">{it.own ? 'Yours' : PRIORITY[it.priority]}</span>
              <div className="a-needs__body">
                <button className="a-needs__title" onClick={() => it.tab && open(it)} disabled={!it.tab}>{it.title}{it.tab && <Icon name="arrow-right" size={14} />}</button>
                {it.detail && <p>{it.detail}</p>}
              </div>
              <div className="a-needs__actions">
                <button className="a-btn a-btn--ghost a-btn--sm" disabled={busy === it.key} onClick={() => act(it, 'done')} title="Mark done"><Icon name="check" size={16} /> Done</button>
                <select className="a-select a-select--sm" value="" disabled={busy === it.key} onChange={e => act(it, 'snoozed', Number(e.target.value))} aria-label="Snooze">
                  <option value="" disabled>Snooze</option>
                  <option value="1">1 day</option>
                  <option value="3">3 days</option>
                  <option value="7">1 week</option>
                </select>
              </div>
            </li>
          ))}
        </ol>
      )}
      {!!needs.data?.done_recent?.length && (
        <details className="a-done">
          <summary>Recently done ({needs.data.done_recent.length})</summary>
          <ul>{needs.data.done_recent.map(d => <li key={d.key}><Icon name="check" size={14} /> {d.title || d.key}</li>)}</ul>
        </details>
      )}
      {adding && <AddTask onClose={() => { setAdding(false); go({ new: null }) }} onAdded={needs.reload} />}
    </Card>
  )
}

function AddTask({ onClose, onAdded }) {
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    if (!title.trim()) { setError('Give it a title'); return }
    try { await api.taskAdd(title.trim(), detail.trim()); onAdded(); onClose() } catch (err) { setError(err.message) }
  }
  return (
    <Modal title="Add to Needs you" onClose={onClose}
      footer={<><button className="a-btn a-btn--ghost" onClick={onClose}>Cancel</button><button className="a-btn a-btn--primary" onClick={submit}>Add</button></>}>
      <form onSubmit={submit} className="a-form">
        <Field label="What needs doing" error={error}><input value={title} onChange={e => { setTitle(e.target.value); setError(null) }} maxLength={200} placeholder="Reply to the travel blogger" /></Field>
        <Field label="Details (optional)"><textarea value={detail} onChange={e => setDetail(e.target.value)} rows={3} maxLength={1000} /></Field>
      </form>
    </Modal>
  )
}
