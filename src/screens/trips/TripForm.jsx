import { useState, useEffect, useRef } from 'react'
import { useTripsStore, useUIStore, useCollabStore } from '../../store'
import CityAutocomplete from '../../components/shared/CityAutocomplete'
import ConfirmDialog from '../../components/shared/ConfirmDialog'

export default function TripForm() {
  const { editingItem, closeTripForm } = useUIStore()
  const { createTrip, updateTrip, deleteTrip } = useTripsStore()
  const { inviteCollaborator } = useCollabStore()

  const isEdit = !!editingItem
  const [step, setStep] = useState('form') // 'form' | 'invite'
  const [tripType, setTripType] = useState('solo') // 'solo' | 'group'
  const [newTripId, setNewTripId] = useState(null)
  const [inviteEmails, setInviteEmails] = useState([''])
  const [inviteRole, setInviteRole] = useState('collaborator')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteResults, setInviteResults] = useState([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [form, setForm] = useState({
    title: editingItem?.title || '',
    destination_city: editingItem?.destination_city || '',
    destination_country: editingItem?.destination_country || '',
    destination_country_code: editingItem?.destination_country_code || '',
    start_date: editingItem?.start_date || '',
    end_date: editingItem?.end_date || '',
    notes: editingItem?.notes || '',
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
      title: f.title || result.city,
    }))
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      if (isEdit) {
        await updateTrip(editingItem.id, form)
        closeTripForm()
      } else {
        const trip = await createTrip(form)
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

  const isValid = form.title && form.destination_city && form.destination_country && form.start_date && form.end_date

  // ── INVITE STEP ─────────────────────────────────────────────
  if (step === 'invite') {
    const allDone = inviteResults.length > 0
    return (
      <>
        <div className="sheet-overlay" onClick={closeTripForm} />
        <div className="sheet">
          <div className="sheet-handle" />
          <div className="sheet-header">
            <h2 className="sheet-title">Invite People 👥</h2>
            <button onClick={closeTripForm} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--text-sec)', padding: '4px' }}>✕</button>
          </div>
          <div style={{ padding: '0 16px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {allDone ? (
              <div style={{ textAlign: 'center', padding: '28px 0' }}>
                <div style={{ fontSize: 48 }}>🎉</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, marginTop: 12 }}>
                  {inviteResults.filter(r => r.success).length} invite{inviteResults.filter(r => r.success).length !== 1 ? 's' : ''} sent!
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-tert)', marginTop: 6 }}>They'll get an email from The Goose.</p>
              </div>
            ) : (
              <>
                <div style={{ background: 'var(--primary-light)', border: '1.5px solid var(--primary)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--primary)', marginBottom: 4 }}>✈️ {form.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-sec)' }}>Who else is coming?</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {inviteEmails.map((email, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="form-input"
                        type="email"
                        placeholder="friend@example.com"
                        value={email}
                        onChange={e => {
                          const arr = [...inviteEmails]
                          arr[i] = e.target.value
                          setInviteEmails(arr)
                        }}
                        style={{ flex: 1 }}
                      />
                      {inviteEmails.length > 1 && (
                        <button onClick={() => setInviteEmails(inviteEmails.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 8, padding: '0 10px', cursor: 'pointer', color: 'var(--text-tert)', fontSize: 16 }}>
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {inviteEmails.length < 6 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setInviteEmails([...inviteEmails, ''])} style={{ alignSelf: 'flex-start', fontSize: 12 }}>
                      + Add another
                    </button>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-tert)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Permission</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['collaborator', '✏️ Can edit'], ['viewer', '👁 View only']].map(([val, lbl]) => (
                      <button key={val} onClick={() => setInviteRole(val)} style={{
                        flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid',
                        borderColor: inviteRole === val ? 'var(--primary)' : 'var(--border)',
                        background: inviteRole === val ? 'var(--primary-light)' : 'var(--surface)',
                        fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13,
                        color: inviteRole === val ? 'var(--primary)' : 'var(--text-sec)', cursor: 'pointer',
                      }}>{lbl}</button>
                    ))}
                  </div>
                </div>

                <button className="btn btn-primary btn-full" onClick={handleSendInvites} disabled={inviteSending || !inviteEmails.some(e => e.trim() && e.includes('@'))}>
                  {inviteSending ? 'Sending invites...' : 'Send Invites 🪿'}
                </button>
                <button className="btn btn-ghost btn-full" onClick={closeTripForm} style={{ fontSize: 13 }}>
                  Skip for now
                </button>
              </>
            )}
          </div>
        </div>
      </>
    )
  }

  // ── MAIN FORM ────────────────────────────────────────────────
  return (
    <>
      <div className="sheet-overlay" onClick={closeTripForm} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h2 className="sheet-title">{isEdit ? 'Edit Trip' : 'New Trip'}</h2>
          <button onClick={closeTripForm} style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--text-sec)', padding: '4px' }}>✕</button>
        </div>

        <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: '0' }}>
          {error && (
            <div style={{ background: '#FFF0EE', border: '1.5px solid var(--error)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: '16px', fontSize: '14px', color: 'var(--error)' }}>
              {error}
            </div>
          )}

          {/* Destination autocomplete */}
          <div className="form-group">
            <label className="form-label">Destination</label>
            <CityAutocomplete
              value={form.destination_city}
              onChange={(val) => update('destination_city', val)}
              onSelect={handleCitySelect}
            />
            {form.destination_country && (
              <div style={{ fontSize: '12px', color: 'var(--text-tert)', marginTop: '4px', paddingLeft: '2px' }}>
                📍 {form.destination_country}
              </div>
            )}
          </div>

          {/* Trip name */}
          <div className="form-group">
            <label className="form-label">Trip Name</label>
            <input className="form-input" placeholder="e.g. Tokyo Spring" value={form.title} onChange={e => update('title', e.target.value)} />
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label className="form-label">Depart</label>
              <input type="date" className="form-input" value={form.start_date} onChange={e => update('start_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Return</label>
              <input type="date" className="form-input" value={form.end_date} min={form.start_date} onChange={e => update('end_date', e.target.value)} />
            </div>
          </div>

          {/* Solo vs Group — only on new trip */}
          {!isEdit && (
            <div className="form-group">
              <label className="form-label">Trip Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  ['solo', '🧳', 'Just me', 'Plan and track solo'],
                  ['group', '👥', 'Group trip', 'Invite & collaborate'],
                ].map(([val, icon, title, sub]) => (
                  <button key={val} onClick={() => setTripType(val)} style={{
                    padding: '12px 10px', borderRadius: 12, border: '2px solid',
                    borderColor: tripType === val ? 'var(--primary)' : 'var(--border)',
                    background: tripType === val ? 'var(--primary-light)' : 'var(--surface)',
                    textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: tripType === val ? 'var(--primary)' : 'var(--text)' }}>{title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tert)', marginTop: 2 }}>{sub}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <textarea className="form-input" placeholder="Anything to remember..." value={form.notes} onChange={e => update('notes', e.target.value)} rows={3} style={{ resize: 'none' }} />
          </div>

          <button className="btn btn-primary btn-full" onClick={handleSubmit} disabled={loading || !isValid} style={{ marginTop: '8px' }}>
            {loading ? 'Saving...' : isEdit ? 'Save Changes' : tripType === 'group' ? 'Create & Invite People →' : 'Add Trip'}
          </button>

          {isEdit && (
            <button className="btn btn-danger btn-full" style={{ marginTop: '10px' }} onClick={() => setShowDeleteConfirm(true)}>
              Delete Trip
            </button>
          )}
        </div>
      </div>
      {showDeleteConfirm && (
        <ConfirmDialog
          message={`Delete "${form.title || 'this trip'}"? This cannot be undone.`}
          confirmLabel="Delete Trip"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  )
}
