import { useEffect, useState } from 'react'
import { useAuthStore, useUIStore } from '../../store'
import {
  Screen, ScreenHeader, Section, Card, ListRow, Button, Field, Banner, SegmentedControl, Text, Stack, Logo, LinkButton, Icon,
} from '../../ui'

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

export default function SettingsView({ onBack, onDelete }) {
  const { profile, user, updateProfile, signOut } = useAuthStore()
  const { themePref, setThemePref } = useUIStore()
  const [name, setName] = useState(profile?.display_name || '')
  const [currency, setCurrency] = useState(profile?.home_currency || 'USD')
  const [passportCode, setPassportCode] = useState(profile?.passport_country || '')
  const [tempUnit, setTempUnit] = useState(profile?.temp_unit || 'C')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [copied, setCopied] = useState(false)

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

  const provider = user?.app_metadata?.provider

  return (
    <Screen gap={4} labelledBy="settings-title">
      <ScreenHeader onBack={onBack} backLabel="Back to profile" title="Settings" titleId="settings-title" />

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
            <Stack row gap={3}>
              <Text variant="body" weight={600} tone="accent" className="grow profile-address">{bookingEmail}</Text>
              <Button size="sm" icon={copied ? 'check' : 'copy'} onClick={handleCopy} aria-label={copied ? 'Inbox address copied' : 'Copy inbox address'}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </Stack>
          ) : (
            <Text variant="caption" tone="muted">Setting up your address</Text>
          )}
          <Text variant="micro" tone="muted">Only mail sent to your own address appears in your trips. Keep it private.</Text>
        </Card>
      </Section>

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
          <ExternalRow href="https://sillytraveltool.com/privacy" title="Privacy Policy" />
          <ExternalRow href="https://sillytraveltool.com/terms" title="Terms of Service" />
          <ListRow title="Delete account" meta="Erase your trips, documents and score" danger chevron onClick={onDelete} />
        </Card>
      </Section>

      <Button variant="secondary" size="lg" block icon="sign-out" onClick={signOut}>Sign out</Button>

      <Stack gap={2} align="center" className="profile-about">
        <Logo size="sm" />
        <Text variant="micro" tone="muted">Silly Travel Tool · v{import.meta.env.VITE_APP_VERSION || '0.19.0'}</Text>
        <LinkButton href="mailto:hello@sillytraveltool.com">hello@sillytraveltool.com</LinkButton>
      </Stack>
    </Screen>
  )
}
