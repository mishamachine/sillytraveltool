import { useEffect, useRef, useState } from 'react'
import Icon from '../ui/icons/Icon'
import { api } from './api'
import { TABS } from './App'
import { STAGE_LABEL } from './ui'

// Cmd-K: jump to a tab, find a member, start an action.
const ACTIONS = [
  { label: 'Create a code', icon: 'percent', to: { tab: 'money', new: 'code' } },
  { label: 'Add an item to Needs you', icon: 'plus', to: { tab: 'today', new: 'task' } },
  { label: 'Members just back from a trip', icon: 'users', to: { tab: 'members', stage: 'just_back' } },
  { label: 'Lapsed members', icon: 'users', to: { tab: 'members', stage: 'lapsed' } },
]

export default function CommandBar({ onClose, go, filters }) {
  const [q, setQ] = useState('')
  const [members, setMembers] = useState([])
  const [i, setI] = useState(0)
  const input = useRef(null)

  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => {
    if (q.trim().length < 2) { setMembers([]); return }
    const id = setTimeout(() => api.members({ search: q.trim() }, { ...filters, excludeInternal: false })
      .then(rows => setMembers((rows || []).slice(0, 6)), () => setMembers([])), 200)
    return () => clearTimeout(id)
  }, [q, filters])

  const ql = q.trim().toLowerCase()
  const items = [
    ...TABS.filter(t => !ql || t.label.toLowerCase().includes(ql)).map((t, n) => ({ label: `Go to ${t.label}`, icon: t.icon, hint: String(TABS.indexOf(t) + 1), to: { tab: t.id }, n })),
    ...members.map(m => ({ label: m.name || m.email, icon: 'user', hint: `${m.email} · ${STAGE_LABEL[m.stage] || m.stage}`, to: { tab: 'members', member: m.id } })),
    ...ACTIONS.filter(a => !ql || a.label.toLowerCase().includes(ql)),
  ]

  const pick = (it) => { go(it.to); onClose() }
  const onKey = (e) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setI(n => Math.min(items.length - 1, n + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI(n => Math.max(0, n - 1)) }
    else if (e.key === 'Enter' && items[i]) pick(items[i])
  }

  return (
    <div className="a-scrim a-scrim--top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="a-cmd" role="dialog" aria-label="Search and actions">
        <div className="a-cmd__input">
          <Icon name="search" size={18} />
          <input ref={input} value={q} onChange={e => { setQ(e.target.value); setI(0) }} onKeyDown={onKey}
            placeholder="Find a member, a tab or an action" aria-label="Search" />
          <kbd>Esc</kbd>
        </div>
        <ul className="a-cmd__list" role="listbox">
          {items.map((it, n) => (
            <li key={`${it.label}-${n}`} role="option" aria-selected={n === i} className={n === i ? 'is-on' : ''}
              onMouseEnter={() => setI(n)} onClick={() => pick(it)}>
              <Icon name={it.icon} size={18} /><span>{it.label}</span>{it.hint && <small>{it.hint}</small>}
            </li>
          ))}
          {!items.length && <li className="a-cmd__empty">No matches.</li>}
        </ul>
      </div>
    </div>
  )
}
