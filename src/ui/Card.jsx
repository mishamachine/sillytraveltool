import cx from './cx'

/**
 * Card weights (component-Card.md):
 *  raised  — hero, surface-card, radius-xl, shadow-raised. One per screen.
 *  inverse — dark hero (HONK, active trip, score). At most one per screen.
 *  group   — list group, radius-lg, shadow-card; put ListRows inside.
 *  plain   — surface-card, radius-lg, shadow-card, padded.
 *  tile    — small raised tile (tool tiles, stat tiles).
 * Pass onClick to render a <button>, href to render an <a>.
 */
export default function Card({ variant = 'plain', padding, as, href, onClick, className, children, ...rest }) {
  const Tag = as || (href ? 'a' : onClick ? 'button' : 'div')
  return (
    <Tag
      className={cx('c-card', `c-card--${variant}`, padding && `c-card--pad-${padding}`, (href || onClick) && 'c-card--action', className)}
      href={href}
      onClick={onClick}
      type={Tag === 'button' ? 'button' : undefined}
      {...rest}
    >
      {children}
    </Tag>
  )
}
