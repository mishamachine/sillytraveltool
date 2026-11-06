import cx from './cx'
import Icon from './icons/Icon'
import { GooseSvg } from './GooseMark'

/**
 * Bottom navigation (component-BottomNav.md). The consumer provides items and the active tab.
 * items: [{ id, label, icon, feature? }]. A `feature` item (HONK) is the raised Goose button in the middle.
 */
export default function BottomNav({ items, active, onSelect, label = 'Main' }) {
  return (
    <nav className={cx('c-nav', `c-nav--${items.length}`)} aria-label={label}>
      {items.map(item => {
        const isActive = item.id === active
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={cx('c-nav__tab', item.feature && 'c-nav__tab--feature', isActive && 'is-active')}
            aria-current={isActive ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); onSelect(item.id) }}
          >
            {item.feature
              ? <span className="c-nav__disc" aria-hidden="true"><GooseSvg expression={isActive ? 'excited' : 'happy'} size={40} /></span>
              : <Icon name={item.icon} size={24} />}
            <span className="t-micro c-nav__label">{item.label}</span>
          </a>
        )
      })}
    </nav>
  )
}
