-- Phrasebooks from any language, not only English: one permanent row per (from, to) pair.
-- Existing rows are the English phrasebooks. For other sources, the "english" field of each phrase holds the
-- meaning in the source language (the app shows it as "what it means").
alter table public.phrase_cache add column if not exists source_code text not null default 'en';
alter table public.phrase_cache drop constraint if exists phrase_cache_language_code_key;
create unique index if not exists phrase_cache_source_language_key on public.phrase_cache (source_code, language_code);
