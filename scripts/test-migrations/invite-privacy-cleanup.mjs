import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const W = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url))
const db = new PGlite()
const OWN='11111111-1111-1111-1111-111111111111', LEAVER='22222222-2222-2222-2222-222222222222', OTHER='33333333-3333-3333-3333-333333333333'
const T_OWN='aaaaaaaa-0000-0000-0000-000000000001', T_LEAV='aaaaaaaa-0000-0000-0000-000000000002'
let fails = 0
const ok = (name, cond, extra='') => { if (!cond) fails++; console.log(`${cond?'ok  ':'FAIL'} ${name} ${cond?'':extra}`) }
const q = async s => (await db.query(s)).rows
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema cron; create table cron.job (jobname text, schedule text, command text);
create function cron.schedule(n text, sch text, c text) returns bigint language sql as $$ insert into cron.job values (n, sch, c); select 1::bigint $$;
create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname = n; select true $$;
create schema auth; create table auth.users (id uuid primary key, email text);
create table public.admins (user_id uuid, role text);
create type public.collaborator_role as enum ('owner','collaborator','viewer');
create table public.trips (id uuid primary key, owner_id uuid references auth.users(id));
create table public.trip_collaborators (id uuid primary key default gen_random_uuid(), trip_id uuid references public.trips(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, invited_email text, role public.collaborator_role default 'collaborator',
  status text default 'pending' check (status in ('pending','accepted','declined')), invited_by uuid references auth.users(id),
  invited_at timestamptz default now(), accepted_at timestamptz, invite_token uuid, invite_expires_at timestamptz,
  unique(trip_id,user_id), unique(trip_id,invited_email));
create table public.bookings (id uuid primary key default gen_random_uuid(), trip_id uuid references public.trips(id) on delete cascade, created_by uuid not null references auth.users(id),
  title text, confirmation_number text, notes text, passenger_name text, seat_number text);
create table public.trip_activities (id uuid primary key default gen_random_uuid(), trip_id uuid references public.trips(id) on delete cascade, created_by uuid not null references auth.users(id),
  title text, notes text, completed_by uuid references auth.users(id));
create table public.api_usage (day date, user_id uuid, service text, endpoint text, calls int, unique(day,user_id,service,endpoint));
create table public.ai_calls (user_id uuid); create table public.function_errors (user_id uuid);
create table public.ingest_locks (user_id uuid); create table public.former_members (user_id uuid);
insert into auth.users values ('${OWN}','owner@x.com'),('${LEAVER}','Leaver@X.com'),('${OTHER}','other@x.com');
insert into public.trips values ('${T_OWN}','${OWN}'),('${T_LEAV}','${LEAVER}');
`)
// ---- purge ----
const mig = readFileSync(W+'20261030120100_invite_privacy_cleanup.sql','utf8')
await db.exec(`insert into public.trip_collaborators (trip_id,user_id,invited_email,role,status,invited_by,invited_at,invite_token,invite_expires_at) values
 ('${T_OWN}',null,'p-old@x.com','viewer','pending','${OWN}',now()-interval '20 days',gen_random_uuid(), now()-interval '8 days'),
 ('${T_OWN}',null,'p-grace@x.com','viewer','pending','${OWN}',now()-interval '12 days',gen_random_uuid(), now()-interval '5 days'),
 ('${T_OWN}',null,'p-live@x.com','viewer','pending','${OWN}',now(),gen_random_uuid(), now()+interval '6 days'),
 ('${T_OWN}',null,'p-legacy@x.com','viewer','pending','${OWN}',now()-interval '90 days',gen_random_uuid(), null),
 ('${T_OWN}',null,'d-old@x.com','viewer','declined','${OWN}',now()-interval '31 days',null,null),
 ('${T_OWN}',null,'d-new@x.com','viewer','declined','${OWN}',now()-interval '29 days',null,null),
 ('${T_OWN}','${OTHER}','acc@x.com','collaborator','accepted','${OWN}',now()-interval '200 days',gen_random_uuid(),now()-interval '190 days'),
 ('${T_OWN}','${OWN}',null,'owner','accepted','${OWN}',now()-interval '300 days',null,null);`)
await db.exec(mig); await db.exec(mig)
ok('idempotent: one cron job', (await q(`select count(*)::int n from cron.job where jobname='purge-stale-invites'`))[0].n === 1)
ok('stale token cleared on non-pending only', (await q(`select count(*)::int n from public.trip_collaborators where status<>'pending' and invite_token is not null`))[0].n === 0
   && (await q(`select count(*)::int n from public.trip_collaborators where status='pending' and invite_token is not null`))[0].n === 4)
const cmd = (await q(`select command from cron.job where jobname='purge-stale-invites'`))[0].command
await db.exec(cmd)
const left = (await q(`select coalesce(invited_email,'(owner)') e from public.trip_collaborators order by 1`)).map(r=>r.e)
console.log('left after purge:', left.join(', '))
ok('purge removed only expired+7d pending and declined>30d', JSON.stringify(left) === JSON.stringify(['(owner)','acc@x.com','d-new@x.com','p-grace@x.com','p-legacy@x.com','p-live@x.com']))
ok('accepted row keeps email, user and accepted state', (await q(`select 1 from public.trip_collaborators where invited_email='acc@x.com' and user_id='${OTHER}' and status='accepted'`)).length === 1)
ok('pending rows keep their email', (await q(`select count(*)::int n from public.trip_collaborators where status='pending' and invited_email is not null`))[0].n === 3)
ok('accepted-row upsert key still works (re-invite hits conflict)', await db.exec(`insert into public.trip_collaborators (trip_id,invited_email,status) values ('${T_OWN}','acc@x.com','pending') on conflict (trip_id,invited_email) do update set status=excluded.status`).then(()=>true,()=>false))
// ---- delete_account ----
await db.exec(`delete from public.trip_collaborators where invited_email='acc@x.com';
insert into public.bookings (trip_id,created_by,title,confirmation_number,notes,passenger_name,seat_number) values
 ('${T_OWN}','${LEAVER}','LeaverFlight','CONF1','my private note','Leaver Name','12A'),
 ('${T_OWN}','${OWN}','OwnerFlight','CONF2','owner note','Owner Name','1A'),
 ('${T_OWN}','${OTHER}','OtherFlight','CONF3','other note','Other Name','2B'),
 ('${T_LEAV}','${LEAVER}','LeaversOwnTripBooking','CONF4','x','y','z');
insert into public.trip_activities (trip_id,created_by,title,notes,completed_by) values
 ('${T_OWN}','${LEAVER}','LeaverIdea','leaver note','${LEAVER}'),
 ('${T_OWN}','${OWN}','OwnerIdea','owner note',null),
 ('${T_OWN}','${OTHER}','OtherIdea','other note',null);
insert into public.trip_collaborators (trip_id,user_id,invited_email,status,invited_by) values
 ('${T_OWN}',null,'LEAVER@x.com','pending','${OWN}'),
 ('${T_LEAV}',null,'leaver@x.com','declined','${LEAVER}'),
 ('${T_OWN}',null,'someone@x.com','pending','${OWN}'),
 ('${T_OWN}','${LEAVER}','leaver@x.com','accepted','${OWN}');`)
await db.exec(`update public.trip_collaborators set trip_id='${T_OWN}' where false`)
const r = (await q(`select public.delete_account('${LEAVER}') as r`))[0].r
console.log('result', JSON.stringify(r))
const b = await q(`select title, created_by, notes, passenger_name, confirmation_number, seat_number from public.bookings order by title`)
console.log(JSON.stringify(b))
const get = t => b.find(x=>x.title===t)
ok('leaver booking on others trip: notes+passenger cleared, re-attributed to owner', get('LeaverFlight').notes===null && get('LeaverFlight').passenger_name===null && get('LeaverFlight').created_by===OWN)
ok('confirmation number and seat stay', get('LeaverFlight').confirmation_number==='CONF1' && get('LeaverFlight').seat_number==='12A')
ok('owner own booking untouched', get('OwnerFlight').notes==='owner note' && get('OwnerFlight').passenger_name==='Owner Name')
ok('other member booking untouched', get('OtherFlight').notes==='other note' && get('OtherFlight').created_by===OTHER)
ok("leaver's own-trip booking gone", !get('LeaversOwnTripBooking'))
const a = await q(`select title, created_by, notes, completed_by from public.trip_activities order by title`)
const ga = t => a.find(x=>x.title===t)
ok('activity: notes cleared, re-attributed, completed_by nulled', ga('LeaverIdea').notes===null && ga('LeaverIdea').created_by===OWN && ga('LeaverIdea').completed_by===null)
ok('owner/other activity notes untouched', ga('OwnerIdea').notes==='owner note' && ga('OtherIdea').notes==='other note')
const c = (await q(`select invited_email, status from public.trip_collaborators order by 1`)).map(x=>x.invited_email+':'+x.status)
console.log('collab left:', c.join(', '))
ok('unbound invites to leaver email removed (case-insensitive), all other rows kept', !c.some(x=>/^leaver@x.com/i.test(x)) && c.length===6 && c.includes('someone@x.com:pending') && c.includes('d-new@x.com:declined'))
ok('account gone', (await q(`select count(*)::int n from auth.users where id='${LEAVER}'`))[0].n===0)
ok('owner account still blocked', await db.exec(`insert into public.admins values ('${OWN}','owner')`).then(()=>db.query(`select public.delete_account('${OWN}')`)).then(()=>false,e=>/Owner accounts/.test(e.message)))
ok('no such account raises', await db.query(`select public.delete_account('99999999-9999-9999-9999-999999999999')`).then(()=>false,e=>/No such account/.test(e.message)))
ok('function is security definer with empty search_path', (await q(`select prosecdef, proconfig from pg_proc where proname='delete_account'`))[0].prosecdef === true)
console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails?1:0)
