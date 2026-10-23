import { Fragment } from 'react'
import { Icon } from '../../../ui'
import { routeCities } from '../../../lib/stops'
import { plural } from '../../../lib/trips'

/**
 * The trip's route across the top of the plan: Seattle → Madrid → Granada → … → Seattle. Each stop scrolls the plan
 * to its section. Shown for trips with two or more places to stay.
 */
export default function RouteStrip({ stops = [] }) {
  const route = routeCities(stops)
  if (route.filter(s => s.kind === 'stay').length < 2) return null
  const go = (s) => document.getElementById(`stop-${s.position}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <nav className="c-chip-row detail-route" aria-label="Route">
      {route.map((s, i) => (
        <Fragment key={s.position}>
          {i > 0 && <Icon name="arrow-right" size={14} className="tone-muted detail-route__arrow" aria-hidden="true" />}
          <button type="button" className={`c-chip c-chip--action c-chip--${s.kind === 'home' ? 'neutral' : 'accent'}`} onClick={() => go(s)}
            aria-label={s.kind === 'home' ? `${s.city}, home` : `${s.city}, ${plural(s.nights, 'night')}`}>
            {s.kind === 'home' && <Icon name="pin" size={14} strokeWidth={2} />}
            {s.city}
            {s.kind === 'stay' && <span className="detail-route__nights tabular">{s.nights}</span>}
          </button>
        </Fragment>
      ))}
    </nav>
  )
}
