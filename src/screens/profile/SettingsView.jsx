import { useEffect, useState } from 'react'
import { useAuthStore, useUIStore } from '../../store'
import { InboxAddress } from '../trips/InboxHint'
import { analyticsEnabled, setAnalyticsEnabled } from '../../lib/analytics'
import { usePlanStore, isFirstClass } from '../../store/planStore'
import { useConsentStore } from '../../store/consentStore'
import { consentCurrent } from '../../lib/aiConsentPolicy'
import { canBuy, manageTarget, openManage } from '../../lib/purchases'
import { reportIssueHref, trackReport } from '../../lib/reportIssue'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import {
  Screen, ScreenHeader, Section, Card, ListRow, Button, Field, Banner, SegmentedControl, Switch, Text, Stack, Logo, LinkButton, Icon,
} from '../../ui'

// Mirror of INBOX_SENDER_CHECK in supabase/functions/receive-booking-email/ingest.ts: keep the two in step.
// While false the inbox reads mail from any sender, so the 'accept from any sender' switch is hidden.
const INBOX_SENDER_CHECK = false
const PROVIDER = { email: 'Email', google: 'Google', apple: 'Apple' }

function ValueRow({ label, value }) {
  return (
    <div className="profile-detail">
      <Text variant="body" weight={500} as="span">{label}</Text>
      <Text variant="body" tone="muted" as="span" className="profile-detail__value">{value}</Text>
    </div>
  )
}

function ExternalRow({ href, title }) {
  return (
    <a className="c-row c-row--action" href={href} target="_blank" rel="noreferrer">
      <span className="c-row__body"><span className="c-row__title">{title}</span></span>
      <Icon name="external" size={18} className="c-row__chevron" />
    </a>
  )
}

const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })

// Plan row: free → opens the paywall (an app build without store billing only names the plan); First Class →
// renewal date and, where this platform may, Manage
function PlanSection() {
  const { plan, openPaywall } = usePlanStore()
  const userId = useAuthStore(s => s.user?.id)
  const [error, setError] = useState(null)
  if (!plan) return null
  if (!isFirstClass(plan)) {
    return (
      <Section title="Plan">
        <Card variant="group">
          {canBuy
            ? <ListRow icon="star" title="Get First Class" meta="Unlimited trips, reservations and email import" chevron onClick={() => openPaywall('settings')} />
            : <ValueRow label="Current plan" value="Free" />}
        </Card>
      </Section>
    )
  }
  const sub = plan.web?.subscription
  const renews = plan.store ? plan.store.will_renew : sub ? !sub.canceling : false
  const line = !plan.until ? 'For life' : `${renews ? 'Renews' : 'Ends'} ${fmtDate(plan.until)}`
  const target = manageTarget(plan)
  const manage = async () => { setError(null); try { await openManage(plan, userId) } catch (e) { setError(e.message) } }
  return (
    <Section title="Plan">
      <Card variant="group">
        <ValueRow label="First Class" value={line} />
        {sub?.status === 'past_due' && <Banner tone="danger" icon="alert-triangle">Your last payment didn’t go through. Update your card to keep First Class.</Banner>}
        {target && <ListRow icon="card" title="Manage subscription" meta={target === 'stripe_portal' ? 'Card, invoices, cancel' : 'Cancel, refunds, restore'} chevron onClick={manage} />}
        {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
      </Card>
    </Section>
  )
}

export default function SettingsView({ onBack, onDelete }) {
  const { profile, user, updateProfile, rotateInboxAddress, signOut } = useAuthStore()
  const { themePref, setThemePref } = useUIStore()
  const [name, setName] = useState(profile?.display_name || '')
  const [currency, setCurrency] = useState(profile?.home_currency || 'USD')
  const [passportCode, setPassportCode] = useState(profile?.passport_country || '')
  const [tempUnit, setTempUnit] = useState(profile?.temp_unit || 'C')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [inboxError, setInboxError] = useState(null)
  const [shareStats, setShareStats] = useState(analyticsEnabled)

  useEffect(() => {
    if (profile?.display_name) setName(profile.display_name)
    if (profile?.home_currency) setCurrency(profile.home_currency)
    if (profile?.passport_country) setPassportCode(profile.passport_country)
    if (profile?.temp_unit) setTempUnit(profile.temp_unit)
  }, [profile?.display_name, profile?.home_currency, profile?.passport_country, profile?.temp_unit])

  const handleSave = async (e) => {
    e?.preventDefault()
    setSaveError(null)
    setSaving(true)
    try {
      await updateProfile({
        display_name: name,
        home_currency: currency.toUpperCase(),
        passport_country: passportCode.toUpperCase(),
        temp_unit: tempUnit,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setSaveError(e?.message || 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleTempUnitChange = async (unit) => {
    setTempUnit(unit)
    try {
      await updateProfile({ temp_unit: unit })
    } catch (e) {
      console.error('temp unit save error', e)
    }
  }

  const bookingEmail = profile?.booking_email_token
    ? `${profile.booking_email_token}@bookings.sillytraveltool.com`
    : null

  const handleCopy = () => {
    if (!bookingEmail) return
    navigator.clipboard.writeText(bookingEmail).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleRotate = async () => {
    setInboxError(null)
    try { await rotateInboxAddress() } catch (e) { setInboxError(e?.message || 'Could not make a new address. Try again.') }
    setConfirmRotate(false)
  }

  const provider = user?.app_metadata?.provider

  return (
    <Screen gap={4} labelledBy="settings-title">
      <ScreenHeader onBack={onBack} backLabel="Back to profile" title="Settings" titleId="settings-title" />

      <PlanSection />

      <Section title="Account">
        <Card variant="group">
          <ValueRow label="Email" value={user?.email || ''} />
          {provider && <ValueRow label="Signed in with" value={PROVIDER[provider] || provider} />}
        </Card>
      </Section>

      <Section title="Goose inbox">
        <Card variant="raised">
          <Text variant="body" tone="secondary">Forward any booking confirmation to this address and it lands in the right trip.</Text>
          {bookingEmail ? (
            <Stack gap={3} align="start">
              <Text variant="body" weight={600} tone="accent" className="profile-address"><InboxAddress address={bookingEmail} /></Text>
              <Button size="sm" icon={copied ? 'check' : 'copy'} onClick={handleCopy} aria-label={copied ? 'Inbox address copied' : 'Copy inbox address'}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </Stack>
          ) : (
            <Text variant="caption" tone="muted">Setting up your address</Text>
          )}
          <Text variant="micro" tone="muted">{INBOX_SENDER_CHECK ? `Goose reads mail you forward from ${user?.email || 'your account email'}. Keep the address private.` : 'Goose reads any mail sent to this address. Keep it private.'}</Text>
          {inboxError && <Banner tone="danger" icon="alert-circle" role="alert">{inboxError}</Banner>}
        </Card>
        <Card variant="group">
          {INBOX_SENDER_CHECK && <Switch label="Accept from any sender" description="For automatic forwarding rules that keep the airline or hotel as the sender. Anyone who learns your address can then add bookings."
            checked={!!profile?.inbox_accept_any} onChange={on => updateProfile({ inbox_accept_any: on }).catch(e => setInboxError(e?.message || 'Could not save. Try again.'))} />}
          <ListRow title="New address" meta="The old address stops working at once" chevron onClick={() => setConfirmRotate(true)} />
        </Card>
      </Section>
      {confirmRotate && (
        <ConfirmDialog message="Get a new inbox address?" detail="Mail sent to the old address is no longer read. Update any forwarding rules. Bookings already filed stay."
          confirmLabel="New address" onConfirm={handleRotate} onCancel={() => setConfirmRotate(false)} />
      )}

      <Section title="Profile">
        <Card>
          <form className="profile-form" onSubmit={handleSave}>
            <Field label="Display name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
            <Field label="Home currency" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="USD" inputClassName="tabular" />
            <Field label="Passport country" value={passportCode} onChange={e => setPassportCode(e.target.value.toUpperCase())} maxLength={2} placeholder="US, GB, AU"
              hint="2-letter code. SOS uses it when your location is off." inputClassName="tabular" />
            {saveError && <Banner tone="danger" icon="alert-circle" role="alert">{saveError}</Banner>}
            <Button type="submit" variant="primary" block loading={saving} icon={saved ? 'check' : undefined}>
              {saved ? 'Saved' : saving ? 'Saving' : 'Save changes'}
            </Button>
          </form>
        </Card>
      </Section>

      <Section title="Preferences">
        <Card>
          <Stack gap={2}>
            <Text variant="label" as="p" id="appearance-label">Appearance</Text>
            <SegmentedControl role="radiogroup" label="Appearance" value={themePref} onChange={setThemePref}
              options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
            <Text variant="micro" tone="muted" as="p">System follows your phone's light or dark setting.</Text>
          </Stack>
          <Stack gap={2}>
            <Text variant="label" as="p">Temperature</Text>
            <SegmentedControl role="radiogroup" label="Temperature unit" value={tempUnit} onChange={handleTempUnitChange}
              options={[{ value: 'C', label: '°C Celsius' }, { value: 'F', label: '°F Fahrenheit' }]} />
          </Stack>
        </Card>
      </Section>

      <Section title="Privacy and about">
        <Card variant="group">
          <Switch label="Share usage stats" description="Which features you use and your device type help us improve the app. No names, emails or trip details."
            checked={shareStats} onChange={on => { setAnalyticsEnabled(on); setShareStats(on) }} />
          <Switch label="AI reading of imports and translations" description="Goose’s AI (DeepSeek, with Google Gemini for photos and PDFs) reads the emails you forward, what you import and the sentences you type to translate. Off: forwarded emails wait for your OK."
            checked={consentCurrent(profile)} onChange={on => {
              setAiError(null)
              // The switch follows the saved profile, so a failed save leaves it where it was; say so
              useConsentStore.getState().setConsent(on, 'settings').catch(() => setAiError('Couldn’t save that choice. Check your connection and try again.'))
            }} />
          {aiError && <Banner tone="danger" icon="alert-circle" role="alert">{aiError}</Banner>}
          <Switch label="Tailored offers" description="Use the kind of trips you plan to pick offers and tips that fit. Off keeps your trips out of it."
            checked={profile?.tailored_offers !== false} onChange={on => updateProfile({ tailored_offers: on }).catch(() => {})} />
          <Switch label="Travel tips by email" description="Now and then: trip recaps, ideas for your next trip and offers. Unsubscribe from any email."
            checked={!!profile?.marketing_emails} onChange={on => updateProfile({ marketing_emails: on, marketing_emails_at: new Date().toISOString() }).catch(() => {})} />
          <ExternalRow href="https://sillytraveltool.com/privacy/" title="Privacy Policy" />
          <ExternalRow href="https://sillytraveltool.com/terms/" title="Terms of Service" />
          <ListRow title="Delete account" meta="Erase your trips, documents and score" danger chevron onClick={onDelete} />
        </Card>
      </Section>

      <Button variant="secondary" size="lg" block icon="sign-out" onClick={signOut}>Sign out</Button>

      <Stack gap={2} align="center" className="profile-about">
        <Logo size="sm" />
        <Text variant="micro" tone="muted">Silly Travel Tool · v{import.meta.env.VITE_APP_VERSION || '0.19.0'}</Text>
        <LinkButton href="mailto:hello@sillytraveltool.com">hello@sillytraveltool.com</LinkButton>
        <LinkButton icon="alert-circle" href={reportIssueHref('settings')} onClick={() => trackReport('settings')}>Report an issue</LinkButton>
      </Stack>
    </Screen>
  )
}
