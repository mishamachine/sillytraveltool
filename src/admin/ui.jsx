import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Icon from '../ui/icons/Icon'

// Small building blocks for the cockpit. Clay tokens only (src/styles/tokens.css).

export const STAGES = [
  ['new', 'New'], ['dreaming', 'Dreaming'], ['planning', 'Planning'], ['getting_ready', 'Getting ready'],
  ['on_the_road', 'On the road'], ['just_back', 'Just back'], ['between_trips', 'Between trips'], ['lapsed', 'Lapsed'],
]
export const STAGE_LABEL = Object.fromEntries(STAGES)
export const STATUS_LABEL = { active: 'Active', warning: 'Warned', restricted: 'Restricted', suspended: 'Suspended', banned: 'Banned' }
export const PLAN_LABEL = { free: 'Free', first_class: 'First Class' }
export const FARE_LABEL = { basic: 'Basic economy', economy: 'Economy', premium: 'Premium economy', business: 'Business', first: 'First', unknown: 'Not given' }

const nf = new Intl.NumberFormat('en-US')
export const num = (n) => (n == null ? '—' : nf.format(Math.round(Number(n))))

export function fmtDate(v, withTime = false) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) })
}

export function ago(v) {
  if (!v) return 'never'
  const s = (Date.now() - new Date(v).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  if (s < 86400 * 45) return `${Math.round(s / 86400)} d ago`
  return fmtDate(v)
}

export function minutes(sec) {
  if (!sec) return '0 min'
  if (sec < 60) return `${Math.round(sec)} s`
  if (sec < 3600) return `${Math.round(sec / 60)} min`
  return `${(sec / 3600).toFixed(1)} h`
}

export function delta(now, prev) {
  if (prev == null || now == null) return null
  if (prev === 0) return now === 0 ? { dir: 0, text: 'same' } : { dir: 1, text: `+${num(now)}` }
  const pct = Math.round(((now - prev) / prev) * 100)
  return { dir: Math.sign(pct), text: `${pct > 0 ? '+' : ''}${pct}%` }
}

export function toCsv(rows) {
  if (!rows?.length) return ''
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))]
  const cell = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n')
}

export function download(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ExportButton({ name, rows }) {
  return (
    <button className="a-btn a-btn--ghost a-btn--sm" disabled={!rows?.length} onClick={() => download(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows))}>
      <Icon name="download" size={16} /> CSV
    </button>
  )
}

export function Card({ title, icon, actions, children, className = '', onOpen, subtitle }) {
  return (
    <section className={`a-card ${onOpen ? 'a-card--link' : ''} ${className}`}>
      {(title || actions) && (
        <header className="a-card__head">
          <div className="a-card__title" onClick={onOpen} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}
            onKeyDown={onOpen ? (e) => e.key === 'Enter' && onOpen() : undefined}>
            {icon && <Icon name={icon} size={18} />}
            <h2>{title}</h2>
            {subtitle && <span className="a-muted">{subtitle}</span>}
            {onOpen && <Icon name="chevron-right" size={16} />}
          </div>
          <div className="a-card__actions">{actions}</div>
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, prev, hint, tone, invert }) {
  const d = delta(Number(value), prev == null ? null : Number(prev))
  const good = d && (invert ? d.dir < 0 : d.dir > 0)
  const bad = d && (invert ? d.dir > 0 : d.dir < 0)
  return (
    <div className={`a-stat ${tone ? `a-stat--${tone}` : ''}`}>
      <div className="a-stat__label">{label}</div>
      <div className="a-stat__value">{typeof value === 'number' || /^\d+$/.test(String(value)) ? num(value) : value}</div>
      <div className="a-stat__foot">
        {d && <span className={good ? 'a-up' : bad ? 'a-down' : 'a-muted'}>{d.text}</span>}
        {hint && <span className="a-muted">{hint}</span>}
      </div>
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`a-badge a-badge--${tone}`}>{children}</span>
}

export const statusTone = (s) => ({ banned: 'danger', suspended: 'danger', restricted: 'warn', warning: 'warn' }[s] || 'ok')
export const stageTone = (s) => ({ lapsed: 'warn', just_back: 'accent', on_the_road: 'info', getting_ready: 'info', new: 'neutral' }[s] || 'neutral')

// Data-driven sizes go through CSS variables (Clay lint forbids inline styles)
export function Sized({ as: Tag = 'span', vars, children, ...rest }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    for (const [k, v] of Object.entries(vars || {})) ref.current?.style.setProperty(k, v)
  })
  return <Tag ref={ref} {...rest}>{children}</Tag>
}

// Bars for a daily series: [{day, value}]
export function Bars({ data, height = 56, label }) {
  const max = Math.max(1, ...data.map(d => d.value))
  return (
    <Sized as="div" className="a-bars" vars={{ '--h': `${height}px` }} role="img" aria-label={label}>
      {data.map(d => (
        <div key={d.day} className="a-bars__col" title={`${fmtDate(d.day)}: ${num(d.value)}`}>
          <Sized as="div" className={`a-bars__bar ${d.value ? '' : 'is-zero'}`} vars={{ '--fill': `${Math.max(d.value ? 6 : 2, (d.value / max) * 100)}%` }} />
        </div>
      ))}
    </Sized>
  )
}

// Horizontal bar rows: [{label, value, sub}]
export function BarList({ rows, max, format = num, empty = 'Nothing yet.' }) {
  if (!rows?.length) return <p className="a-empty">{empty}</p>
  const top = max ?? Math.max(1, ...rows.map(r => r.value))
  return (
    <ul className="a-barlist">
      {rows.map(r => (
        <li key={r.label} onClick={r.onClick} className={r.onClick ? 'is-link' : ''}>
          <span className="a-barlist__label">{r.label}</span>
          <span className="a-barlist__track"><Sized vars={{ '--fill': `${(r.value / top) * 100}%` }} /></span>
          <span className="a-barlist__value">{format(r.value)}{r.sub && <span className="a-muted"> {r.sub}</span>}</span>
        </li>
      ))}
    </ul>
  )
}

export function Table({ cols, rows, onRow, empty = 'Nothing here yet.', rowKey = (r, i) => r.id ?? i }) {
  const [sort, setSort] = useState(null)
  if (!rows?.length) return <p className="a-empty">{empty}</p>
  const sorted = sort ? [...rows].sort((a, b) => {
    const c = cols.find(x => x.key === sort.key)
    const va = c.sortValue ? c.sortValue(a) : a[sort.key]
    const vb = c.sortValue ? c.sortValue(b) : b[sort.key]
    if (va == null) return 1
    if (vb == null) return -1
    return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir
  }) : rows
  return (
    <div className="a-table-wrap">
      <table className="a-table">
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} className={c.num ? 'is-num' : ''} onClick={() => setSort(s => ({ key: c.key, dir: s?.key === c.key ? -s.dir : (c.num ? -1 : 1) }))}>
                {c.label}{sort?.key === c.key && <Icon name={sort.dir > 0 ? 'chevron-up' : 'chevron-down'} size={12} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={rowKey(r, i)} onClick={onRow ? () => onRow(r) : undefined} className={onRow ? 'is-link' : ''}>
              {cols.map(c => <td key={c.key} className={c.num ? 'is-num' : ''}>{c.render ? c.render(r) : (c.num ? num(r[c.key]) : r[c.key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Modal({ title, onClose, children, footer, wide }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    ref.current?.querySelector('input, textarea, select, button')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="a-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`a-modal ${wide ? 'a-modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="a-modal__head">
          <h2>{title}</h2>
          <button className="a-icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </header>
        <div className="a-modal__body">{children}</div>
        {footer && <footer className="a-modal__foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function Field({ label, hint, children, error }) {
  return (
    <label className="a-field">
      <span className="a-field__label">{label}</span>
      {children}
      {error ? <span className="a-field__error">{error}</span> : hint && <span className="a-field__hint">{hint}</span>}
    </label>
  )
}

export function Segmented({ options, value, onChange, size }) {
  return (
    <div className={`a-seg ${size === 'sm' ? 'a-seg--sm' : ''}`} role="radiogroup">
      {options.map(([v, label]) => (
        <button key={String(v)} role="radio" aria-checked={value === v} className={value === v ? 'is-on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  )
}

export function Loading({ label = 'Goose is counting…' }) {
  return <div className="a-loading"><span className="a-spinner" aria-hidden="true" />{label}</div>
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="a-error" role="alert">
      <Icon name="alert-triangle" size={18} />
      <span>{error.message || String(error)}</span>
      {onRetry && <button className="a-btn a-btn--ghost a-btn--sm" onClick={onRetry}>Try again</button>}
    </div>
  )
}

// Loads `fn` when deps change and on every refresh tick. Keeps the last data while reloading.
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const tick = useRef(0)
  const run = () => {
    const my = ++tick.current
    setState(s => ({ ...s, loading: true }))
    Promise.resolve().then(fn).then(
      data => my === tick.current && setState({ data, error: null, loading: false }),
      error => my === tick.current && setState(s => ({ ...s, error, loading: false })),
    )
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, deps)
  return { ...state, reload: run }
}
