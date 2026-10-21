import cx from './cx'
import { IconButton } from './Button'
import Text, { Overline } from './Text'

/**
 * Scrollable tab screen with the 20px gutter and room for the bottom nav.
 * variant "full" removes the nav spacing (full-screen flows), "overlay" covers the tab screen (trip detail).
 */
export default function Screen({ variant = 'tab', gap = 4, className, children, labelledBy, ...rest }) {
  return (
    <main className={cx('c-screen', `c-screen--${variant}`, `gap-${gap}`, className)} aria-labelledby={labelledBy} {...rest}>
      {children}
    </main>
  )
}

/**
 * Title row: optional back button, optional overline, h1 title, optional meta line and trailing actions.
 */
export function ScreenHeader({ title, overline, meta, onBack, backLabel = 'Back', actions, titleId, className, children }) {
  return (
    <header className={cx('c-header', className)}>
      {(onBack || (actions && !title)) && (
        <div className="c-header__bar">
          {onBack ? <IconButton icon="chevron-left" label={backLabel} onClick={onBack} /> : <span />}
          {!title && actions && <div className="c-header__actions">{actions}</div>}
        </div>
      )}
      {title && (
        <div className="c-header__row">
          <div className="c-header__titles">
            {overline && <Overline>{overline}</Overline>}
            <Text variant="h1" id={titleId}>{title}</Text>
            {meta && <Text variant="body" tone="muted" as="p" className="c-header__meta">{meta}</Text>}
          </div>
          {actions && <div className="c-header__actions">{actions}</div>}
        </div>
      )}
      {children}
    </header>
  )
}

/** Section: overline heading + content, spaced by space-3. */
export function Section({ title, tone = 'muted', action, className, children, ...rest }) {
  return (
    <section className={cx('c-section', className)} {...rest}>
      {(title || action) && (
        <div className="c-section__head">
          {title && <Overline as="h2" tone={tone}>{title}</Overline>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
