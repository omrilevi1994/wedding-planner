-- legacy per-wedding fields now live in wedding_members; role replaced by is_platform_admin
alter table profiles drop column if exists wedding_id;
alter table profiles drop column if exists wedding_sides;
alter table profiles drop column if exists max_guests;
alter table profiles drop column if exists is_approved;
alter table profiles drop column if exists role;
