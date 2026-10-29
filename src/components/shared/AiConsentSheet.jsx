import { useConsentStore } from '../../store/consentStore'
import { Sheet, Stack, Text, Button, Banner, IconTile } from '../../ui'
import './aiConsent.css'

// The one question before Goose's AI reads what a member sends it (Apple 5.1.2(i), legal review L1). The same words
// appear as a tour step (Onboarding.jsx) and as this sheet, opened by useConsentStore().ensure(reason) at the first
// import or typed translation when the tour step was skipped.
const READS = [
  { icon: 'inbox', tone: 'accent', title: 'Booking emails you forward', meta: 'Times, places and confirmation numbers' },
  { icon: 'clipboard', tone: 'success', title: 'Text and files you import', meta: 'Pasted confirmations, PDFs and screenshots' },
  { icon: 'translate', tone: 'info', title: 'Sentences you translate', meta: 'Typed in Tools → Translate' },
]

export const AI_CONSENT_TITLE = 'Let Goose read your bookings?'
export const AI_CONSENT_LEAD = 'Goose uses AI to turn what you send it into a tidy plan.'

/** The list and the small print, shared by the tour step and the sheet. */
export function AiConsentDetails() {
  return (
    <Stack gap={3}>
      <ul className="ai-consent__list">
        {READS.map(r => (
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
        The reading is done by DeepSeek, whose servers are in China, with Google Gemini for photos and PDFs. They only
        see what you send to Goose. You can change this any time in Settings.{' '}
        <a href="https://sillytraveltool.com/privacy/#ai" target="_blank" rel="noreferrer">Privacy Policy</a>
      </Text>
    </Stack>
  )
}

export default function AiConsentSheet() {
  const { asking, answer, saving, saveError } = useConsentStore()
  if (!asking) return null
  const footer = (
    <Stack gap={3} grow>
      {saveError && <Banner tone="danger" icon="alert-circle" role="alert">{saveError}</Banner>}
      <Button variant="primary" size="lg" block loading={saving} onClick={() => answer(true)}>Allow</Button>
      <Button variant="ghost" block disabled={saving} onClick={() => answer(false)}>Not now</Button>
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
