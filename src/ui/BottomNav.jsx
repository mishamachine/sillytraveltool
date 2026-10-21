import cx from './cx'
import Icon from './icons/Icon'

/**
 * Four-tab navigation (component-BottomNav.md). The consumer provides items and the active tab.
 * items: [{ id, label, icon }]
 */
export default function BottomNav({ items, active, onSelect, label = 'Main' }) {
  return (
    <nav className="c-nav" aria-label={label}>
      {items.map(item => {
        const isActive = item.id === active
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={cx('c-nav__tab', isActive && 'is-active')}
            aria-current={isActive ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); onSelect(item.id) }}
          >
            <Icon name={item.icon} size={24} />
            <span className="t-micro c-nav__label">{item.label}</span>
          </a>
        )
      })}
    </nav>
  )
}
