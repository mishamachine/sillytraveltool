// The luggage-tag logo (docs/brand/logos/tag-mark.svg) and the stacked lowercase wordmark.
import { useId } from 'react'

export function TagMark({ size = 48 }) {
  const clip = useId()
  return (
    <svg className="c-tag" width={size * 0.75} height={size} viewBox="0 0 120 160" fill="none" aria-hidden="true" focusable="false">
      <defs><clipPath id={clip}><circle cx="60" cy="98" r="34" /></clipPath></defs>
      <path className="tag-string" d="M60 27 C58 10 70 2 86 4" strokeWidth="3" strokeLinecap="round" />
      <path className="tag-body" d="M40 14 L80 14 L104 38 L104 140 Q104 152 92 152 L28 152 Q16 152 16 140 L16 38 Z" strokeWidth="4" strokeLinejoin="round" />
      <circle className="tag-hole" cx="60" cy="34" r="7" strokeWidth="3" />
      <circle className="tag-window" cx="60" cy="98" r="36" strokeWidth="3" />
      <g clipPath={`url(#${clip})`}>
        <svg x="24" y="66" width="72" height="68" viewBox="0 0 100 100">
          <ellipse className="g-wing" cx="4" cy="70" rx="14" ry="20" strokeWidth="4" transform="rotate(-32 4 70)" />
          <ellipse className="g-wing" cx="96" cy="70" rx="14" ry="20" strokeWidth="4" transform="rotate(32 96 70)" />
          <path className="g-body" d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" strokeWidth="4" strokeLinejoin="round" />
          <circle className="g-body" cx="50" cy="35" r="28" strokeWidth="4" />
          <circle className="g-blush" cx="27" cy="42" r="7" />
          <circle className="g-eye" cx="39" cy="29" r="8" strokeWidth="3" />
          <circle className="g-pupil" cx="37.5" cy="28" r="4.5" />
          <path className="g-line" d="M35 49 Q44 57 53 49" strokeWidth="3.5" />
          <path className="g-beak" d="M57 31 Q72 27 76 33 Q72 39 57 37Z" strokeWidth="3" strokeLinejoin="round" />
          <path className="g-beak-shade" d="M57 37 Q70 37 74 42 Q68 47 57 41Z" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      </g>
    </svg>
  )
}

/** Stacked wordmark: "silly" in accent over "travel tool" in ink. */
export function Wordmark({ size = 'md' }) {
  return (
    <span className={`c-wordmark c-wordmark--${size}`}>
      <span className="c-wordmark__silly">silly</span>
      <span className="c-wordmark__rest">travel tool</span>
    </span>
  )
}

/** Tag + wordmark lockup. `label` is read by screen readers in place of the artwork. */
export default function Logo({ size = 'md', label = 'Silly Travel Tool' }) {
  const tag = { sm: 36, md: 52, lg: 96 }[size] || 52
  return (
    <span className={`c-logo c-logo--${size}`} role="img" aria-label={label}>
      <TagMark size={tag} />
      <Wordmark size={size} />
    </span>
  )
}
