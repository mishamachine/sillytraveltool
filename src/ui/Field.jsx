import { useId } from 'react'
import cx from './cx'
import Icon from './icons/Icon'

/**
 * Sunken input with a visible label. 16px text (no iOS zoom), 52px tall.
 * as: input | textarea | select. icon: leading icon (search fields). hideLabel keeps it for screen readers only.
 */
export default function Field({
  label, hint, error, as = 'input', icon, hideLabel = false, className, inputClassName, children, id, trailing, ...rest
}) {
  const auto = useId()
  const fieldId = id || auto
  const Tag = as
  const describedBy = [hint && `${fieldId}-hint`, error && `${fieldId}-err`].filter(Boolean).join(' ') || undefined
  return (
    <div className={cx('c-field', error && 'has-error', className)}>
      {label && <label htmlFor={fieldId} className={cx('c-field__label', hideLabel && 'sr-only')}>{label}</label>}
      <div className={cx('c-field__box', `c-field__box--${as}`)}>
        {icon && <Icon name={icon} size={20} className="c-field__icon" />}
        <Tag id={fieldId} className={cx('c-field__input', inputClassName)} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest}>
          {children}
        </Tag>
        {as === 'select' && <Icon name="chevron-down" size={18} className="c-field__caret" />}
        {trailing}
      </div>
      {hint && !error && <p id={`${fieldId}-hint`} className="t-micro tone-muted">{hint}</p>}
      {error && <p id={`${fieldId}-err`} className="t-micro tone-danger" role="alert">{error}</p>}
    </div>
  )
}
