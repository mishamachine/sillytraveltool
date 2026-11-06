import { useEffect, useState } from 'react'
import { Text, Button } from '../../ui'
import { consentChoiceNeeded, setAnalyticsEnabled } from '../../lib/analytics'
import { CONSENT_EVENT } from '../../lib/consent'
import './consentBanner.css'

// One small question for visitors in the EU, EEA, UK and Switzerland, whose usage stats start off. Accept and Reject
// are the same button style and size; there is no pre-ticked box, and closing or ignoring it counts as no.
// Shows nothing for everyone else. The choice is kept in localStorage; Settings → Share usage stats changes it later.
export default function ConsentBanner() {
  const [open, setOpen] = useState(consentChoiceNeeded)
  useEffect(() => {
    const sync = () => setOpen(consentChoiceNeeded())
    window.addEventListener(CONSENT_EVENT, sync)
    return () => window.removeEventListener(CONSENT_EVENT, sync)
  }, [])
  if (!open) return null
  return (
    <aside className="consent-banner" role="region" aria-label="Usage stats">
      <Text variant="body" as="p" className="consent-banner__title">Help us improve Silly Travel Tool with anonymous usage stats?</Text>
      <Text variant="caption" tone="secondary" as="p">
        Nothing is sent unless you accept. No names, emails or trip details. See our <a href="/privacy/" target="_blank" rel="noreferrer">Privacy Policy</a>.
      </Text>
      <div className="consent-banner__actions">
        <Button variant="outline" size="md" block onClick={() => setAnalyticsEnabled(true)}>Accept</Button>
        <Button variant="outline" size="md" block onClick={() => setAnalyticsEnabled(false)}>Reject</Button>
      </div>
    </aside>
  )
}
