import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useAuthStore, useTripsStore } from '../../store'
import { supabase } from '../../lib/supabase'
import { parseLocalDate, findCurrentOrNextTrip } from '../../lib/dates'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import {
  Screen, ScreenHeader, Section, Card, ListRow, Button, LinkButton, Banner, Sheet, Field, Text, Overline, Stack, Chip, IconTile, Skeleton, EmptyState,
} from '../../ui'

export const DOC_TYPES = [
  { value: 'passport', label: 'Passport', icon: 'passport', tone: 'info' },
  { value: 'visa', label: 'Visa', icon: 'file', tone: 'info' },
  { value: 'insurance', label: 'Travel insurance', icon: 'shield-check', tone: 'success' },
  { value: 'id', label: 'National ID', icon: 'id-card', tone: 'info' },
  { value: 'vaccine', label: 'Vaccine record', icon: 'vaccine', tone: 'success' },
  { value: 'other', label: 'Other', icon: 'folder', tone: 'neutral' },
]
const typeOf = (t) => DOC_TYPES.find(d => d.value === t) || DOC_TYPES[DOC_TYPES.length - 1]

const RECOMMENDED = [
  { type: 'passport', label: 'Passport', hint: 'Track expiry: many countries need 6 months validity' },
  { type: 'id', label: "National ID or driver's licence", hint: 'Backup ID and local car hire' },
  { type: 'insurance', label: 'Travel insurance', hint: 'Policy number and the emergency line' },
  { type: 'vaccine', label: 'Vaccine record', hint: 'Some destinations ask for proof' },
]

const REVEAL_MS = 30000

function daysUntilExpiry(expiry) {
  if (!expiry) return null
  return Math.ceil((new Date(expiry + 'T00:00:00') - new Date()) / (1000 * 60 * 60 * 24))
}

/** Expiry status: label + chip tone, or null when nothing to flag. */
function expiryStatus(days) {
  if (days === null) return null
  if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, tone: 'danger' }
  if (days === 0) return { label: 'Expires today', tone: 'danger' }
  if (days < 30) return { label: `Expires in ${days}d`, tone: 'danger' }
  if (days < 90) return { label: `Expires in ${Math.round(days / 30)}mo`, tone: 'accent' }
  return null
}

const fmtDate = (iso, pattern = 'MMM d, yyyy') => (iso ? format(parseLocalDate(iso), pattern) : '')

// Document numbers are encrypted at rest; only the last 4 digits come back
// with the row. The full number is fetched on demand (owner-only RPC).
function useReveal(doc) {
  const [full, setFull] = useState(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const toggle = async () => {
    if (full) { setFull(null); clearTimeout(timer.current); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('reveal_document_number', { p_doc_id: doc.id })
    setBusy(false)
    if (!error && data) {
      setFull(data)
      timer.current = setTimeout(() => setFull(null), REVEAL_MS) // hide again automatically
    }
  }
  return { full, busy, toggle }
}

function NumberRow({ doc, inverse = false }) {
  const { full, busy, toggle } = useReveal(doc)
  return (
    <Stack row justify="between" gap={3} className="profile-docnum">
      <Stack gap={0}>
        <Text variant="micro" tone={inverse ? 'inverse-muted' : 'muted'} as="p">Number</Text>
        <Text variant="card-title" as="p" className="profile-docnum__value tabular" aria-live="polite">
          {full || `•••• ${doc.document_number_last4}`}
        </Text>
      </Stack>
      <Button size="sm" icon={full ? 'eye-off' : 'eye'} loading={busy} onClick={toggle}
        aria-label={full ? 'Hide document number' : 'Reveal document number'}>
        {busy ? 'Unlocking' : full ? 'Hide' : 'Reveal'}
      </Button>
    </Stack>
  )
}

function PassportHero({ doc, onOpen }) {
  const st = expiryStatus(daysUntilExpiry(doc.expiry_date))
  return (
    <Card variant="raised" aria-labelledby={`doc-${doc.id}`}>
      <Stack row gap={3}>
        <IconTile icon="passport" tone="info" />
        <Stack gap={0} grow>
          <Overline tone="accent" id={`doc-${doc.id}`}>Passport{doc.issuing_country ? ` · ${doc.issuing_country}` : ''}</Overline>
          <Text variant="body" weight={600} as="p">{doc.title}</Text>
        </Stack>
        <LinkButton onClick={() => onOpen(doc)} aria-label={`${doc.title} details`}>Details</LinkButton>
      </Stack>
      {doc.document_number_last4 && <NumberRow doc={doc} />}
      <Stack row gap={2} wrap>
        {doc.expiry_date && <Chip tone={st?.tone || 'neutral'} icon={st ? 'alert-circle' : 'calendar'}>{st ? st.label : `Exp. ${fmtDate(doc.expiry_date, 'MMM yyyy')}`}</Chip>}
      </Stack>
    </Card>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="profile-detail">
      <Text variant="caption" tone="muted" as="span">{label}</Text>
      <Text variant="body" as="span" className="profile-detail__value">{value}</Text>
    </div>
  )
}

function DocDetailSheet({ doc, onClose, onEdit, onDelete }) {
  const t = typeOf(doc.type)
  const st = expiryStatus(daysUntilExpiry(doc.expiry_date))
  return (
    <Sheet title={doc.title} subtitle={t.label} onClose={onClose}>
      {st && <Banner tone={st.tone === 'danger' ? 'danger' : 'accent'} icon="alert-circle">{st.label}</Banner>}
      <Card variant="group">
        {doc.document_number_last4 && <NumberRow doc={doc} />}
        {doc.issuing_country && <DetailRow label="Issued by" value={doc.issuing_country} />}
        {doc.issue_date && <DetailRow label="Issue date" value={fmtDate(doc.issue_date)} />}
        {doc.expiry_date && <DetailRow label="Expiry" value={fmtDate(doc.expiry_date)} />}
        {doc.notes && <DetailRow label="Notes" value={doc.notes} />}
      </Card>
      <Stack row gap={2}>
        <Button className="grow" icon="trash" variant="ghost" onClick={onDelete}>Delete</Button>
        <Button className="grow" variant="primary" icon="edit" onClick={onEdit}>Edit</Button>
      </Stack>
    </Sheet>
  )
}

function DocForm({ doc, userId, onClose, onSaved }) {
  const [form, setForm] = useState({
    type: doc?.type || 'passport',
    title: doc?.title || '',
    document_number: doc?.document_number || '',
    issuing_country: doc?.issuing_country || '',
    issue_date: doc?.issue_date || '',
    expiry_date: doc?.expiry_date || '',
    notes: doc?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async (e) => {
    e?.preventDefault()
    if (!form.title.trim()) { setError('Give the document a name'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        user_id: userId,
        type: form.type,
        title: form.title.trim(),
        document_number: form.document_number.trim() || null,
        issuing_country: form.issuing_country.trim() || null,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        notes: form.notes.trim() || null,
      }
      let data, err
      if (doc?.id) {
        ({ data, error: err } = await supabase.from('wallet_documents').update(payload).eq('id', doc.id).select().single())
      } else {
        ({ data, error: err } = await supabase.from('wallet_documents').insert(payload).select().single())
      }
      if (err) throw err
      onSaved(data)
    } catch (e) {
      setError(e?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet title={doc?.id ? 'Edit document' : 'Add a document'} onClose={onClose}>
      <form className="profile-form" onSubmit={handleSave}>
        <Field label="Document type" as="select" value={form.type} onChange={e => set('type', e.target.value)}>
          {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Field>
        <Field label="Name" value={form.title} onChange={e => set('title', e.target.value)} placeholder="UK passport" error={error && !form.title.trim() ? error : undefined} />
        <Field label="Document number" value={form.document_number} onChange={e => set('document_number', e.target.value)}
          autoComplete="off" inputClassName="tabular"
          placeholder={doc?.document_number_last4 ? `Saved, ends in ${doc.document_number_last4}` : '123456789'}
          hint={doc?.document_number_last4 ? 'Leave blank to keep the saved number. Stored encrypted.' : 'Stored encrypted. Only the last 4 digits show.'} />
        <Field label="Issuing country" value={form.issuing_country} onChange={e => set('issuing_country', e.target.value)} placeholder="United Kingdom" />
        <div className="grid-2">
          <Field label="Issue date" type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)} />
          <Field label="Expiry date" type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
        </div>
        <Field label="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Emergency line, policy number" />
        {error && form.title.trim() && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
        <Button type="submit" variant="primary" size="lg" block loading={saving}>
          {saving ? 'Saving' : doc?.id ? 'Save changes' : 'Add document'}
        </Button>
      </form>
    </Sheet>
  )
}

export default function DocumentsView({ wallet, onBack }) {
  const user = useAuthStore(s => s.user)
  const trips = useTripsStore(s => s.trips)
  const { rows: docs, loading, remove, upsertLocal } = wallet
  const [form, setForm] = useState(null) // null | {} (new) | doc
  const [detail, setDetail] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const passport = docs.find(d => d.type === 'passport')
  const others = docs.filter(d => d !== passport)
  const added = new Set(docs.map(d => d.type))
  const recommended = RECOMMENDED.filter(r => !added.has(r.type))

  // Passport validity vs the next trip (many countries need 6 months)
  const { trip: nextTrip } = findCurrentOrNextTrip(trips)
  let validity = null
  if (passport?.expiry_date && nextTrip?.end_date) {
    const sixMonths = parseLocalDate(nextTrip.end_date)
    sixMonths.setMonth(sixMonths.getMonth() + 6)
    validity = parseLocalDate(passport.expiry_date) >= sixMonths
      ? { tone: 'success', icon: 'check-circle', text: `Valid 6+ months past your ${nextTrip.destination_city} trip` }
      : { tone: 'danger', icon: 'alert-triangle', text: `Less than 6 months left after your ${nextTrip.destination_city} trip. Check entry rules.` }
  }

  return (
    <Screen gap={4} labelledBy="docs-title">
      <ScreenHeader onBack={onBack} backLabel="Back to profile" title="Travel documents" titleId="docs-title" />

      {loading ? (
        <Stack gap={3} aria-busy="true" aria-label="Loading documents">{[1, 2].map(i => <Card key={i}><Skeleton lines={2} /></Card>)}</Stack>
      ) : (
        <>
          {passport && <PassportHero doc={passport} onOpen={setDetail} />}
          {validity && <Banner tone={validity.tone} icon={validity.icon}>{validity.text}</Banner>}

          {others.length > 0 && (
            <Card variant="group">
              {others.map(doc => {
                const t = typeOf(doc.type)
                const st = expiryStatus(daysUntilExpiry(doc.expiry_date))
                const meta = [
                  doc.document_number_last4 ? `•••• ${doc.document_number_last4}` : null,
                  doc.expiry_date ? `Exp. ${fmtDate(doc.expiry_date, 'MMM yyyy')}` : null,
                  !doc.document_number_last4 && !doc.expiry_date ? t.label : null,
                ].filter(Boolean).join(' · ')
                return (
                  <ListRow key={doc.id} icon={t.icon} tone={st?.tone === 'danger' ? 'danger' : t.tone} title={doc.title} meta={st ? `${meta} · ${st.label}` : meta}
                    chevron onClick={() => setDetail(doc)} />
                )
              })}
            </Card>
          )}

          {!docs.length && (
            <EmptyState goose="happy" title="Keep your documents handy">
              Passport, insurance and vaccine records in one place, with expiry reminders before you fly.
            </EmptyState>
          )}

          <Button variant="primary" size="lg" block icon="plus" onClick={() => setForm({})}>Add a document</Button>

          {recommended.length > 0 && (
            <Section title="Worth adding">
              <Card variant="group">
                {recommended.map(r => {
                  const t = typeOf(r.type)
                  return <ListRow key={r.type} icon={t.icon} tone="neutral" title={r.label} meta={r.hint}
                    trailing={<span className="tone-accent t-label">Add</span>} onClick={() => setForm({ type: r.type })} />
                })}
              </Card>
            </Section>
          )}

          <Banner variant="hint" icon="lock">
            Document numbers are encrypted. Only the last 4 digits show until you tap Reveal, and they hide again after 30 seconds.
          </Banner>
        </>
      )}

      {detail && (
        <DocDetailSheet doc={detail} onClose={() => setDetail(null)}
          onEdit={() => { setForm(detail); setDetail(null) }}
          onDelete={() => { setConfirm(detail); setDetail(null) }} />
      )}
      {form && (
        <DocForm doc={form} userId={user?.id} onClose={() => setForm(null)}
          onSaved={(saved) => { upsertLocal(saved, !!form.id); setForm(null) }} />
      )}
      {confirm && (
        <ConfirmDialog message={`Delete ${confirm.title}?`} detail="It's removed from your wallet on every device."
          confirmLabel="Delete" onCancel={() => setConfirm(null)}
          onConfirm={async () => { await remove(confirm.id); setConfirm(null) }} />
      )}
    </Screen>
  )
}

export { DetailRow }
