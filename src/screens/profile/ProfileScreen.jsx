import { useState, useEffect } from 'react'
import { useAuthStore, useUIStore } from '../../store'
import { supabase } from '../../lib/supabase'
import ShareNudge from '../../components/shared/ShareNudge'
import Goose from '../../components/goose/Goose'
import { BADGES, BADGE_TIER_COLORS } from '../../lib/tokens'

const PROFILE_TABS = [
  { id: 'docs', label: 'Docs', emoji: '📄' },
  { id: 'loyalty', label: 'Loyalty', emoji: '🥇' },
  { id: 'stats', label: 'Stats', emoji: '📊' },
  { id: 'settings', label: 'Settings', emoji: '⚙️' },
]

const DOC_TYPES = [
  { value: 'passport', label: 'Passport', icon: '🛂' },
  { value: 'visa', label: 'Visa', icon: '📋' },
  { value: 'insurance', label: 'Travel Insurance', icon: '🛡️' },
  { value: 'id', label: 'National ID', icon: '🪪' },
  { value: 'vaccine', label: 'Vaccine Record', icon: '💉' },
  { value: 'other', label: 'Other', icon: '📁' },
]

const DOC_ICONS = { passport: '🛂', visa: '📋', insurance: '🛡️', id: '🪪', vaccine: '💉', other: '📁' }

// ============================================================
// DOCS TAB — Phase 5
// ============================================================
function DocsTab({ user }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editDoc, setEditDoc] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const fetchDocs = async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    const timer = setTimeout(() => setLoading(false), 10000) // safety timeout
    try {
      const { data, error } = await supabase
        .from('wallet_documents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (!error) setDocs(data || [])
    } catch (e) {
      console.error('fetchDocs error', e)
    } finally {
      clearTimeout(timer)
      setLoading(false)
    }
  }

  useEffect(() => { fetchDocs() }, [user?.id])

  const handleDelete = async (id) => {
    try {
      await supabase.from('wallet_documents').delete().eq('id', id)
      setDocs(prev => prev.filter(d => d.id !== id))
    } catch (e) {
      console.error('delete doc error', e)
    }
  }

  const daysUntilExpiry = (expiry) => {
    if (!expiry) return null
    return Math.ceil((new Date(expiry + 'T00:00:00') - new Date()) / (1000 * 60 * 60 * 24))
  }

  const expiryColor = (days) => {
    if (days === null) return null
    if (days < 0) return '#D93025'
    if (days < 90) return '#D4910A'
    return '#2D8B55'
  }

  const expiryLabel = (days) => {
    if (days === null) return null
    if (days < 0) return `Expired ${Math.abs(days)}d ago`
    if (days === 0) return 'Expires today!'
    if (days < 30) return `Expires in ${days}d`
    if (days < 90) return `Expires in ${Math.round(days / 30)}mo`
    return null
  }

  if (loading) return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />)}
    </div>
  )

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <button className="btn btn-primary btn-full" onClick={() => { setEditDoc(null); setShowForm(true) }}>
        + Add Document
      </button>

      {/* Recommended placeholder cards — shown when user hasn't added a doc of that type yet */}
      {!showForm && (() => {
        const addedTypes = new Set(docs.map(d => d.type))
        const RECOMMENDED = [
          { type: 'passport', icon: '🛂', label: 'Passport', hint: 'Track expiry — many countries need 6 months validity' },
          { type: 'id', icon: '🪪', label: "National ID / Driver's License", hint: 'Useful as backup and for local car hire' },
          { type: 'insurance', icon: '🛡️', label: 'Travel Insurance', hint: 'Policy number and emergency contact' },
          { type: 'vaccine', icon: '💉', label: 'Vaccine Record', hint: 'Some destinations require proof of vaccination' },
        ]
        const recommended_cards = RECOMMENDED.filter(r => !addedTypes.has(r.type))
        if (!recommended_cards.length) return null
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-tert)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 2 }}>
              Recommended to add
            </div>
            {recommended_cards.map(rec => (
              <button key={rec.type} onClick={() => { setEditDoc({ type: rec.type }); setShowForm(true) }} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--surface)', border: '1.5px dashed var(--border)',
                borderRadius: 12, padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                opacity: 0.72, transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.72'}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                  {rec.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text-sec)' }}>{rec.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 2, lineHeight: 1.4 }}>{rec.hint}</div>
                </div>
                <div style={{ fontSize: 18, color: 'var(--text-tert)' }}>+</div>
              </button>
            ))}
          </div>
        )
      })()}

      {docs.map(doc => {
        const days = daysUntilExpiry(doc.expiry_date)
        const color = expiryColor(days)
        const label = expiryLabel(days)
        const isExpanded = expandedId === doc.id
        return (
          <div key={doc.id} style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--border)',
            borderLeft: `3px solid ${color || 'var(--border)'}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            <button
              onClick={() => setExpandedId(isExpanded ? null : doc.id)}
              style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center' }}
            >
              <span style={{ fontSize: 24 }}>{DOC_ICONS[doc.type] || '📁'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 1 }}>
                  {DOC_TYPES.find(t => t.value === doc.type)?.label}
                  {doc.issuing_country ? ` · ${doc.issuing_country}` : ''}
                  {label ? ` · ` : ''}
                  {label && <span style={{ color, fontWeight: 600 }}>{label}</span>}
                </div>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-tert)' }}>{isExpanded ? '▲' : '▼'}</span>
            </button>
            {isExpanded && (
              <div style={{ padding: '10px 14px 12px', borderTop: '1px solid var(--border-light)' }}>
                {doc.document_number && <DocDetail label="Number" value={doc.document_number} />}
                {doc.issuing_country && <DocDetail label="Issued by" value={doc.issuing_country} />}
                {doc.issue_date && <DocDetail label="Issue date" value={doc.issue_date} />}
                {doc.expiry_date && <DocDetail label="Expiry" value={doc.expiry_date} valueColor={color} />}
                {doc.notes && <DocDetail label="Notes" value={doc.notes} />}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => { setEditDoc(doc); setShowForm(true) }} style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>
                  <span style={{ color: 'var(--border)' }}>·</span>
                  <button onClick={() => handleDelete(doc.id)} style={{ fontSize: 12, color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {showForm && (
        <DocForm
          doc={editDoc}
          userId={user?.id}
          onClose={() => setShowForm(false)}
          onSaved={(saved) => {
            if (editDoc) setDocs(prev => prev.map(d => d.id === saved.id ? saved : d))
            else setDocs(prev => [saved, ...prev])
            setShowForm(false)
          }}
        />
      )}
    </div>
  )
}

function DocDetail({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-tert)', fontFamily: 'var(--font-heading)', fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: valueColor || 'var(--text-sec)', textAlign: 'right' }}>{value}</span>
    </div>
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

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Title is required'); return }
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
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg)', borderRadius: '20px 20px 0 0', padding: '20px 16px',
        width: '100%', maxWidth: 428, maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 700, margin: 0 }}>
            {doc ? 'Edit Document' : 'Add Document'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-tert)' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Document Type</label>
            <select className="form-input" value={form.type} onChange={e => set('type', e.target.value)}>
              {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Title *</label>
            <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. UK Passport" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Document Number</label>
            <input className="form-input" value={form.document_number} onChange={e => set('document_number', e.target.value)} placeholder="123456789" style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Issuing Country</label>
            <input className="form-input" value={form.issuing_country} onChange={e => set('issuing_country', e.target.value)} placeholder="United Kingdom" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Issue Date</label>
              <input className="form-input" type="date" value={form.issue_date} onChange={e => set('issue_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Expiry Date</label>
              <input className="form-input" type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Notes</label>
            <input className="form-input" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes..." />
          </div>
          {error && <div style={{ fontSize: 13, color: 'var(--error)', background: '#FFF0EE', border: '1.5px solid var(--error)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>}
          <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : doc ? 'Save Changes' : 'Add Document'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// LOYALTY TAB — Phase 5
// ============================================================

function LoyaltyTab({ user }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editCard, setEditCard] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [savedToast, setSavedToast] = useState(false)

  const fetchCards = async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    const timer = setTimeout(() => setLoading(false), 10000)
    try {
      const { data, error } = await supabase
        .from('loyalty_cards')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (!error) setCards(data || [])
    } catch (e) {
      console.error('fetchCards error', e)
    } finally {
      clearTimeout(timer)
      setLoading(false)
    }
  }

  useEffect(() => { fetchCards() }, [user?.id])

  const handleDelete = async (id) => {
    try {
      await supabase.from('loyalty_cards').delete().eq('id', id)
      setCards(prev => prev.filter(c => c.id !== id))
    } catch (e) {
      console.error('delete card error', e)
    }
  }

  const tierColor = (tier) => {
    const t = (tier || '').toLowerCase()
    if (t.includes('platin') || t.includes('diamond') || t.includes('elite')) return '#7B61C4'
    if (t.includes('gold') || t.includes('premier')) return '#D4910A'
    if (t.includes('silver')) return '#A09688'
    return 'var(--primary)'
  }

  const typeIcon = (programName) => {
    if (!programName) return '✈️'
    const p = programName.toLowerCase()
    if (p.includes('hotel') || p.includes('marriott') || p.includes('hilton') || p.includes('hyatt') || p.includes('ihg') || p.includes('accor') || p.includes('radisson')) return '🏨'
    if (p.includes('car') || p.includes('hertz') || p.includes('avis') || p.includes('enterprise') || p.includes('sixt')) return '🚗'
    if (p.includes('rail') || p.includes('train') || p.includes('eurostar') || p.includes('amtrak')) return '🚂'
    return '✈️'
  }

  if (loading) return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />)}
    </div>
  )

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {savedToast && (
        <div style={{ background: '#EDF7F1', border: '1.5px solid #2D8B55', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 14, color: '#2D8B55', fontFamily: 'var(--font-heading)', fontWeight: 600 }}>
          ✓ Card saved!
        </div>
      )}
      <button className="btn btn-primary btn-full" onClick={() => { setEditCard(null); setShowForm(true) }}>
        + Add Loyalty Card
      </button>

      {cards.length === 0 && !showForm && (
        <div className="empty-state" style={{ marginTop: 20 }}>
          <Goose variant="fancy" size={100} animated />
          <div className="empty-state-title" style={{ fontSize: 20, marginTop: 12 }}>Loyalty cards</div>
          <p className="empty-state-text">
            Frequent flyer numbers, hotel programs, all your points in one place.
          </p>
        </div>
      )}

      {cards.map(card => {
        const isExpanded = expandedId === card.id
        const tc = tierColor(card.tier)
        return (
          <div key={card.id} style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--border)',
            borderLeft: `3px solid ${tc}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            <button
              onClick={() => setExpandedId(isExpanded ? null : card.id)}
              style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center' }}
            >
              <span style={{ fontSize: 24 }}>{typeIcon(card.program_name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {card.program_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tert)', marginTop: 1 }}>
                  {card.card_number ? <span style={{ fontFamily: 'var(--font-mono)' }}>{card.card_number}</span> : ''}
                </div>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-tert)' }}>{isExpanded ? '▲' : '▼'}</span>
            </button>
            {isExpanded && (
              <div style={{ padding: '10px 14px 12px', borderTop: '1px solid var(--border-light)' }}>
                {card.card_number && <DocDetail label="Member #" value={card.card_number} />}
                {card.member_name && <DocDetail label="Name on card" value={card.member_name} />}
                {card.notes && <DocDetail label="Notes" value={card.notes} />}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => { setEditCard(card); setShowForm(true) }} style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>
                  <span style={{ color: 'var(--border)' }}>·</span>
                  <button onClick={() => handleDelete(card.id)} style={{ fontSize: 12, color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Delete</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {showForm && (
        <LoyaltyForm
          card={editCard}
          userId={user?.id}
          onClose={() => setShowForm(false)}
          onSaved={(saved) => {
            if (editCard) setCards(prev => prev.map(c => c.id === saved.id ? saved : c))
            else setCards(prev => [saved, ...prev])
            setShowForm(false)
            setSavedToast(true)
            setTimeout(() => setSavedToast(false), 2500)
          }}
        />
      )}
    </div>
  )
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

  const handleSave = async () => {
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
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg)', borderRadius: '20px 20px 0 0', padding: '20px 16px',
        width: '100%', maxWidth: 428, maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 700, margin: 0 }}>
            {card ? 'Edit Card' : 'Add Loyalty Card'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-tert)' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Program Name *</label>
            <input className="form-input" value={form.program_name} onChange={e => setF('program_name', e.target.value)} placeholder="e.g. British Airways Executive Club" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Membership Number</label>
            <input className="form-input" value={form.card_number} onChange={e => setF('card_number', e.target.value)} placeholder="BA123456789" style={{ fontFamily: 'var(--font-mono)' }} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Notes</label>
            <input className="form-input" value={form.notes} onChange={e => setF('notes', e.target.value)} placeholder="e.g. Expires Dec 2025" />
          </div>
          {error && <div style={{ fontSize: 13, color: 'var(--error)', background: '#FFF0EE', border: '1.5px solid var(--error)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>}
          <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : card ? 'Save Changes' : 'Add Card'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// STATS TAB — Phase 9
// ============================================================
function StatsTab({ stats, badges }) {
  const statItems = [
    { label: 'Trips Completed', value: stats?.trips_completed || 0, emoji: '✈️' },
    { label: 'Countries Visited', value: stats?.countries_visited || 0, emoji: '🌍' },
    { label: 'Days Abroad', value: stats?.days_abroad || 0, emoji: '📅' },
    { label: 'Total Flights', value: stats?.total_flights || 0, emoji: '🛫' },
    { label: 'Restaurants', value: stats?.restaurants_added || 0, emoji: '🍜' },
    { label: 'HONKs Used', value: stats?.honks_used || 0, emoji: '🪿' },
  ]

  const earnedBadgeIds = (badges || []).map(b => b.badge_id)

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Goose Score — hero treatment */}
      <div style={{
        background: 'var(--primary)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{ position: 'absolute', right: -20, top: -20, opacity: 0.08, pointerEvents: 'none' }}>
          <Goose variant="trophy" size={140} />
        </div>
        <Goose variant="trophy" size={88} />
        <div>
          <div style={{ color: 'rgba(255,255,255,.75)', fontSize: '11px', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Goose Score</div>
          <div style={{ color: '#fff', fontSize: '52px', fontFamily: 'var(--font-mono)', fontWeight: 700, lineHeight: 1 }}>
            {stats?.goose_score || 0}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '13px', marginTop: 4, fontFamily: 'var(--font-heading)', fontWeight: 600 }}>
            {earnedBadgeIds.length} badge{earnedBadgeIds.length !== 1 ? 's' : ''} earned
          </div>
        </div>
      </div>

      {/* Stats grid — bold and celebratory */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {statItems.map(item => (
          <div key={item.label} style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1.5px solid var(--border)',
            padding: '16px 14px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '28px', marginBottom: '6px' }}>{item.emoji}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
              {item.value}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-tert)', fontFamily: 'var(--font-heading)', fontWeight: 700, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>

      {/* Badges */}
      <div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '12px', fontWeight: 700, color: 'var(--text-tert)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
          Badges — {earnedBadgeIds.length} / {Object.keys(BADGES).length} earned
        </div>

        {/* Earned badges — prominent cards */}
        {earnedBadgeIds.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {Object.entries(BADGES).filter(([id]) => earnedBadgeIds.includes(id)).map(([id, badge]) => (
              <div key={id} style={{
                background: BADGE_TIER_COLORS[badge.tier] + '12',
                border: `1.5px solid ${BADGE_TIER_COLORS[badge.tier]}40`,
                borderRadius: 'var(--radius-lg)',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                boxShadow: `0 0 16px ${BADGE_TIER_COLORS[badge.tier]}20`,
              }}>
                <div style={{
                  fontSize: 36,
                  width: 56, height: 56,
                  borderRadius: 'var(--radius-md)',
                  background: BADGE_TIER_COLORS[badge.tier] + '18',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {badge.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: BADGE_TIER_COLORS[badge.tier] }}>
                    {badge.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 2, lineHeight: 1.4 }}>
                    {badge.description}
                  </div>
                  <div style={{ fontSize: 10, color: BADGE_TIER_COLORS[badge.tier], fontFamily: 'var(--font-heading)', fontWeight: 700, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8 }}>
                    {badge.tier}
                  </div>
                </div>
                <span style={{ fontSize: 18, color: BADGE_TIER_COLORS[badge.tier] }}>✓</span>
              </div>
            ))}
          </div>
        )}

        {/* Unearned badges — compact with progress bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(BADGES).filter(([id]) => !earnedBadgeIds.includes(id)).map(([id, badge]) => {
            const currentVal = badge.stat ? (stats?.[badge.stat] || 0) : null
            const progress = (badge.target && currentVal !== null) ? Math.min(1, currentVal / badge.target) : null
            return (
              <div key={id} style={{
                background: 'var(--surface)',
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                opacity: 0.6,
              }}>
                <span style={{ fontSize: 22, width: 32, textAlign: 'center', flexShrink: 0 }}>{badge.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'var(--text-sec)' }}>
                      {badge.name}
                    </span>
                    {progress !== null && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tert)' }}>
                        {currentVal}/{badge.target}
                      </span>
                    )}
                  </div>
                  {progress !== null && (
                    <div style={{ height: 3, background: 'var(--border)', borderRadius: 99, marginTop: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress * 100}%`, background: BADGE_TIER_COLORS[badge.tier], borderRadius: 99, transition: 'width 0.4s ease' }} />
                    </div>
                  )}
                  {!progress && (
                    <div style={{ fontSize: 11, color: 'var(--text-tert)', marginTop: 2 }}>{badge.description}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// SETTINGS TAB
// ============================================================
function SettingsTab({ profile, onSignOut }) {
  const { updateProfile } = useAuthStore()
  const { darkMode, toggleDarkMode } = useUIStore()
  const [name, setName] = useState(profile?.display_name || '')
  const [currency, setCurrency] = useState(profile?.home_currency || 'USD')
  const [passportCode, setPassportCode] = useState(profile?.passport_country || '')
  const [tempUnit, setTempUnit] = useState(profile?.temp_unit || 'C')
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    if (profile?.display_name) setName(profile.display_name)
    if (profile?.home_currency) setCurrency(profile.home_currency)
    if (profile?.passport_country) setPassportCode(profile.passport_country)
    if (profile?.temp_unit) setTempUnit(profile.temp_unit)
  }, [profile?.display_name, profile?.home_currency, profile?.passport_country, profile?.temp_unit])

  const handleSave = async () => {
    setSaveError(null)
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
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    if (!bookingEmail) return
    navigator.clipboard.writeText(bookingEmail).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── Your Goose Inbox ── FEATURE HERO ── */}
      <div style={{
        borderRadius: 16, overflow: 'hidden',
        border: '1.5px solid var(--primary)',
        background: 'linear-gradient(135deg, var(--primary-light) 0%, var(--surface) 100%)',
      }}>
        {/* Header */}
        <div style={{
          background: 'var(--primary)', padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 24 }}>📧</span>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: '#fff' }}>
              Your Goose Inbox
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 1 }}>
              Forward any booking confirmation here
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* The address */}
          {bookingEmail ? (
            <div style={{
              background: 'var(--surface)', borderRadius: 10, padding: '10px 14px',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--primary)',
                fontWeight: 700, flex: 1, wordBreak: 'break-all',
              }}>
                {bookingEmail}
              </span>
              <button
                onClick={handleCopy}
                style={{
                  background: copied ? 'var(--success)' : 'var(--primary)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  padding: '6px 12px', fontFamily: 'var(--font-heading)',
                  fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  flexShrink: 0, transition: 'background 0.2s',
                }}
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-tert)', fontStyle: 'italic' }}>
              Generating your address…
            </div>
          )}

          {/* How it works */}
          <div style={{
            background: 'rgba(196,86,30,0.06)', borderRadius: 10, padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
              🪿 How it works
            </div>
            {[
              ['1', 'Save this address as a contact called "The Goose 🪿" in your phone or email app'],
              ['2', 'Forward (or CC) any booking confirmation — flights, hotels, tours — to The Goose'],
              ['3', 'It appears in your trip automatically. No app needed.'],
            ].map(([num, text]) => (
              <div key={num} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  width: 20, height: 20, borderRadius: '50%', background: 'var(--primary)',
                  color: '#fff', fontFamily: 'var(--font-heading)', fontWeight: 700,
                  fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 1,
                }}>{num}</span>
                <span style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.5 }}>{text}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-tert)', lineHeight: 1.5 }}>
            Your address is unique to you — only bookings forwarded to your specific address will appear in your trips.
          </div>
        </div>
      </div>

      {/* Profile section */}
      <div className="card card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '13px', fontWeight: 700, color: 'var(--text-tert)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Profile
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Display Name</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Home Currency</label>
          <input className="form-input" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} maxLength={3} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }} placeholder="USD" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Passport Country (ISO code)</label>
          <input className="form-input" value={passportCode} onChange={e => setPassportCode(e.target.value.toUpperCase())} maxLength={2} style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }} placeholder="US, GB, AU..." />
          <div style={{ fontSize: 11, color: 'var(--text-tert)', marginTop: 4 }}>2-letter country code — used for SOS emergency numbers</div>
        </div>
        {saveError && <div style={{ fontSize: 13, color: 'var(--error)', background: '#FFF0EE', border: '1.5px solid var(--error)', borderRadius: 8, padding: '8px 12px' }}>{saveError}</div>}
        <button className="btn btn-primary" onClick={handleSave}>
          {saved ? '✓ Saved!' : 'Save Changes'}
        </button>
      </div>

      {/* Temperature Unit */}
      <div className="card card-body">
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '13px', fontWeight: 700, color: 'var(--text-tert)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Temperature Unit
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['C', 'F'].map(unit => (
            <button
              key={unit}
              onClick={() => handleTempUnitChange(unit)}
              style={{
                flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid',
                borderColor: tempUnit === unit ? 'var(--primary)' : 'var(--border)',
                background: tempUnit === unit ? 'var(--primary-light)' : 'var(--surface)',
                color: tempUnit === unit ? 'var(--primary)' : 'var(--text-tert)',
                fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15,
                cursor: 'pointer', transition: 'all var(--transition)',
              }}
            >
              °{unit} {unit === 'C' ? 'Celsius' : 'Fahrenheit'}
            </button>
          ))}
        </div>
      </div>

      {/* Appearance */}
      <div className="card card-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '15px' }}>Dark Mode</div>
            <div style={{ fontSize: '13px', color: 'var(--text-tert)' }}>
              {darkMode ? 'Dark theme active' : 'Light theme active'}
            </div>
          </div>
          <button
            onClick={toggleDarkMode}
            style={{
              width: 50, height: 28, borderRadius: 'var(--radius-full)',
              border: 'none', background: darkMode ? 'var(--primary)' : 'var(--border)',
              cursor: 'pointer', position: 'relative', transition: 'background var(--transition)',
            }}
          >
            <div style={{
              position: 'absolute', top: 3, left: darkMode ? 25 : 3,
              width: 22, height: 22, borderRadius: '50%', background: '#fff',
              transition: 'left var(--transition)', boxShadow: '0 1px 4px rgba(0,0,0,.2)',
            }} />
          </button>
        </div>
      </div>

      <button className="btn btn-danger btn-full" onClick={onSignOut} style={{ marginTop: '8px' }}>
        Sign Out
      </button>

      <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-tert)', fontFamily: 'var(--font-mono)', marginTop: '8px' }}>
        STT v{import.meta.env.VITE_APP_VERSION || '0.19.0'} · Made with 🪿
      </div>
    </div>
  )
}

// ============================================================
// PROFILE SCREEN
// ============================================================
export default function ProfileScreen() {
  const { profile, user, signOut, stats, badges, fetchStats } = useAuthStore()
  const { activeProfileTab, setProfileTab } = useUIStore()

  // Refresh on mount so score is always current
  useEffect(() => { if (user) fetchStats() }, [user?.id])

  const TabComponent = {
    docs: () => <DocsTab user={user} />,
    loyalty: () => <LoyaltyTab user={user} />,
    stats: () => <StatsTab stats={stats} badges={badges} />,
    settings: () => <SettingsTab profile={profile} onSignOut={signOut} />,
  }[activeProfileTab]

  return (
    <div className="screen">
      <div className="screen-header" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: 68, height: 68,
            borderRadius: 'var(--radius-full)',
            background: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Goose variant="happy" size={56} />
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '22px', fontWeight: 800, lineHeight: 1.1 }}>
              {profile?.display_name || user?.email?.split('@')[0] || 'Goose'}
            </h1>
            <div style={{ fontSize: '12px', color: 'var(--text-tert)', marginTop: 3 }}>
              {user?.email}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 12px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        <div className="pill-tabs" style={{ margin: 0 }}>
          {PROFILE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setProfileTab(tab.id)}
              className={`pill-tab ${activeProfileTab === tab.id ? 'active' : ''}`}
              style={{ flexDirection: 'column', gap: 2, padding: '6px 4px', fontSize: 11 }}
            >
              <span style={{ fontSize: 15 }}>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {TabComponent?.()}
      <ShareNudge />
    </div>
  )
}
