import { useState } from 'react'
import Icon from '../../ui/icons/Icon'
import { api } from '../api'
import { Card, Stat, Table, Badge, Loading, ErrorNote, useLoad, ExportButton, Modal, Field, Segmented, fmtDate } from '../ui'

// Members → Emails: who can be emailed, the templates (owner edits), and every send with its outcome.
export default function EmailsView({ role, go }) {
  const log = useLoad(() => api.emailLog(), [])
  const templates = useLoad(() => api.emailTemplates(), [])
  const [editing, setEditing] = useState(null)
  const d = log.data
  return (
    <>
      <Card title="Emails" icon="mail" className="a-span-12" subtitle="sent through Resend from goose@bookings.sillytraveltool.com, replies to hello@">
        <ErrorNote error={log.error} onRetry={log.reload} />
        {!d ? <Loading /> : (
          <div className="a-stats">
            <Stat label="Opted in to emails" value={d.opted_in} hint={`of ${d.members} members`} />
            <Stat label="Sent, last 30 days" value={d.sent_30d} />
            {Object.entries(d.by_template).slice(0, 4).map(([k, n]) => <Stat key={k} label={`Sent: ${k.replace(/_/g, ' ')}`} value={n} />)}
          </div>
        )}
        <p className="a-hint">To send: open a member (Email button), filter the member list and use "Email these", or System → Former members.
          Marketing goes only to members who turned on Settings → Travel tips by email.</p>
      </Card>

      <Card title="Templates" icon="file" className="a-span-12"
        actions={role === 'owner' && <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => setEditing({ key: '', name: '', kind: 'marketing', subject: '', body: 'Hi {{first_name}},\n\n', cta_label: '', cta_url: '{{app_url}}', isNew: true })}><Icon name="plus" size={16} /> New template</button>}>
        <ErrorNote error={templates.error} onRetry={templates.reload} />
        {!templates.data ? <Loading /> : (
          <Table rowKey={t => t.key} rows={templates.data} onRow={role === 'owner' ? (t => setEditing(t)) : undefined} cols={[
            { key: 'name', label: 'Template', render: t => <div className="a-who"><strong>{t.name}</strong><span>{t.key}</span></div> },
            { key: 'kind', label: 'Kind', render: t => <Badge tone={t.kind === 'marketing' ? 'accent' : 'info'}>{t.kind === 'marketing' ? 'Marketing' : 'Account notice'}</Badge> },
            { key: 'subject', label: 'Subject' },
            { key: 'updated_at', label: 'Updated', render: t => fmtDate(t.updated_at), sortValue: t => t.updated_at },
          ]} />
        )}
      </Card>

      <Card title="Send log" icon="clipboard" className="a-span-12" actions={<ExportButton name="email-sends" rows={d?.sends} />}>
        {!d ? <Loading /> : (
          <Table rows={d.sends} onRow={s => s.user_id && go({ member: s.user_id })} empty="Nothing sent yet." cols={[
            { key: 'created_at', label: 'When', render: s => fmtDate(s.created_at, true), sortValue: s => s.created_at },
            { key: 'email', label: 'To' },
            { key: 'template', label: 'Template', render: s => s.template || 'custom' },
            { key: 'subject', label: 'Subject', render: s => s.subject || '—' },
            { key: 'status', label: 'Result', render: s => <Badge tone={s.status === 'sent' ? 'ok' : s.status === 'failed' ? 'danger' : 'neutral'}>{s.status}</Badge> },
            { key: 'reason', label: 'Note', render: s => <span className="a-small">{s.reason || ''}</span> },
            { key: 'campaign', label: 'Campaign', render: s => s.campaign || '' },
          ]} />
        )}
      </Card>

      {editing && <TemplateEditor t={editing} onClose={() => setEditing(null)} onSaved={() => { templates.reload(); setEditing(null) }} />}
    </>
  )
}

function TemplateEditor({ t, onClose, onSaved }) {
  const [f, setF] = useState({ ...t, cta_label: t.cta_label || '', cta_url: t.cta_url || '' })
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e?.target ? e.target.value : e }))
  const save = async () => {
    if (!/^[a-z0-9_]{2,40}$/.test(f.key)) { setError('Key: 2–40 lower-case letters, numbers or _'); return }
    if (!f.name.trim() || !f.subject.trim() || !f.body.trim()) { setError('Name, subject and message are needed'); return }
    try { await api.emailTemplateSave(f); onSaved() } catch (e) { setError(e.message) }
  }
  return (
    <Modal wide title={t.isNew ? 'New template' : `Edit: ${t.name}`} onClose={onClose}
      footer={<><button className="a-btn a-btn--ghost" onClick={onClose}>Cancel</button><button className="a-btn a-btn--primary" onClick={save}>Save template</button></>}>
      <div className="a-form">
        <div className="a-form--2">
          <Field label="Name"><input value={f.name} onChange={set('name')} /></Field>
          <Field label="Key"><input value={f.key} onChange={set('key')} disabled={!t.isNew} placeholder="spring_offer" /></Field>
        </div>
        <Field label="Kind" hint="Account notices reach everyone with an account; marketing only those who opted in.">
          <Segmented options={[['marketing', 'Marketing'], ['service', 'Account notice']]} value={f.kind} onChange={set('kind')} />
        </Field>
        <Field label="Subject"><input value={f.subject} onChange={set('subject')} maxLength={200} /></Field>
        <Field label="Message" hint="Blank line = new paragraph. **bold**, [link](https://…). Fill-ins: {{first_name}} {{last_trip_city}} {{last_trip_days}} {{last_trip_bookings}} {{next_trip_city}} {{next_trip_date}} {{trips_count}} {{countries}} {{app_url}} {{message}}">
          <textarea rows={12} value={f.body} onChange={set('body')} maxLength={8000} />
        </Field>
        <div className="a-form--2">
          <Field label="Button text"><input value={f.cta_label} onChange={set('cta_label')} /></Field>
          <Field label="Button link"><input value={f.cta_url} onChange={set('cta_url')} /></Field>
        </div>
        {error && <p className="a-field__error">{error}</p>}
      </div>
    </Modal>
  )
}
