import { useState } from 'react'
import { Button } from '../../ui'

// One contextual nudge to share the app (shown on a trip recap, not on every screen).
export default function ShareNudge({ label = 'Know a traveller? Share the app' }) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const shareData = {
      title: 'Silly Travel Tool',
      text: 'Silly Travel Tool keeps every booking in one place, and Goose finds you a good spot nearby.',
      url: 'https://sillytraveltool.com',
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText('https://sillytraveltool.com')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {}
  }

  return (
    <Button variant="ghost" icon={copied ? 'check' : 'share'} onClick={handleShare} aria-live="polite">
      {copied ? 'Link copied' : label}
    </Button>
  )
}
