-- Shared updated_date trigger
create or replace function set_updated_date()
returns trigger language plpgsql as $$
begin new.updated_date = now(); return new; end; $$;

-- System columns macro is inlined per table (id/created_date/updated_date/created_by/created_by_id/is_sample)

create table weddings (
  id text primary key default gen_random_uuid()::text,
  couple_names text not null,
  wedding_date date,
  venue text,
  event_manager_name text,
  reception_time text,
  ceremony_time text,
  budget_target numeric,
  expected_guests numeric,
  currency text default '₪',
  cost_calc_mode text default 'confirmed',
  status text default 'active',
  notes text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role text not null default 'user',        -- admin | user | event_manager
  wedding_id text references weddings(id) on delete set null,
  wedding_sides text[] default '{}',
  max_guests int,
  is_approved boolean default false,
  created_date timestamptz default now(),
  updated_date timestamptz default now()
);

create table tables (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  name text not null,
  capacity numeric not null,
  iplan_number text,
  shape text,
  location_x numeric,
  location_y numeric,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table guests (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text,
  side text not null,
  relationship text,
  status text,
  total_people numeric default 1,
  confirmed_people numeric,
  gift_amount numeric,
  gift_received boolean default false,
  notes text,
  table_id text references tables(id) on delete set null,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table expenses (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  vendor text not null,
  category text not null,
  amount numeric not null,
  status text not null,
  paid_by_party text,
  payment_method text,
  paid_date date,
  due_date date,
  has_deposit boolean,
  deposit_amount numeric,
  deposit_due_date date,
  deposit_paid_date date,
  deposit_status text,
  probability numeric,
  notes text,
  receipt_url text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table payments (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  expense_id text references expenses(id) on delete cascade,
  expense_vendor text,
  amount numeric not null,
  due_date date,
  status text,
  paid_date date,
  paid_by text,
  probability numeric,
  notes text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table gifts (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  guest_id text references guests(id) on delete set null,
  description text not null,
  event text,
  amount numeric,
  notes text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table vendors (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  name text not null,
  contact_person text,
  phone text,
  email text,
  category text not null,
  estimated_cost numeric,
  total_cost numeric,
  contract_details text,
  contract_file_url text,
  notes text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table checklist_groups (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  title text not null,
  "order" numeric not null,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table checklist_items (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  title text not null,
  "group" text references checklist_groups(id) on delete set null,
  completed boolean default false,
  notes text,
  "order" numeric,
  image_url text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table wedding_settings (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  wedding_date date,
  venue text,
  event_manager_name text,
  reception_time text,
  ceremony_time text,
  budget_target numeric,
  expected_guests numeric,
  currency text,
  cost_calc_mode text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

create table activity_logs (
  id text primary key default gen_random_uuid()::text,
  wedding_id text references weddings(id) on delete cascade,
  user_email text,
  user_name text,
  action_type text,
  entity_type text,
  entity_id text,
  entity_name text,
  description text,
  details text,
  created_date timestamptz default now(),
  updated_date timestamptz default now(),
  created_by text, created_by_id text, is_sample boolean default false
);

-- updated_date triggers
do $$
declare t text;
begin
  foreach t in array array['weddings','profiles','tables','guests','expenses','payments','gifts','vendors','checklist_groups','checklist_items','wedding_settings','activity_logs']
  loop
    execute format('create trigger trg_%1$s_updated before update on %1$s for each row execute function set_updated_date();', t);
  end loop;
end $$;

-- Indexes on hot filter columns
create index idx_guests_wedding on guests(wedding_id);
create index idx_guests_table on guests(table_id);
create index idx_guests_status on guests(status);
create index idx_tables_wedding on tables(wedding_id);
create index idx_expenses_wedding on expenses(wedding_id);
create index idx_payments_wedding on payments(wedding_id);
create index idx_payments_expense on payments(expense_id);
create index idx_gifts_wedding on gifts(wedding_id);
create index idx_vendors_wedding on vendors(wedding_id);
create index idx_cgroups_wedding on checklist_groups(wedding_id);
create index idx_citems_wedding on checklist_items(wedding_id);
create index idx_citems_group on checklist_items("group");
create index idx_settings_wedding on wedding_settings(wedding_id);
create index idx_alogs_wedding on activity_logs(wedding_id);
create index idx_profiles_wedding on profiles(wedding_id);

-- Auto-create a profile row when an auth user is created
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();
