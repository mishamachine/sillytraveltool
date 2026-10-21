import { useId } from 'react'
import cx from './cx'

/** On/off switch row: label left, 44px-tall switch right (role="switch"). */
export default function Switch({ checked, onChange, label, description, disabled, className }) {
  const id = useId()
  return (
    <div className={cx('c-switch-row', className)}>
      <label htmlFor={id} className="c-switch-row__text">
        <span className="c-row__title">{label}</span>
        {description && <span className="c-row__meta">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        className={cx('c-switch', checked && 'is-on')}
        onClick={() => onChange(!checked)}
      >
        <span className="c-switch__knob" />
      </button>
    </div>
  )
}
