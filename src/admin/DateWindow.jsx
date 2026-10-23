import Icon from '../ui/icons/Icon'
import { Segmented } from './ui'

// The cockpit's time window. Lives in the URL hash:
//   range=1|7|30|90                → rolling: today, last 7 / 30 / 90 days
//   range=day|week|month&at=DATE   → one calendar day, week (Mon–Sun) or month containing DATE
//   range=custom&from=DATE&to=DATE → any period
// Every tab compares the window with the period of the same length just before it.

const PRESETS = [['1', 'Today'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days']]
const PICKS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['custom', 'Custom']]

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s) => { const [y, m, d] = String(s).split('-').map(Number); return y ? new Date(y, (m || 1) - 1, d || 1) : null }
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()) }
const short = (d, withYear) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) })

/** { from, to, days, label } for a view's range settings */
export function windowOf(view) {
  const r = view.range || '30'
  const at = parse(view.at) || today()
  let from, to, label
  if (r === 'day') { from = to = at; label = at.toDateString() === today().toDateString() ? 'today' : short(at, true) }
  else if (r === 'week') {
    from = addDays(at, -((at.getDay() + 6) % 7)); to = addDays(from, 6)
    label = `week of ${short(from)}`
  } else if (r === 'month') {
    from = new Date(at.getFullYear(), at.getMonth(), 1); to = new Date(at.getFullYear(), at.getMonth() + 1, 0)
    label = from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  } else if (r === 'custom') {
    from = parse(view.from) || addDays(today(), -29); to = parse(view.to) || today()
    if (to < from) [from, to] = [to, from]
    label = `${short(from)} – ${short(to, true)}`
  } else {
    const n = Math.max(1, Number(r) || 30)
    to = today(); from = addDays(to, -(n - 1))
    label = n === 1 ? 'today' : `last ${n} days`
  }
  const days = Math.round((to - from) / 86400000) + 1
  return { from: iso(from), to: iso(to), days, label }
}

export default function DateWindow({ view, go }) {
  const r = view.range || '30'
  const picked = PICKS.some(([k]) => k === r)
  const w = windowOf(view)
  const step = (dir) => {
    const at = parse(view.at) || today()
    const next = r === 'day' ? addDays(at, dir) : r === 'week' ? addDays(at, 7 * dir) : new Date(at.getFullYear(), at.getMonth() + dir, 1)
    go({ at: iso(next) })
  }
  const months = Array.from({ length: 18 }, (_, i) => { const d = new Date(today().getFullYear(), today().getMonth() - i, 1); return [iso(d), d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })] })

  return (
    <div className="a-window">
      <Segmented size="sm" options={PRESETS} value={picked ? null : r} onChange={(range) => go({ range, at: null, from: null, to: null })} />
      <select className="a-select a-select--sm" value={picked ? r : ''} aria-label="Pick a period"
        onChange={e => { const v = e.target.value; if (!v) return; go(v === 'custom' ? { range: v, from: w.from, to: w.to, at: null } : { range: v, at: iso(today()), from: null, to: null }) }}>
        <option value="">Pick…</option>
        {PICKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {(r === 'day' || r === 'week') && (
        <input type="date" className="a-select a-select--sm" value={view.at || iso(today())} max={iso(today())} aria-label={r === 'day' ? 'Day' : 'Any day in the week'}
          onChange={e => e.target.value && go({ at: e.target.value })} />
      )}
      {r === 'month' && (
        <select className="a-select a-select--sm" aria-label="Month" value={iso(new Date((parse(view.at) || today()).getFullYear(), (parse(view.at) || today()).getMonth(), 1))}
          onChange={e => go({ at: e.target.value })}>
          {months.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )}
      {r === 'custom' && <>
        <input type="date" className="a-select a-select--sm" value={w.from} max={w.to} aria-label="From" onChange={e => e.target.value && go({ from: e.target.value })} />
        <span className="a-muted">to</span>
        <input type="date" className="a-select a-select--sm" value={w.to} min={w.from} max={iso(today())} aria-label="To" onChange={e => e.target.value && go({ to: e.target.value })} />
      </>}
      {['day', 'week', 'month'].includes(r) && <>
        <button className="a-icon-btn a-icon-btn--sm" onClick={() => step(-1)} aria-label={`Previous ${r}`}><Icon name="chevron-left" size={16} /></button>
        <button className="a-icon-btn a-icon-btn--sm" onClick={() => step(1)} disabled={w.to >= iso(today())} aria-label={`Next ${r}`}><Icon name="chevron-right" size={16} /></button>
      </>}
      {picked && <span className="a-window__label">{w.label}</span>}
    </div>
  )
}
