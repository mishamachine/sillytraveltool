import { useEffect, useState } from 'react'
import Icon from '../../ui/icons/Icon'
import { api } from '../api'
import { Modal, Field, Loading, useLoad, Badge } from '../ui'

// Compose and send a member email: pick a template, edit it for this send, see who it reaches and who is skipped
// (and why), preview the real email, then send. The admin-email function enforces consent; this only explains it.
// to: { userIds?: string[], formerAll?: boolean, label: string }

export default function EmailComposer({ to, template: initial, message: initialMessage = '', role, onClose, onSent }) {
  const templates = useLoad(() => api.emailTemplates(), [])
  const [key, setKey] = useState(initial || '')
  const [draft, setDraft] = useState(null)
  const [message, setMessage] = useState(initialMessage)
  const [campaign, setCampaign] = useState('')
  const [override, setOverride] = useState(false)
  const [check, setCheck] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const list = templates.data || []
  const tpl = list.find(t => t.key === key)
  useEffect(() => { if (!key && list.length) setKey(to.formerAll ? 'relaunch' : list.find(t => t.kind === 'marketing')?.key || list[0].key) }, [list.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tpl) setDraft({ subject: tpl.subject, body: tpl.body, cta_label: tpl.cta_label || '', cta_url: tpl.cta_url || '' }) }, [tpl?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const edited = tpl && draft && (draft.subject !== tpl.subject || draft.body !== tpl.body || draft.cta_label !== (tpl.cta_label || '') || draft.cta_url !== (tpl.cta_url || ''))
  const payload = () => ({
    template_key: key, ...(edited ? { template: draft } : {}), message,
    ...(to.userIds ? { user_ids: to.userIds } : {}), ...(to.formerAll ? { former_all: true } : {}),
    consent_override: override, campaign: campaign || null,
  })

  // Who it reaches, and the preview, whenever the inputs settle
  useEffect(() => {
    if (!key || !draft) return
    const id = setTimeout(() => {
      api.emailCheck(payload()).then(setCheck, e => setError(e.message))
      api.emailPreview({ ...payload(), user_ids: to.userIds?.slice(0, 1) }).then(setPreview, () => setPreview(null))
    }, 400)
    return () => clearTimeout(id)
  }, [key, draft, message, override]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setBusy(true); setError(null)
    try { const r = await api.emailSend(payload()); setResult(r); onSent?.(r) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const marketing = tpl?.kind === 'marketing'
  const ownerOnly = marketing && role !== 'owner'
  const n = check?.eligible ?? 0

  return (
    <Modal wide title={`Email ${to.label}`} onClose={onClose}
      footer={result ? <button className="a-btn a-btn--primary" onClick={onClose}>Done</button> : <>
        <button className="a-btn a-btn--ghost" onClick={onClose}>Cancel</button>
        <button className="a-btn a-btn--primary" onClick={send} disabled={busy || !n || ownerOnly}>
          <Icon name="mail" size={16} /> {busy ? 'Sending…' : `Send to ${n}`}</button>
      </>}>
      {result ? (
        <p>Sent {result.sent}{result.failed ? `, ${result.failed} failed` : ''}{result.skipped ? `, ${result.skipped} skipped` : ''}. Every attempt is in the send log.</p>
      ) : !templates.data ? <Loading /> : (
        <div className="a-compose">
          <div className="a-form">
            <Field label="Template">
              <select value={key} onChange={e => setKey(e.target.value)}>
                {list.map(t => <option key={t.key} value={t.key}>{t.name} ({t.kind === 'marketing' ? 'marketing' : 'account notice'})</option>)}
              </select>
            </Field>
            {tpl && <p className="a-hint">{marketing
              ? 'Marketing: only people who turned on Travel tips by email get it, with an unsubscribe link. Owner only.'
              : 'Account notice: goes to members whether or not they opted in. Use it for account matters only.'}</p>}
            {draft && <>
              <Field label="Subject"><input value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} maxLength={200} /></Field>
              <Field label="Message" hint="Blank line = new paragraph. **bold**, [link](https://…). Fill-ins: {{first_name}} {{last_trip_city}} {{last_trip_days}} {{next_trip_city}} {{trips_count}}">
                <textarea rows={9} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} maxLength={8000} />
              </Field>
              {draft.body.includes('{{message}}') && (
                <Field label="Your note (fills {{message}})"><textarea rows={4} value={message} onChange={e => setMessage(e.target.value)} maxLength={4000} /></Field>
              )}
              <div className="a-form--2">
                <Field label="Button text"><input value={draft.cta_label} onChange={e => setDraft({ ...draft, cta_label: e.target.value })} /></Field>
                <Field label="Button link"><input value={draft.cta_url} onChange={e => setDraft({ ...draft, cta_url: e.target.value })} placeholder="{{app_url}}" /></Field>
              </div>
              {edited && <p className="a-hint">Edited for this send only. Save changes to the template in Members → Emails.</p>}
              <Field label="Campaign tag (optional)" hint="Groups this send in reports: relaunch_oct, recap"><input value={campaign} onChange={e => setCampaign(e.target.value)} maxLength={64} /></Field>
              {to.formerAll && marketing && (
                <label className="a-check a-check--wrap"><input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />
                  I may write to these former members (for example a one-off relaunch note to people in the US). Not for the EU, UK or
                  Canada without their consent. Anyone who unsubscribed is always left out.</label>
              )}
            </>}
          </div>
          <div className="a-compose__side">
            <h3>Reaches</h3>
            {!check ? <Loading /> : (
              <>
                <p className="a-compose__n"><strong>{check.eligible}</strong> of {check.eligible + check.skipped.length}</p>
                {!!check.skipped.length && (
                  <details className="a-done" open={check.eligible === 0}>
                    <summary>{check.skipped.length} skipped</summary>
                    <ul>{check.skipped.map(s => <li key={s.email}>{s.email}: <span className="a-muted">{s.reason}</span></li>)}</ul>
                  </details>
                )}
              </>
            )}
            <h3>Preview {preview && <Badge tone={preview.kind === 'marketing' ? 'accent' : 'info'}>{preview.kind === 'marketing' ? 'marketing' : 'notice'}</Badge>}</h3>
            {preview ? (
              <div className="a-email-preview">
                <p className="a-email-preview__subject">{preview.subject}</p>
                {/* Rendered by the server: body text is escaped there, links are http(s) only */}
                <div dangerouslySetInnerHTML={{ __html: preview.html }} />
              </div>
            ) : <Loading label="Rendering…" />}
          </div>
          {ownerOnly && <p className="a-field__error">Only the owner can send marketing emails.</p>}
          {error && <p className="a-field__error">{error}</p>}
        </div>
      )}
    </Modal>
  )
}
