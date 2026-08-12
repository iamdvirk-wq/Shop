-- Vehicle weekly safety check feature.
-- Run this in the SQL Editor of whichever Supabase project you're setting
-- up (test project first, then the live one once you're happy with testing).

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  rego text not null unique,
  nickname text,            -- e.g. "White Hilux" or make/model
  depot text,
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Each subcontractor can have a "usual" van (pre-selected for convenience),
-- but they can still pick any vehicle when checking one that isn't theirs.
alter table subcontractors add column if not exists default_vehicle_id uuid references vehicles(id);

create table vehicle_checks (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id),
  subcontractor_id uuid not null references subcontractors(id),

  -- The Monday (Australia/Brisbane, no daylight saving) that this check
  -- covers. One check per vehicle per week.
  week_start_date date not null,

  odo_reading numeric(10, 1) not null,
  odo_ai_suggested numeric(10, 1),
  odo_photo_path text not null,
  odo_photo_captured_live boolean not null default false,
  odo_photo_taken_at timestamptz,
  odo_photo_file_modified_at timestamptz,
  odo_photo_uploaded_at timestamptz not null default now(),

  has_issues boolean not null default false,
  declaration_accepted boolean not null default false,
  declaration_accepted_at timestamptz,

  created_at timestamptz not null default now(),

  unique (vehicle_id, week_start_date)
);

create index vehicle_checks_vehicle_idx on vehicle_checks(vehicle_id);
create index vehicle_checks_week_idx on vehicle_checks(week_start_date);

create table vehicle_check_items (
  id uuid primary key default gen_random_uuid(),
  vehicle_check_id uuid not null references vehicle_checks(id) on delete cascade,

  item_key text not null,
  item_label text not null,           -- snapshot of the wording at check time
  result text not null check (result in ('pass', 'fail')),
  note text,
  photo_path text,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_note text,
  sort_order integer not null default 0
);

create index vehicle_check_items_check_idx on vehicle_check_items(vehicle_check_id);
create index vehicle_check_items_fail_idx on vehicle_check_items(result) where result = 'fail';

alter table vehicles enable row level security;
alter table vehicle_checks enable row level security;
alter table vehicle_check_items enable row level security;

-- Private storage bucket for ODO and issue photos (accessed only via the
-- backend's service_role key, or short-lived signed URLs it generates).
insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', false)
on conflict (id) do nothing;
