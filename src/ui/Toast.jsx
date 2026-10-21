import { createPortal } from 'react-dom'
import cx from './cx'
import Icon from './icons/Icon'

/** Short-lived confirmation on surface-inverse, above the bottom nav. Polite live region. */
export default function Toast({ icon = 'check-circle', title, children, action, position = 'bottom', className }) {
  return createPortal(
    <div role="status" aria-live="polite" className={cx('c-toast', `c-toast--${position}`, className)}>
      {icon && <Icon name={icon} size={20} className="c-toast__icon" />}
      <div className="c-toast__body">
        {title && <p className="c-toast__title">{title}</p>}
        {children && <p className="c-toast__text">{children}</p>}
      </div>
      {action}
    </div>,
    document.body,
  )
}
