// The Goose: the master mascot SVG (docs/brand/logos/goose-mark.svg).
// Expressions change only the eye, brow and mouth (BRAND.md); colours come from the goose tokens.
// It always sits on a light tile (`tile`), so the ink outline reads in dark mode too.

const EXPRESSIONS = {
  happy: {
    wings: true,
    face: (
      <>
        <circle className="g-blush" cx="27" cy="42" r="7" />
        <circle className="g-eye" cx="39" cy="29" r="8" strokeWidth="3" />
        <circle className="g-pupil" cx="37.5" cy="28" r="4.5" />
        <path className="g-line" d="M35 49 Q44 57 53 49" strokeWidth="3.5" />
      </>
    ),
  },
  excited: {
    wings: true,
    face: (
      <>
        <circle className="g-blush" cx="27" cy="42" r="7" />
        <circle className="g-eye" cx="38" cy="29" r="10" strokeWidth="3.5" />
        <circle className="g-pupil" cx="36.5" cy="27.5" r="6" />
        <path className="g-line" d="M28 49 Q44 63 60 49" strokeWidth="4" />
      </>
    ),
  },
  worried: {
    wings: true,
    face: (
      <>
        <path className="g-line" d="M24 21 Q34 16 43 21" strokeWidth="4.5" />
        <circle className="g-eye" cx="39" cy="29" r="8" strokeWidth="3" />
        <circle className="g-pupil" cx="37.5" cy="28" r="4.5" />
        <path className="g-line" d="M32 50 Q39 46 46 50 Q53 54 58 50" strokeWidth="3.5" />
      </>
    ),
  },
  sleepy: {
    wings: true,
    face: (
      <>
        <path className="g-line" d="M31 30 Q39 35 47 30" strokeWidth="3.5" />
        <path className="g-line" d="M39 51 Q44 54 49 51" strokeWidth="3.5" />
      </>
    ),
  },
  reading: {
    wings: false,
    face: (
      <>
        <circle className="g-eye" cx="39" cy="29" r="8" strokeWidth="3" />
        <circle className="g-pupil" cx="41" cy="31" r="4.5" />
        <path className="g-line" d="M40 52 Q44 50 48 52" strokeWidth="3.5" />
      </>
    ),
    extra: (
      <g transform="rotate(-8 73 73)">
        <rect className="g-paper" x="58" y="62" width="30" height="22" rx="3" strokeWidth="3" />
        <path className="g-line" d="M64 70h16M64 76h10" strokeWidth="2.5" />
      </g>
    ),
  },
  lost: {
    wings: false,
    face: (
      <>
        <path className="g-line" d="M32 24 L44 32 M44 24 L32 32" strokeWidth="3.5" />
        <path className="g-line" d="M36 52 Q41 48 46 52 Q51 56 56 52" strokeWidth="3.5" />
      </>
    ),
    extra: <path className="g-stress" d="M70 10 l4 -6 M78 14 l6 -4 M80 22 l7 0" strokeWidth="3" />,
  },
  sad: {
    wings: false,
    face: (
      <>
        <path className="g-line" d="M31 21 Q38 17 46 21" strokeWidth="3" />
        <circle className="g-eye" cx="39" cy="31" r="8" strokeWidth="3" />
        <circle className="g-pupil" cx="38" cy="33" r="4.5" />
        <path className="g-line" d="M37 54 Q44 48 51 54" strokeWidth="3.5" />
      </>
    ),
  },
}

export const GOOSE_EXPRESSIONS = Object.keys(EXPRESSIONS)

export function GooseSvg({ expression = 'happy', size = 64 }) {
  const e = EXPRESSIONS[expression] || EXPRESSIONS.happy
  return (
    <svg
      className="c-goose"
      width={size}
      height={size}
      viewBox={e.wings ? '-16 -14 132 132' : '0 0 100 100'}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {e.wings && (
        <>
          <ellipse className="g-wing" cx="4" cy="70" rx="14" ry="20" strokeWidth="4" transform="rotate(-32 4 70)" />
          <ellipse className="g-wing" cx="96" cy="70" rx="14" ry="20" strokeWidth="4" transform="rotate(32 96 70)" />
        </>
      )}
      <path className="g-body" d="M33 60 Q29 78 27 100 L73 100 Q71 78 67 60 Q59 67 50 67 Q41 67 33 60Z" strokeWidth="4" strokeLinejoin="round" />
      <circle className="g-body" cx="50" cy="35" r="28" strokeWidth="4" />
      {e.face}
      <path className="g-beak" d="M57 31 Q72 27 76 33 Q72 39 57 37Z" strokeWidth="3" strokeLinejoin="round" />
      <path className="g-beak-shade" d="M57 37 Q70 37 74 42 Q68 47 57 41Z" strokeWidth="2.5" strokeLinejoin="round" />
      {e.extra}
    </svg>
  )
}

/**
 * <GooseMark expression="happy" size={64} tile /> — the Goose, optionally on its light tile.
 * Decorative unless `label` is given.
 */
export default function GooseMark({ expression = 'happy', size = 64, tile = false, tileSize, label, className = '' }) {
  const a11y = label ? { role: 'img', 'aria-label': label } : {}
  if (!tile) {
    return <span className={`c-goose-wrap ${className}`.trim()} {...a11y}><GooseSvg expression={expression} size={size} /></span>
  }
  return (
    <span className={`c-goose-tile c-goose-tile--${tileSize || 'md'} ${className}`.trim()} {...a11y}>
      <GooseSvg expression={expression} size={size} />
    </span>
  )
}
