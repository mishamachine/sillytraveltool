import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '../ui/icons/Icon'
import Gate from './Gate'
import { ago } from './ui'
import CommandBar from './CommandBar'
import AlertBanner from './AlertBanner'
import DateWindow, { windowOf } from './DateWindow'
import Today from './tabs/Today'
import Members from './tabs/Members'
import Product from './tabs/Product'
import Growth from './tabs/Growth'
import Experiments from './tabs/Experiments'
import Money from './tabs/Money'
import System from './tabs/System'

export const TABS = [
  { id: 'today', label: 'Today', icon: 'sun', el: Today },
  { id: 'members', label: 'Members', icon: 'users', el: Members },
  { id: 'product', label: 'Product', icon: 'compass', el: Product },
  { id: 'growth', label: 'Growth', icon: 'chart', el: Growth },
  { id: 'experiments', label: 'Experiments', icon: 'target', el: Experiments },
  { id: 'money', label: 'Money', icon: 'wallet', el: Money },
  { id: 'system', label: 'System', icon: 'settings', el: System },
]

const CADENCE = [[30000, 'Live 30 s'], [300000, '5 min'], [3600000, 'Hourly'], [0, 'Paused']]

// View state lives in the URL hash so any view can be bookmarked: #tab=members&member=<id>&range=30&internal=0
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1))
  return Object.fromEntries(p.entries())
}
function writeHash(state) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(state)) if (v != null && v !== '') p.set(k, v)
  history.replaceState(null, '', `#${p.toString()}`)
}


function read(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
function save(key, value) {
  try { localStorage.setItem(key, value) } catch { /* private window */ }
}

export default function App() {
  return <Gate>{(me) => <Cockpit me={me} />}</Gate>
}

function Cockpit({ me }) {
  const [view, setView] = useState(() => ({ tab: 'today', range: '30', internal: '0', ...readHash() }))
  const [cadence, setCadence] = useState(() => Number(read('stt_admin_cadence', 300000)))
  const [tick, setTick] = useState(0)
  const [updated, setUpdated] = useState(Date.now())
  const [cmdOpen, setCmdOpen] = useState(false)
  const [, force] = useState(0)

  const go = useCallback((patch) => setView(v => {
    const next = { ...v, ...patch }
    if (patch.tab && patch.tab !== v.tab && !('member' in patch)) delete next.member
    for (const k of Object.keys(next)) if (next[k] == null) delete next[k]
    return next
  }), [])

  useEffect(() => writeHash(view), [view])
  useEffect(() => {
    const onHash = () => setView(v => ({ tab: 'today', range: v.range, at: v.at, from: v.from, to: v.to, internal: v.internal, ...readHash() }))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const filters = useMemo(() => ({ ...windowOf(view), excludeInternal: view.internal !== '1', tick }),
    [view.range, view.at, view.from, view.to, view.internal, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => { setTick(t => t + 1); setUpdated(Date.now()) }, [])
  useEffect(() => {
    save('stt_admin_cadence', String(cadence))
    if (!cadence) return
    const id = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, cadence)
    return () => clearInterval(id)
  }, [cadence, refresh])
  // Keep "updated n min ago" honest
  useEffect(() => { const id = setInterval(() => force(n => n + 1), 30000); return () => clearInterval(id) }, [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen(o => !o); return }
      if (e.target.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= TABS.length) go({ tab: TABS[n - 1].id })
      if (e.key === 'r') refresh()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, refresh])

  const Tab = (TABS.find(t => t.id === view.tab) || TABS[0]).el

  return (
    <div className="a-shell">
      <nav className="a-rail" aria-label="Cockpit sections">
        <div className="a-rail__brand"><img src="/favicon.svg" alt="" width="28" height="28" /><span>Cockpit</span></div>
        {TABS.map((t, i) => (
          <button key={t.id} className={`a-rail__item ${view.tab === t.id ? 'is-on' : ''}`} onClick={() => go({ tab: t.id })}
            aria-current={view.tab === t.id ? 'page' : undefined} title={`${t.label} (${i + 1})`}>
            <Icon name={t.icon} size={20} /><span>{t.label}</span>
          </button>
        ))}
        <div className="a-rail__foot">
          <button className="a-rail__item" onClick={() => setCmdOpen(true)} title="Search and actions (Cmd K)"><Icon name="search" size={20} /><span>Search <kbd>⌘K</kbd></span></button>
          <button className="a-rail__me" title="Your member page" onClick={() => go({ tab: 'members', member: me.id })}><span>{me.email}</span><small>{me.role} · your member page</small></button>
          <button className="a-rail__item" onClick={me.signOut}><Icon name="sign-out" size={20} /><span>Sign out</span></button>
        </div>
      </nav>

      <div className="a-main">
        <header className="a-topbar">
          <h1>{TABS.find(t => t.id === view.tab)?.label}</h1>
          <div className="a-topbar__controls">
            <DateWindow view={view} go={go} />
            <label className="a-check" title="Owner and test accounts are left out by default">
              <input type="checkbox" checked={view.internal !== '1'} onChange={e => go({ internal: e.target.checked ? '0' : '1' })} />
              Exclude internal
            </label>
            <select className="a-select a-select--sm" value={cadence} onChange={e => setCadence(Number(e.target.value))} aria-label="Refresh">
              {CADENCE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="a-btn a-btn--ghost a-btn--sm" onClick={refresh} title="Refresh now (R)"><Icon name="refresh" size={16} /> {ago(updated)}</button>
          </div>
        </header>
        <AlertBanner tick={tick} go={go} />
        <main className="a-content">
          <Tab filters={filters} view={view} go={go} role={me.role} refresh={refresh} />
        </main>
      </div>

      {cmdOpen && <CommandBar onClose={() => setCmdOpen(false)} go={go} filters={filters} />}
    </div>
  )
}
