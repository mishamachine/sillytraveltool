import cx from './cx'

/**
 * Flex layout without inline styles.
 * gap: 0–10 (space tokens) · align: start|center|end|stretch|baseline · justify: start|center|end|between
 */
export default function Stack({
  as: Tag = 'div', row = false, gap = 3, align, justify, wrap = false, grow = false, className, children, ...rest
}) {
  return (
    <Tag
      className={cx(
        'c-stack', row ? 'c-stack--row' : 'c-stack--col', `gap-${gap}`,
        align && `align-${align}`, justify && `justify-${justify}`,
        wrap && 'c-stack--wrap', grow && 'grow', className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/** Fills remaining space in a row (flex: 1, min-width 0). */
export function Spacer() {
  return <span className="grow" aria-hidden="true" />
}
