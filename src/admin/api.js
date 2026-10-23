import { supabase } from '../lib/supabase'

// Every cockpit read and action is an admin_* database function (docs/ADMIN_PLAN.md section 1).
// They check admin + MFA server-side; this file only names them.
// Dev only: `/admin/?demo` swaps in fixtures (src/admin/demo.js) so screens can be checked without signing in.

let demo = null
export const isDemo = import.meta.env.DEV && new URLSearchParams(location.search).has('demo')
export async function initApi() {
  if (isDemo) demo = (await import('./demo.js')).default
}

const MESSAGES = {
  not_admin: 'This account isn’t an admin.',
  google_required: 'Sign in with Google to use the cockpit.',
  role_too_low: 'Your role can’t do that.',
}

export async function rpc(name, args = {}) {
  if (demo) return demo(name, args)
  const { data, error } = await supabase.rpc(name, args)
  if (error) {
    const err = new Error(MESSAGES[error.message] || error.message || 'Something went wrong')
    err.code = error.message
    throw err
  }
  return data
}

// The admin-stripe Edge Function holds the Stripe key; it checks admin_guard with the caller's session
async function stripeFn(action, body = {}) {
  if (demo) return demo(`stripe:${action}`, body)
  const { data, error } = await supabase.functions.invoke('admin-stripe', { body: { action, ...body } })
  if (error) {
    let message = error.message
    try { message = (await error.context.json()).error || message } catch { /* not JSON */ }
    throw new Error(message)
  }
  return data
}

async function emailFn(action, body = {}) {
  if (demo) return demo(`email:${action}`, body)
  const { data, error } = await supabase.functions.invoke('admin-email', { body: { action, ...body } })
  if (error) {
    let message = error.message
    try { message = (await error.context.json()).error || message } catch { /* not JSON */ }
    throw new Error(message)
  }
  return data
}

async function experimentAI(body) {
  if (demo) return demo('experiment:ai', body)
  const { data, error } = await supabase.functions.invoke('admin-experiment-ai', { body })
  if (error) {
    let message = error.message
    try { message = (await error.context.json()).error || message } catch { /* not JSON */ }
    throw new Error(message)
  }
  return data
}

// cost-alert sends the owner's spend email; from the cockpit only as a test (it checks admin_guard('owner'))
async function costAlertTest() {
  if (demo) return demo('cost:test')
  const { data, error } = await supabase.functions.invoke('cost-alert', { body: { test: true } })
  if (error) {
    let message = error.message
    try { message = (await error.context.json()).error || message } catch { /* not JSON */ }
    throw new Error(MESSAGES[message] || message)
  }
  return data
}

export const api = {
  experiments: () => rpc('admin_experiments'),
  experimentSave: (p) => rpc('admin_experiment_save', { p }),
  experimentStatus: (id, status) => rpc('admin_experiment_status', { p_id: id, p_status: status }),
  experimentReorder: (ids) => rpc('admin_experiment_reorder', { p_ids: ids }),
  experimentDelete: (id) => rpc('admin_experiment_delete', { p_id: id }),
  experimentAI,
  experimentReadout: (id) => rpc('admin_experiment_readout', { p_id: id }),
  cohorts: () => rpc('admin_cohorts'),
  cohortMembers: (id) => rpc('admin_cohort_members', { p_cohort: id }),
  cohortPreview: (rules) => rpc('admin_cohort_preview', { p_rules: rules }),
  cohortSave: (p) => rpc('admin_cohort_save', { p }),
  cohortMember: (id, userId, add) => rpc('admin_cohort_member', { p_cohort: id, p_user: userId, p_add: add }),
  emailPreview: (b) => emailFn('preview', b),
  emailCheck: (b) => emailFn('check', b),
  emailSend: (b) => emailFn('send', b),
  emailTemplates: () => rpc('admin_email_templates'),
  emailTemplateSave: (p) => rpc('admin_email_template_save', { p }),
  emailLog: (userId) => rpc('admin_email_log', { p_user: userId || null }),
  stripeStatus: () => stripeFn('status'),
  stripeSync: (force) => stripeFn('sync', { force: !!force }),
  stripePushCode: (id) => stripeFn('code_push', { id }),
  stripeCodeActive: (id, active) => stripeFn('code_active', { id, active }),
  stripe: (f) => rpc('admin_stripe', { p_from: f.from, p_to: f.to }),
  codeStripe: (id) => rpc('admin_code_stripe', { p_code: id }),
  whoami: () => rpc('admin_whoami'),
  pulse: (f) => rpc('admin_pulse', { p_from: f.from, p_to: f.to, p_exclude_internal: f.excludeInternal }),
  needsYou: () => rpc('admin_needs_you'),
  taskSet: (key, status, snoozeUntil, title) => rpc('admin_task_set', { p_key: key, p_status: status, p_snooze_until: snoozeUntil || null, p_title: title || null }),
  taskAdd: (title, detail) => rpc('admin_task_add', { p_title: title, p_detail: detail || null }),
  members: (q = {}, f) => rpc('admin_members', {
    p_search: q.search || null, p_stage: q.stage || null, p_plan: q.plan || null, p_status: q.status || null,
    p_exclude_internal: f.excludeInternal,
  }),
  membersPlus: (search, f) => rpc('admin_members_plus', { p_search: search || null, p_exclude_internal: f.excludeInternal }),
  audience: (f) => rpc('admin_audience', { p_exclude_internal: f.excludeInternal }),
  memberInsights: (id) => rpc('admin_member_insights', { p_user: id }),
  member: (id) => rpc('admin_member', { p_user: id }),
  noteAdd: (id, body, pinned) => rpc('admin_note_add', { p_user: id, p_body: body, p_pinned: !!pinned }),
  noteUpdate: (noteId, patch) => rpc('admin_note_update', { p_note: noteId, p_pinned: patch.pinned ?? null, p_delete: !!patch.delete }),
  setTags: (id, tags) => rpc('admin_set_tags', { p_user: id, p_tags: tags }),
  setInternal: (id, internal) => rpc('admin_set_internal', { p_user: id, p_internal: internal }),
  statusImpact: (id) => rpc('admin_status_impact', { p_user: id }),
  setStatus: (id, s) => rpc('admin_set_status', {
    p_user: id, p_level: s.level, p_reason: s.reason, p_note: s.note || null,
    p_ends_at: s.endsAt || null, p_member_message: s.message || null,
  }),
  liftStatus: (modId, reason) => rpc('admin_lift_status', { p_moderation: modId, p_reason: reason }),
  grant: (id, g) => rpc('admin_grant', {
    p_user: id, p_reason: g.reason, p_days: g.days || null, p_until: g.until || null, p_lifetime: !!g.lifetime, p_note: g.note || null,
  }),
  endGrant: (grantId, reason) => rpc('admin_end_grant', { p_grant: grantId, p_reason: reason }),
  exportMember: (id) => rpc('admin_member_export', { p_user: id }),
  codes: (archived) => rpc('admin_codes', { p_include_archived: !!archived }),
  codeCreate: (p, count) => rpc('admin_code_create', { p, p_count: count || 1 }),
  codeUpdate: (id, p) => rpc('admin_code_update', { p_code: id, p }),
  codeReport: (id) => rpc('admin_code_report', { p_code: id }),
  endRedemption: (id, reason) => rpc('admin_end_redemption', { p_redemption: id, p_reason: reason }),
  usage: (f) => rpc('admin_usage', { p_from: f.from, p_to: f.to, p_exclude_internal: f.excludeInternal }),
  context: (f) => rpc('admin_context', { p_from: f.from, p_to: f.to, p_exclude_internal: f.excludeInternal }),
  freshStartPreview: () => rpc('admin_fresh_start_preview'),
  freshStart: (confirm) => rpc('admin_fresh_start', { p_confirm: confirm }),
  formerMembers: () => rpc('admin_former_members'),
  system: (f) => rpc('admin_system', { p_from: f.from, p_to: f.to }),
  costs: (f) => rpc('admin_costs', { p_from: f.from, p_to: f.to, p_exclude_internal: f.excludeInternal }),
  settings: () => rpc('admin_settings'),
  settingSet: (key, value) => rpc('admin_setting_set', { p_key: key, p_value: value }),
  costAlertTest,
}
