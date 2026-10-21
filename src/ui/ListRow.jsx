import cx from './cx'
import Icon from './icons/Icon'
import IconTile from './IconTile'

/**
 * Booking / settings row (component-ListRow.md). Lives inside <Card variant="group">.
 * leading: an icon name (shown in a tile with `tone`), or any node.
 * trailing: text (caption, muted) or a node. chevron adds a trailing chevron.
 * onClick → <button>, href → <a>, otherwise a plain row.
 */
export default function ListRow({
  icon, tone = 'accent', leading, title, meta, trailing, chevron = false, onClick, href,
  as, danger = false, className, titleClassName, children, ...rest
}) {
  const Tag = as || (href ? 'a' : onClick ? 'button' : 'div')
  const lead = leading ?? (icon ? <IconTile icon={icon} tone={tone} size="sm" /> : null)
  return (
    <Tag
      className={cx('c-row', (icon || leading) && 'c-row--tile', (onClick || href) && 'c-row--action', danger && 'c-row--danger', className)}
      href={href}
      onClick={onClick}
      type={Tag === 'button' ? 'button' : undefined}
      {...rest}
    >
      {lead}
      <span className="c-row__body">
        {title != null && <span className={cx('c-row__title', titleClassName)}>{title}</span>}
        {meta != null && <span className="c-row__meta">{meta}</span>}
        {children}
      </span>
      {trailing != null && (typeof trailing === 'string' || typeof trailing === 'number'
        ? <span className="c-row__trailing">{trailing}</span>
        : trailing)}
      {chevron && <Icon name="chevron-right" size={18} strokeWidth={2} className="c-row__chevron" />}
    </Tag>
  )
}
