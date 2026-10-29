import { useConsentStore } from '../../store/consentStore'
import { Sheet, Stack, Text, Button, Banner, IconTile } from '../../ui'
import { AI_CONSENT_TITLE, AI_CONSENT_LEAD, AI_CONSENT_READS, AI_CONSENT_NOTE, AI_CONSENT_NOT_NOW, AI_CONSENT_POLICY_URL, AI_CONSENT_POLICY_LABEL } from '../../lib/aiConsentCopy'
import './aiConsent.css'

export { AI_CONSENT_TITLE, AI_CONSENT_LEAD }

// The one question before Goose's AI reads what a member sends it (Apple 5.1.2(i), legal review L1). The same words
// appear as a tour step (Onboarding.jsx) and as this sheet, opened by useConsentStore().ensure(reason) at the first
// import or typed translation when the tour step was skipped.
/** The list and the small print, shared by the tour step and the sheet. */
export function AiConsentDetails() {
  return (
    <Stack gap={3}>
      <ul className="ai-consent__list">
        {AI_CONSENT_READS.map(r => (
          <li key={r.title} className="ai-consent__item">
            <IconTile icon={r.icon} tone={r.tone} />
            <span className="c-row__body">
              <span className="c-row__title">{r.title}</span>
              <span className="c-row__meta">{r.meta}</span>
            </span>
          </li>
        ))}
      </ul>
      <Text variant="caption" tone="muted" as="p" className="ai-consent__note">
        {AI_CONSENT_NOTE}{' '}
        <a href={AI_CONSENT_POLICY_URL} target="_blank" rel="noreferrer">{AI_CONSENT_POLICY_LABEL}</a>
      </Text>
      <Text variant="caption" tone="muted" as="p" className="ai-consent__note">{AI_CONSENT_NOT_NOW}</Text>
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
        <Text variant="body" tone="secondary">{AI_CONSENT_LEAD}</Text>
        <AiConsentDetails />
      </Stack>
    </Sheet>
  )
}
