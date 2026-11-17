-- Rollback for 20261117100000_email_sends_hash.sql (run by hand).
-- Restores delete_account to the 20261116100000 definition: re-run that file's delete_account block
-- (from "create or replace function public.delete_account" to its grant). Then:
drop function if exists public.email_hash(text);
-- Rows already hashed stay hashed: a hash cannot be turned back into an address. That is intended.
-- The Vault secret email_hash_key is kept (delete it in the dashboard only if hashing is abandoned for good).
