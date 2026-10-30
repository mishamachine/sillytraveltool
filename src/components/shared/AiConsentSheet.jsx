import { useConsentStore } from '../../store/consentStore'
import { Sheet, Stack, Text, Button, Banner } from '../../ui'
import { AI_CONSENT, AI_CONSENT_POLICY_URL, AI_CONSENT_POLICY_LABEL } from '../../lib/aiConsentCopy'
import './aiConsent.css'

export const AI_CONSENT_TITLE = AI_CONSENT.title

// The one question before Goose's AI reads what a member sends it (Apple 5.1.2(i), legal review L1). The same words
// appear as a tour step (Onboarding.jsx) and as this sheet, opened by useConsentStore().ensure(reason) at the first
// import or typed translation when the tour step was skipped.
/** The body wording, shared by the tour step and the sheet. */
export function AiConsentDetails() {
  const c = AI_CONSENT
  return (
    <Stack gap={3}>
      <Text variant="body" tone="secondary" as="p">{c.intro}</Text>
      <ul className="ai-consent__bullets">
        {c.bullets.map(b => <li key={b}><Text variant="body" tone="secondary">{b}</Text></li>)}
      </ul>
      <Text variant="body" tone="secondary" as="p">
        {c.outro} See our <a href={AI_CONSENT_POLICY_URL} target="_blank" rel="noreferrer">{AI_CONSENT_POLICY_LABEL}</a>. {c.afterPolicy}
      </Text>
      <Text variant="caption" tone="muted" as="p" className="ai-consent__note">{c.notNow}</Text>
    </Stack>
  )
}

export default function AiConsentSheet() {
  const { asking, answer, saving, saveError } = useConsentStore()
  if (!asking) return null
  const footer = (
    <Stack gap={3} grow>
      {saveError && <Banner tone="danger" icon="alert-circle" role="alert">{saveError}</Banner>}
      <Button variant="outline" size="lg" block loading={saving} onClick={() => answer(true)}>Allow</Button>
      <Button variant="outline" size="lg" block disabled={saving} onClick={() => answer(false)}>Not now</Button>
    </Stack>
  )
  return (
    <Sheet title={AI_CONSENT_TITLE} onClose={() => !saving && answer(false)} footer={footer} className="ai-consent">
      <Stack gap={4}>
        <AiConsentDetails />
      </Stack>
    </Sheet>
  )
}
