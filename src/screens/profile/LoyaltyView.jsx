import { useState } from 'react'
import { useAuthStore } from '../../store'
import { supabase } from '../../lib/supabase'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import { Screen, ScreenHeader, Card, ListRow, Button, Banner, Sheet, Field, Stack, Skeleton, EmptyState, Toast } from '../../ui'
import { DetailRow } from './DocumentsView'

// Program name → icon + tone
function programIcon(programName) {
  const p = (programName || '').toLowerCase()
  if (/hotel|marriott|hilton|hyatt|ihg|accor|radisson/.test(p)) return { icon: 'stay', tone: 'stay' }
  if (/car|hertz|avis|enterprise|sixt/.test(p)) return { icon: 'car', tone: 'neutral' }
  if (/rail|train|eurostar|amtrak/.test(p)) return { icon: 'train', tone: 'accent' }
  return { icon: 'plane', tone: 'info' }
}

function LoyaltyForm({ card, userId, onClose, onSaved }) {
  const [form, setForm] = useState({
    program_name: card?.program_name || '',
    card_number: card?.card_number || '',
    member_name: card?.member_name || '',
    tier: card?.tier || '',
    points_balance: card?.points_balance != null ? String(card.points_balance) : '',
    notes: card?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async (e) => {
    e?.preventDefault()
    if (!form.program_name.trim()) { setError('Program name is required'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        user_id: userId,
        program_name: form.program_name.trim(),
        card_number: form.card_number.trim() || null,
        member_name: form.member_name.trim() || null,
        tier: form.tier.trim() || null,
        points_balance: form.points_balance ? parseInt(form.points_balance, 10) : null,
        notes: form.notes.trim() || null,
      }
      let data, err
      if (card?.id) {
        ({ data, error: err } = await supabase.from('loyalty_cards').update(payload).eq('id', card.id).select().single())
      } else {
        ({ data, error: err } = await supabase.from('loyalty_cards').insert(payload).select().single())
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
    <Sheet title={card?.id ? 'Edit card' : 'Add a loyalty card'} onClose={onClose}>
      <form className="profile-form" onSubmit={handleSave}>
        <Field label="Program name" value={form.program_name} onChange={e => setF('program_name', e.target.value)} placeholder="British Airways Executive Club" />
        <Field label="Membership number" value={form.card_number} onChange={e => setF('card_number', e.target.value)} placeholder="BA123456789" autoComplete="off" inputClassName="tabular" />
        <Field label="Notes" value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="Expires Dec 2027" />
        {error && <Banner tone="danger" icon="alert-circle" role="alert">{error}</Banner>}
        <Button type="submit" variant="primary" size="lg" block loading={saving}>
          {saving ? 'Saving' : card?.id ? 'Save changes' : 'Add card'}
        </Button>
      </form>
    </Sheet>
  )
}

function CardDetailSheet({ card, onClose, onEdit, onDelete }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(card.card_number); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }
  return (
    <Sheet title={card.program_name} subtitle={card.tier ? `${card.tier} member` : undefined} onClose={onClose}>
      <Card variant="group">
        {card.card_number && <DetailRow label="Member number" value={card.card_number} />}
        {card.member_name && <DetailRow label="Name on card" value={card.member_name} />}
        {card.points_balance != null && <DetailRow label="Points" value={card.points_balance.toLocaleString()} />}
        {card.notes && <DetailRow label="Notes" value={card.notes} />}
      </Card>
      {card.card_number && <Button icon={copied ? 'check' : 'copy'} onClick={copy}>{copied ? 'Copied' : 'Copy member number'}</Button>}
      <Stack row gap={2}>
        <Button className="grow" variant="ghost" icon="trash" onClick={onDelete}>Delete</Button>
        <Button className="grow" variant="primary" icon="edit" onClick={onEdit}>Edit</Button>
      </Stack>
    </Sheet>
  )
}

export default function LoyaltyView({ wallet, onBack }) {
  const user = useAuthStore(s => s.user)
  const { rows: cards, loading, remove, upsertLocal } = wallet
  const [form, setForm] = useState(null)
  const [detail, setDetail] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [savedToast, setSavedToast] = useState(false)

  return (
    <Screen gap={4} labelledBy="loyalty-title">
      <ScreenHeader onBack={onBack} backLabel="Back to profile" title="Loyalty cards" titleId="loyalty-title" />

      {loading ? (
        <Stack gap={3} aria-busy="true" aria-label="Loading cards">{[1, 2].map(i => <Card key={i}><Skeleton lines={2} /></Card>)}</Stack>
      ) : cards.length === 0 ? (
        <EmptyState goose="happy" title="Loyalty cards">
          Frequent flyer numbers and hotel programs, all your points in one place.
        </EmptyState>
      ) : (
        <Card variant="group">
          {cards.map(card => {
            const { icon, tone } = programIcon(card.program_name)
            const meta = [card.card_number, card.tier].filter(Boolean).join(' · ')
            return <ListRow key={card.id} icon={icon} tone={tone} title={card.program_name} meta={meta || undefined}
              trailing={card.points_balance != null ? `${card.points_balance.toLocaleString()} pts` : undefined}
              chevron onClick={() => setDetail(card)} />
          })}
        </Card>
      )}

      <Button variant="primary" size="lg" block icon="plus" onClick={() => setForm({})}>Add a loyalty card</Button>

      {detail && (
        <CardDetailSheet card={detail} onClose={() => setDetail(null)}
          onEdit={() => { setForm(detail); setDetail(null) }}
          onDelete={() => { setConfirm(detail); setDetail(null) }} />
      )}
      {form && (
        <LoyaltyForm card={form} userId={user?.id} onClose={() => setForm(null)}
          onSaved={(saved) => {
            upsertLocal(saved, !!form.id)
            setForm(null)
            setSavedToast(true)
            setTimeout(() => setSavedToast(false), 2500)
          }} />
      )}
      {confirm && (
        <ConfirmDialog message={`Delete ${confirm.program_name}?`} confirmLabel="Delete" onCancel={() => setConfirm(null)}
          onConfirm={async () => { await remove(confirm.id); setConfirm(null) }} />
      )}
      {savedToast && <Toast title="Card saved" />}
    </Screen>
  )
}
