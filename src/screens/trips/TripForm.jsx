import { useState } from 'react'
import { useTripsStore, useUIStore, useCollabStore } from '../../store'
import CityAutocomplete from '../../components/shared/CityAutocomplete'
import { lookupZone } from '../../lib/zoneLookup'
import { isUndated } from '../../lib/trips'
import { warmGuide } from '../../store/guideStore'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import { Sheet, Field, Button, IconButton, SegmentedControl, Banner, Text, Stack, Card, IconTile, EmptyState, Switch } from '../../ui'

export default function TripForm() {
  const { editingItem, closeTripForm } = useUIStore()
  const { trips, createTrip, updateTrip, deleteTrip } = useTripsStore()
  const { inviteCollaborator } = useCollabStore()

  // editingItem with an id = edit; without an id = prefill for a new trip (e.g. "Go back again")
  const isEdit = !!editingItem?.id
  const [step, setStep] = useState('form') // 'form' | 'invite'
  const [tripType, setTripType] = useState('solo') // 'solo' | 'group'
  const [newTripId, setNewTripId] = useState(null)
  const [inviteEmails, setInviteEmails] = useState([''])
  const [inviteRole, setInviteRole] = useState('collaborator')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteResults, setInviteResults] = useState([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  // "Not sure yet": a planning trip without dates; flights or hotels added later fill them in
  const [noDates, setNoDates] = useState(isEdit && !editingItem?.start_date)

  const [form, setForm] = useState({
    title: editingItem?.title || '',
    destination_city: editingItem?.destination_city || '',
    destination_country: editingItem?.destination_country || '',
    destination_country_code: editingItem?.destination_country_code || '',
    destination_tz: editingItem?.destination_tz || null,
    destination_lat: editingItem?.destination_lat ?? null,
    destination_lng: editingItem?.destination_lng ?? null,
    destination_place_id: editingItem?.destination_place_id || null,
    cover_photo: editingItem?.cover_photo || null,
    start_date: isEdit ? editingItem?.start_date || '' : '',
    end_date: isEdit ? editingItem?.end_date || '' : '',
    notes: isEdit ? editingItem?.notes || '' : '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleCitySelect = (result) => {
    setForm(f => ({
      ...f,
      destination_city: result.city,
      destination_country: result.country,
      destination_country_code: result.country_code,
      // Google city pick: coordinates, place, cover photo and zone come with it
      destination_lat: result.lat ?? null,
      destination_lng: result.lng ?? null,
      destination_place_id: result.place_id || null,
      cover_photo: result.photo || null,
      destination_tz: result.tz || null,
      title: f.title || result.city,
    }))
    if (result.tz) return
    // The destination's time zone drives Today, day counts and booking times
    lookupZone({ query: `${result.city}, ${result.country}` }).then(tz => {
      if (tz) setForm(f => (f.destination_city === result.city ? { ...f, destination_tz: tz } : f))
    })
  }

  const datesOf = (f) => (noDates ? { ...f, start_date: null, end_date: null } : f)

  const handleSubmit = async (e) => {
    e?.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (isEdit) {
        await updateTrip(editingItem.id, datesOf(form))
        closeTripForm()
      } else {
        // Already planning this city without dates? Give that trip these dates instead of making a second one
        const twin = !noDates && trips.find(t => isUndated(t) && !t._isShared && t.status !== 'cancelled'
          && t.destination_city?.trim().toLowerCase() === form.destination_city.trim().toLowerCase())
        if (twin) {
          await updateTrip(twin.id, { start_date: form.start_date, end_date: form.end_date })
          closeTripForm()
          return
        }
        const trip = await createTrip(datesOf(form))
        // Start writing the city guide now, so it's ready when they open Explore
        warmGuide(form.destination_city, form.destination_country, form.destination_country_code)
        if (tripType === 'group' && trip?.id) {
          setNewTripId(trip.id)
          setStep('invite')
        } else {
          closeTripForm()
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSendInvites = async () => {
    const validEmails = inviteEmails.filter(e => e.trim() && e.includes('@'))
    if (!validEmails.length) { closeTripForm(); return }
    setInviteSending(true)
    const results = await Promise.all(
      validEmails.map(email => inviteCollaborator(newTripId, email.trim().toLowerCase(), inviteRole, form.title))
    )
    setInviteResults(results)
    setInviteSending(false)
    // Show results briefly then close
    setTimeout(() => closeTripForm(), 1800)
  }

  const handleDelete = async () => {
    await deleteTrip(editingItem.id)
    setShowDeleteConfirm(false)
    closeTripForm()
  }

  const isValid = form.title && form.destination_city && form.destination_country && (noDates || (form.start_date && form.end_date))

  // ── INVITE STEP ─────────────────────────────────────────────
  if (step === 'invite') {
    const sent = inviteResults.filter(r => r.success).length
    const failed = inviteResults.filter(r => !r.success)
    return (
      <Sheet title="Who else is coming?" subtitle={form.title} onClose={closeTripForm}>
        {inviteResults.length > 0 ? (
          <EmptyState goose={sent ? 'excited' : 'worried'} title={sent ? `${sent} invite${sent !== 1 ? 's' : ''} sent` : 'Invites not sent'}>
            {sent ? 'They get an email from Goose with a link to join.' : failed[0]?.error || 'Try again from the trip later.'}
          </EmptyState>
        ) : (
          <>
            <Stack gap={2}>
              {inviteEmails.map((email, i) => (
                <Stack row gap={2} key={i}>
                  <Field
                    className="grow"
                    label={`Email ${i + 1}`}
                    hideLabel={i > 0}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="friend@example.com"
                    value={email}
                    onChange={e => {
                      const arr = [...inviteEmails]
                      arr[i] = e.target.value
                      setInviteEmails(arr)
                    }}
                  />
                  {inviteEmails.length > 1 && (
                    <IconButton icon="close" variant="ghost" label={`Remove email ${i + 1}`} onClick={() => setInviteEmails(inviteEmails.filter((_, j) => j !== i))} />
                  )}
                </Stack>
              ))}
              {inviteEmails.length < 6 && (
                <Button variant="ghost" size="sm" icon="plus" onClick={() => setInviteEmails([...inviteEmails, ''])}>Add another</Button>
              )}
            </Stack>
            <Stack gap={2}>
              <Text variant="label" as="p" id="invite-role">Permission</Text>
              <SegmentedControl role="radiogroup" label="Permission" value={inviteRole} onChange={setInviteRole}
                options={[{ value: 'collaborator', label: 'Can edit' }, { value: 'viewer', label: 'View only' }]} />
            </Stack>
            <Stack gap={2}>
              <Button variant="primary" size="lg" block icon="mail" onClick={handleSendInvites} loading={inviteSending}
                disabled={!inviteEmails.some(e => e.trim() && e.includes('@'))}>
                {inviteSending ? 'Sending invites' : 'Send invites'}
              </Button>
              <Button variant="ghost" block onClick={closeTripForm}>Not now</Button>
            </Stack>
          </>
        )}
      </Sheet>
    )
  }

  // ── MAIN FORM ────────────────────────────────────────────────
  return (
    <>
      <Sheet title={isEdit ? 'Edit trip' : 'New trip'} onClose={closeTripForm}>
        <form className="trip-form" onSubmit={handleSubmit}>
          {error && <Banner tone="danger" icon="alert-circle" title="Couldn't save the trip" role="alert">{error}</Banner>}

          <Stack gap={1}>
            <CityAutocomplete
              label="Destination"
              value={form.destination_city}
              onChange={(val) => update('destination_city', val)}
              onSelect={handleCitySelect}
            />
            {form.destination_country && (
              <Text variant="micro" tone="muted" as="p">{form.destination_country}</Text>
            )}
          </Stack>

          <Field label="Trip name" placeholder="Tokyo in spring" value={form.title} onChange={e => update('title', e.target.value)} />

          <div className="grid-2">
            <Field label="Depart" type="date" value={form.start_date} disabled={noDates} onChange={e => update('start_date', e.target.value)} />
            <Field label="Return" type="date" value={form.end_date} disabled={noDates} min={form.start_date} onChange={e => update('end_date', e.target.value)} />
          </div>
          <Switch label="Not sure of the dates yet" description="Plan now. Goose fills in the dates when flights or hotels are added."
            checked={noDates} onChange={setNoDates} />

          {!isEdit && (
            <Stack gap={2}>
              <Text variant="label" as="p">Who's going</Text>
              <div className="grid-2" role="radiogroup" aria-label="Who's going">
                {[
                  ['solo', 'profile', 'Just me', 'Plan and track solo'],
                  ['group', 'users', 'Group trip', 'Invite and plan together'],
                ].map(([val, icon, title, sub]) => (
                  <Card key={val} variant="tile" role="radio" aria-checked={tripType === val} onClick={() => setTripType(val)}
                    className={`trip-form__type${tripType === val ? ' is-selected' : ''}`}>
                    <IconTile icon={icon} tone={tripType === val ? 'accent' : 'neutral'} />
                    <Text variant="body" weight={600} as="span">{title}</Text>
                    <Text variant="micro" tone="muted" as="span">{sub}</Text>
                  </Card>
                ))}
              </div>
            </Stack>
          )}

          <Field label="Notes (optional)" as="textarea" rows={3} placeholder="Anything to remember" value={form.notes} onChange={e => update('notes', e.target.value)} />

          <Stack gap={2}>
            <Button type="submit" variant="primary" size="lg" block loading={loading} disabled={!isValid}>
              {loading ? 'Saving' : isEdit ? 'Save changes' : tripType === 'group' ? 'Create and invite' : 'Add trip'}
            </Button>
            {isEdit && (
              <Button variant="ghost" block icon="trash" className="trip-form__delete" onClick={() => setShowDeleteConfirm(true)}>Delete trip</Button>
            )}
          </Stack>
        </form>
      </Sheet>
      {showDeleteConfirm && (
        <ConfirmDialog
          message={`Delete "${form.title || 'this trip'}"?`}
          detail="Its bookings, notes and packing list go too. This can't be undone."
          confirmLabel="Delete trip"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  )
}
