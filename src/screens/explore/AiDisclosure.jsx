import { LinkButton } from '../../ui'

/** One-line AI disclosure + report link, under every Goose-written surface. */
export default function AiDisclosure({ city, what = 'guide' }) {
  const subject = encodeURIComponent(`AI report - ${what}${city ? ` - ${city}` : ''}`)
  return (
    <p className="t-micro tone-muted explore-ai">
      Suggested by Goose (AI). Check details before you go.{' '}
      <LinkButton href={`mailto:hello@sillytraveltool.com?subject=${subject}`}>Report</LinkButton>
    </p>
  )
}
