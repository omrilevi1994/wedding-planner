-- Per-user map of which page onboarding tours have been seen/dismissed, e.g.
-- {"Dashboard": true, "Guests": true}. Keyed by page name (pages.config.js keys).
-- Client reads/writes it via the profiles row; profiles_self_update RLS (0008)
-- already lets a user update their own row, so no policy change is needed.
alter table profiles add column if not exists tours_seen jsonb not null default '{}'::jsonb;
