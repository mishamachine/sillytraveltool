import cx from './cx'
import Icon from './icons/Icon'

/**
 * Clay button. One `primary` per screen.
 * variant: primary | secondary | dark | ghost | danger | outline | inverse
 * size: md (48px) | lg (54px, full-width primary) | sm (44px)
 */
export default function Button({
  variant = 'secondary', size = 'md', icon, iconRight, block = false, loading = false,
  type = 'button', className, children, disabled, ...rest
}) {
  return (
    <button
      type={type}
      className={cx('c-btn', `c-btn--${variant}`, `c-btn--${size}`, block && 'c-btn--block', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {icon && <Icon name={icon} size={18} strokeWidth={2} />}
      <span className="c-btn__label">{children}</span>
      {iconRight && <Icon name={iconRight} size={18} strokeWidth={2} />}
    </button>
  )
}

/**
 * Square 44px icon-only button. `label` is required (aria-label).
 * variant: surface (raised card) | ghost | accent | inverse | sunken
 */
export function IconButton({ icon, label, variant = 'surface', size = 'md', className, type = 'button', badge, ...rest }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx('c-iconbtn', `c-iconbtn--${variant}`, `c-iconbtn--${size}`, className)}
      {...rest}
    >
      <Icon name={icon} size={size === 'lg' ? 26 : 20} strokeWidth={2} />
      {badge}
    </button>
  )
}

/** Inline text link styled as a button (accent, 600). Renders <a> when href is given. */
export function LinkButton({ href, icon, className, children, type = 'button', ...rest }) {
  const content = <>{icon && <Icon name={icon} size={18} />}{children}</>
  if (href) return <a href={href} className={cx('c-link', className)} {...rest}>{content}</a>
  return <button type={type} className={cx('c-link', className)} {...rest}>{content}</button>
}
