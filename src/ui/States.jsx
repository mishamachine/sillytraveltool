import cx from './cx'
import GooseMark from './GooseMark'
import Button, { LinkButton } from './Button'
import Text from './Text'

/** Empty state: Goose on a light tile, h2 title, body, optional action. */
export function EmptyState({ goose = 'happy', title, children, action, secondary, className }) {
  return (
    <div className={cx('c-state', className)}>
      <GooseMark expression={goose} size={92} tile tileSize="lg" />
      <div className="c-state__text">
        <Text variant="h2" as="h2" align="center">{title}</Text>
        {children && <Text variant="body-lg" tone="secondary" align="center">{children}</Text>}
      </div>
      {(action || secondary) && <div className="c-state__actions">{action}{secondary}</div>}
    </div>
  )
}

/**
 * Error state: "Goose lost the plot" plus a plain explanation and fix.
 * onRetry shows a primary "Try again"; `secondary` adds a second action; onReport adds "Tell us".
 */
export function ErrorState({
  title = 'Goose lost the plot', children = 'Something went wrong on our side. Your trips and bookings are fine.',
  onRetry, retryLabel = 'Try again', secondary, onReport, compact = false, className,
}) {
  return (
    <div role="alert" className={cx('c-card', 'c-card--raised', 'c-state', 'c-state--error', compact && 'c-state--compact', className)}>
      <GooseMark expression="lost" size={compact ? 52 : 66} tile tileSize={compact ? 'sm' : 'md'} />
      <div className="c-state__text">
        <Text variant={compact ? 'card-title' : 'title'} as="h2" align="center">{title}</Text>
        {children && <Text variant="body" tone="secondary" align="center">{children}</Text>}
      </div>
      {(onRetry || secondary) && (
        <div className="c-state__row">
          {onRetry && <Button variant="primary" icon="refresh" onClick={onRetry} block>{retryLabel}</Button>}
          {secondary}
        </div>
      )}
      {onReport && (
        <p className="t-micro tone-muted c-state__report">Keeps happening? <LinkButton onClick={onReport}>Tell us</LinkButton></p>
      )}
    </div>
  )
}

/** Progress bar: determinate (value 0–1) or indeterminate (value undefined). */
export function ProgressBar({ value, tone = 'accent', inverse = false, label, className }) {
  if (value == null) {
    return (
      <span className={cx('c-progress', 'c-progress--indeterminate', inverse && 'c-progress--inverse', `c-progress--${tone}`, className)} role="progressbar" aria-label={label}>
        <span className="c-progress__bar" />
      </span>
    )
  }
  return (
    <progress
      className={cx('c-meter', inverse && 'c-meter--inverse', `c-meter--${tone}`, className)}
      value={Math.max(0, Math.min(1, value))}
      max={1}
      aria-label={label}
    />
  )
}

/**
 * Loading: text first, progress bar second (BRAND.md: never motion alone).
 * <Loading title="Goose is reading up on Sevilla" />
 */
export function Loading({ title = 'One moment', children, value, inline = false, onStop, className }) {
  return (
    <div role="status" aria-live="polite" className={cx(inline ? 'c-loading c-loading--inline' : 'c-card c-card--raised c-loading', className)}>
      <GooseMark expression="reading" size={inline ? 34 : 46} tile tileSize={inline ? 'xs' : 'sm'} />
      <div className="c-loading__body">
        <Text variant={inline ? 'body' : 'card-title'} weight={inline ? 600 : undefined} as="p">{title}</Text>
        {children && <Text variant="caption" tone="muted">{children}</Text>}
        <ProgressBar value={value} label={title} />
      </div>
      {onStop && <Button variant="ghost" size="sm" onClick={onStop}>Stop</Button>}
    </div>
  )
}

/** Shimmer placeholder blocks for content that is on its way. */
export function Skeleton({ lines = 3, className }) {
  return (
    <div className={cx('c-skeleton', className)} aria-hidden="true">
      <span className="c-skeleton__block c-skeleton__block--title" />
      {Array.from({ length: lines }, (_, i) => <span key={i} className={cx('c-skeleton__block', i === lines - 1 && 'c-skeleton__block--short')} />)}
    </div>
  )
}
