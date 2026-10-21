import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import cx from './cx'
import { IconButton } from './Button'

/**
 * Bottom sheet dialog: scrim, radius-2xl top corners, handle, title row with close.
 * Closes on Escape and scrim tap. Focus moves into the sheet and returns on close.
 */
export default function Sheet({ open = true, onClose, title, subtitle, children, footer, size = 'auto', className, labelledBy }) {
  const ref = useRef(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    const node = ref.current
    const first = node?.querySelector('input, textarea, select, button:not([data-sheet-close])')
    ;(first || node)?.focus({ preventScroll: true })
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current?.() }
      if (e.key === 'Tab' && node) {
        const f = node.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])')
        if (!f.length) return
        const a = f[0], z = f[f.length - 1]
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.({ preventScroll: true }) }
  }, [open])

  if (!open) return null
  return createPortal(
    <div className="c-sheet-layer">
      <div className="c-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || (title ? titleId : undefined)}
        tabIndex={-1}
        className={cx('c-sheet', `c-sheet--${size}`, className)}
      >
        <span className="c-sheet__handle" aria-hidden="true" />
        {(title || onClose) && (
          <div className="c-sheet__head">
            <div className="c-sheet__titles">
              {title && <h2 id={titleId} className="t-h2">{title}</h2>}
              {subtitle && <p className="t-caption tone-muted">{subtitle}</p>}
            </div>
            {onClose && <IconButton icon="close" label="Close" onClick={onClose} data-sheet-close="" />}
          </div>
        )}
        <div className="c-sheet__body">{children}</div>
        {footer && <div className="c-sheet__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** Centered confirm dialog for destructive or important choices. */
export function Dialog({ open = true, onClose, title, children, actions }) {
  const titleId = useId()
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    ref.current?.querySelector('button')?.focus({ preventScroll: true })
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.({ preventScroll: true }) }
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="c-sheet-layer c-sheet-layer--center">
      <div className="c-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="c-dialog">
        <h2 id={titleId} className="t-card-title">{title}</h2>
        {children && <div className="t-body tone-secondary">{children}</div>}
        <div className="c-dialog__actions">{actions}</div>
      </div>
    </div>,
    document.body,
  )
}
