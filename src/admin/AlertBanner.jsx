import { useEffect, useState } from 'react'
import Icon from '../ui/icons/Icon'
import { api } from './api'

// The loud cost alert, on every cockpit page: spend past the dashboard level, a kill switch left on, or a member far
// above a normal day (cost_needs_items). Emails go out only for big spikes; this banner is the everyday alert.
// Checked on every cockpit refresh and every minute.
const ICON = { cost: 'alert-triangle', kill: 'pause', abuse: 'user-plus' }

export default function AlertBanner({ tick, go }) {
  const [items, setItems] = useState([])
  useEffect(() => {
    let live = true
    const load = () => api.alerts().then(d => live && setItems(d?.items || []), () => {})
    load()
    const timer = setInterval(load, 60000)
    return () => { live = false; clearInterval(timer) }
  }, [tick])
  if (!items.length) return null
  return (
    <div className="a-alert" role="alert">
      {items.map(i => (
        <button key={i.key} className="a-alert__item" onClick={() => go(i.member ? { tab: 'members', member: i.member } : { tab: i.tab || 'money' })}>
          <Icon name={ICON[i.kind] || 'alert-triangle'} size={22} />
          <span><strong>{i.title}</strong><small>{i.detail}</small></span>
          <Icon name="chevron-right" size={18} />
        </button>
      ))}
    </div>
  )
}
