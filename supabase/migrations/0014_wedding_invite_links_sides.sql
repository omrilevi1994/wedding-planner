-- Invite links granting the 'family' role had no way to carry wedding_sides / max_guests,
-- unlike the per-email invite flow. That meant anyone joining via a "family member" link
-- always got unrestricted (all-sides, no-cap) guest access — effectively full access,
-- since Guests.jsx only restricts a family member's visible guests when wedding_sides is set.
alter table wedding_invite_links add column if not exists wedding_sides text[] default '{}';
alter table wedding_invite_links add column if not exists max_guests int;
