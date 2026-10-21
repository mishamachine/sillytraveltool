import cx from './cx'
import Icon from './icons/Icon'
import { IconButton } from './Button'

/**
 * Inline message. variant "soft" (tinted fill), "hint" (dashed outline) or "inverse".
 * tone: accent | info | success | danger | neutral
 */
export default function Banner({ tone = 'accent', variant = 'soft', icon, title, children, action, onDismiss, role, className }) {
  return (
    <div className={cx('c-banner', `c-banner--${variant}`, `c-banner--${tone}`, className)} role={role}>
      {icon && <Icon name={icon} size={20} className="c-banner__icon" />}
      <div className="c-banner__body">
        {title && <p className="c-banner__title">{title}</p>}
        {children && <div className="c-banner__text">{children}</div>}
      </div>
      {action}
      {onDismiss && <IconButton icon="close" label="Dismiss" variant="ghost" size="sm" onClick={onDismiss} />}
    </div>
  )
}
