import { useRef } from 'react'
import cx from './cx'

/**
 * Sunken track with a raised selected pill (component-SegmentedControl.md). 2–4 options.
 * role="tablist" for views (Plan · Weather · Pack), role="radiogroup" for values (tip %).
 * options: [{ value, label }]
 */
export default function SegmentedControl({ options, value, onChange, label, role = 'tablist', className, idPrefix }) {
  const refs = useRef([])
  const isTabs = role === 'tablist'
  const index = Math.max(0, options.findIndex(o => o.value === value))

  const onKeyDown = (e) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (index + step + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role={role} aria-label={label} className={cx('c-seg', `c-seg--n${options.length}`, className)} onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            ref={el => { refs.current[i] = el }}
            type="button"
            role={isTabs ? 'tab' : 'radio'}
            id={idPrefix ? `${idPrefix}-tab-${o.value}` : undefined}
            aria-controls={isTabs && idPrefix ? `${idPrefix}-panel-${o.value}` : undefined}
            {...(isTabs ? { 'aria-selected': selected } : { 'aria-checked': selected })}
            tabIndex={selected ? 0 : -1}
            className={cx('c-seg__opt', selected && 'is-selected')}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
