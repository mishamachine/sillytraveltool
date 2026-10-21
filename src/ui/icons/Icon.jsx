import { ICONS } from './paths'

/**
 * <Icon name="plane" /> — the STT stroke icon set (src/ui/icons/paths.js).
 * Decorative by default (aria-hidden). Pass `label` when the icon alone carries meaning.
 */
export default function Icon({ name, size = 24, strokeWidth = 1.8, label, className = '' }) {
  const paths = ICONS[name]
  if (!paths) {
    if (import.meta.env.DEV) console.warn(`[Icon] unknown icon "${name}"`)
    return null
  }
  return (
    <svg
      className={`c-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  )
}
