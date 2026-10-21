import cx from './cx'

const DEFAULT_TAG = {
  display: 'h1', h1: 'h1', h2: 'h2', title: 'h3', 'card-title': 'h3', stat: 'span',
  'body-lg': 'p', body: 'p', label: 'span', caption: 'p', overline: 'p', micro: 'span',
}

/**
 * Typography from the brand type scale.
 * <Text variant="h1">Trips</Text>  ·  <Text variant="caption" tone="muted">Apr 1 – 10</Text>
 * tone: ink | secondary | muted | accent | danger | success | info | inverse | inverse-muted | accent-on-inverse
 */
export default function Text({ variant = 'body', tone, weight, as, align, truncate, className, children, ...rest }) {
  const Tag = as || DEFAULT_TAG[variant] || 'span'
  return (
    <Tag
      className={cx(
        `t-${variant}`, 'c-text',
        tone && `tone-${tone}`,
        weight && `w-${weight}`,
        align && `ta-${align}`,
        truncate && 'truncate',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/** Section / card overline: 12px, uppercase, 0.06em tracking. */
export function Overline({ tone = 'muted', as = 'p', className, children, ...rest }) {
  return <Text variant="overline" tone={tone} as={as} className={cx('c-overline', className)} {...rest}>{children}</Text>
}
