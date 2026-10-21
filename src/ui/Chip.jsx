import cx from './cx'
import Icon from './icons/Icon'

/**
 * Chip. Static (status) when no onClick; a 44px toggle button when onClick is given.
 * tone: neutral | accent | info | success | danger | stay | inverse
 */
export default function Chip({ tone = 'neutral', icon, selected, onClick, className, children, ...rest }) {
  if (onClick) {
    return (
      <button type="button" aria-pressed={selected} className={cx('c-chip', 'c-chip--action', `c-chip--${tone}`, selected && 'is-selected', className)} onClick={onClick} {...rest}>
        {icon && <Icon name={icon} size={16} strokeWidth={2} />}
        {children}
      </button>
    )
  }
  return (
    <span className={cx('c-chip', `c-chip--${tone}`, className)} {...rest}>
      {icon && <Icon name={icon} size={14} strokeWidth={2} />}
      {children}
    </span>
  )
}
