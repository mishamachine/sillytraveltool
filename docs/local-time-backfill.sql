-- Local-time backfill for bookings saved before time zones existed. DRY RUN: review docs/LOCAL_TIME_BACKFILL.md first.
-- Rollback: the old values are kept in public._backup_local_time_20261021 (created below).
begin;
create table if not exists public._backup_local_time_20261021 as
  select id, departure_time, arrival_time, departure_tz, arrival_tz, now() as saved_at from public.bookings where departure_time is not null;
alter table public._backup_local_time_20261021 enable row level security;
update public.bookings set departure_time = '2026-03-11T15:15:00.000Z', arrival_time = '2026-03-11T17:37:00.000Z', departure_tz = 'America/Los_Angeles', arrival_tz = 'America/Los_Angeles' where id = '8a5b24bf-0557-4109-9507-0a9323a1b50a';
update public.bookings set departure_time = '2026-03-11T19:25:00.000Z', arrival_time = '2026-03-12T11:00:00.000Z', departure_tz = 'America/Los_Angeles', arrival_tz = 'Asia/Hong_Kong' where id = 'da90a1a9-8aa4-4736-84ae-26230a82c208';
update public.bookings set departure_time = '2026-03-12T12:15:00.000Z', arrival_time = '2026-03-12T18:40:00.000Z', departure_tz = 'Asia/Hong_Kong', arrival_tz = 'Asia/Kolkata' where id = '333a4084-e3df-4479-8388-5f0bc1a0ab50';
update public.bookings set departure_time = '2026-04-01T20:45:00.000Z', arrival_time = '2026-04-02T06:40:00.000Z', departure_tz = 'America/Los_Angeles', arrival_tz = 'Europe/Amsterdam' where id = 'baf3b141-f2ef-454c-968e-577223ba83ee';
update public.bookings set departure_tz = 'America/Denver', arrival_tz = 'America/Chicago' where id = 'ab174e38-3d43-4fcb-94fe-1b869c1554fc';
update public.bookings set departure_tz = 'America/Chicago', arrival_tz = 'Europe/Madrid' where id = 'a64346ab-e14e-4ecf-a2da-13b485931217';
update public.bookings set departure_time = '2026-04-02T07:35:00.000Z', arrival_time = '2026-04-02T10:10:00.000Z', departure_tz = 'Europe/Amsterdam', arrival_tz = 'Europe/Madrid' where id = '3639a9d0-0c69-470d-ba3f-43d6d926d565';
update public.bookings set departure_time = '2026-04-03T19:40:00.000Z', arrival_time = '2026-04-04T00:50:00.000Z', departure_tz = 'Asia/Kolkata', arrival_tz = 'Asia/Hong_Kong' where id = '3e757c03-2def-49a7-9650-0be7c4c9c01b';
update public.bookings set departure_time = '2026-04-04T05:25:00.000Z', arrival_time = '2026-04-04T17:05:00.000Z', departure_tz = 'Asia/Hong_Kong', arrival_tz = 'America/Los_Angeles' where id = '3ff8c3ec-e3a3-49f7-bfcf-c157d30b693e';
update public.bookings set departure_time = '2026-04-10T04:00:00.000Z', arrival_time = '2026-04-10T06:25:00.000Z', departure_tz = 'Europe/Madrid', arrival_tz = 'Europe/Amsterdam' where id = '562d06d8-b74c-4b8e-9087-cbca16f3a736';
update public.bookings set departure_time = '2026-04-10T08:20:00.000Z', arrival_time = '2026-04-10T18:45:00.000Z', departure_tz = 'Europe/Amsterdam', arrival_tz = 'America/Los_Angeles' where id = '776add42-7af6-4abe-9f28-be9ba9378301';
update public.bookings set departure_tz = 'Europe/Madrid', arrival_tz = 'America/Chicago' where id = '7661e5d1-877e-4317-aad0-d9abcb0f85ed';
update public.bookings set departure_tz = 'America/Chicago', arrival_tz = 'America/Denver' where id = 'a357b78a-9c1e-40fd-b263-f6a2a57675b5';
update public.bookings set departure_time = '2026-04-15T14:00:00.000Z', arrival_time = '2026-04-15T19:15:00.000Z', departure_tz = 'America/Los_Angeles', arrival_tz = 'America/New_York' where id = 'df810f6a-b1ef-4fc8-b390-8b111c770e9b';
update public.bookings set departure_tz = 'America/Los_Angeles', arrival_tz = 'America/New_York' where id = '4e30041d-3c0c-4fcc-9fff-1034a5ad0ecc';
update public.bookings set departure_time = '2026-04-15T22:30:00.000Z', arrival_time = '2026-04-16T05:45:00.000Z', departure_tz = 'America/New_York', arrival_tz = 'Europe/Madrid' where id = 'b5f6f55f-6b32-4d30-a6f7-5171da385cdc';
update public.bookings set departure_time = '2026-04-25T08:00:00.000Z', arrival_time = '2026-04-25T16:30:00.000Z', departure_tz = 'Europe/Madrid', arrival_tz = 'America/New_York' where id = '94308041-3fc8-4a7a-b6e2-d5f8f6088df4';
update public.bookings set departure_time = '2026-04-25T19:00:00.000Z', arrival_time = '2026-04-26T01:15:00.000Z', departure_tz = 'America/New_York', arrival_tz = 'America/Los_Angeles' where id = 'e4e38c09-be5b-45d9-9a17-31a5dc469ca7';
update public.trips set destination_tz = 'Asia/Kolkata' where id = '4ee96386-d84d-429e-acb5-3436cb80b1d5' and destination_tz is null;
update public.trips set destination_tz = 'America/Detroit' where id = 'f7fd64ef-c570-4d10-8a71-bfc967d5aed3' and destination_tz is null;
update public.trips set destination_tz = 'America/Detroit' where id = 'f15f3852-753f-4915-9f2a-c2ad2d08cfc4' and destination_tz is null;
update public.trips set destination_tz = 'Europe/Madrid' where id = '910e78fa-371b-44b0-ba9d-09a71747bd19' and destination_tz is null;
update public.trips set destination_tz = 'America/Denver' where id = '8f7c8696-dfe5-4f89-8c9f-b7f6f6eda730' and destination_tz is null;
update public.trips set destination_tz = 'America/New_York' where id = '117926c2-b585-4bb8-a43d-b29911877856' and destination_tz is null;
update public.trips set destination_tz = 'America/New_York' where id = 'de24f54d-dfa2-456e-9c8e-942262095619' and destination_tz is null;
update public.trips set destination_tz = 'Asia/Karachi' where id = '0d142981-b28d-4ced-9e8f-a8250753deb4' and destination_tz is null;
update public.trips set destination_tz = 'America/Los_Angeles' where id = 'df572a04-ad03-4f85-b736-f99dfb149c12' and destination_tz is null;
commit;
