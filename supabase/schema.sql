-- GRD Virk Pty Ltd — Subcontractor Invoicing System
-- Run this entire file once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.

create extension if not exists pgcrypto;

-- ============================================================
-- SUBCONTRACTORS
-- ============================================================
create table subcontractors (
  id uuid primary key default gen_random_uuid(),

  username text not null unique,
  password_encrypted text not null,          -- reversible encryption (AES-GCM), not a one-way hash

  legal_name text not null,
  business_name text,
  abn text not null,

  address text,
  email text,
  phone text,

  bank_account_name text,
  bank_bsb text,
  bank_account_number text,
  bank_flagged boolean not null default false,   -- true after subcontractor changes bank details, until admin clears it
  bank_flagged_at timestamptz,

  daily_rate_incl_gst numeric(10,2) not null,
  depot text,

  invoice_prefix text not null unique,        -- e.g. "JOHN"
  next_invoice_seq integer not null default 1,

  status text not null default 'active' check (status in ('active','disabled')),

  -- pending changes to legal_name / business_name / abn require admin approval
  pending_legal_name text,
  pending_business_name text,
  pending_abn text,
  pending_requested_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- INVOICES
-- ============================================================
create table invoices (
  id uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references subcontractors(id),

  invoice_number text unique,                 -- null until submitted, e.g. "JOHN-0001"
  status text not null default 'draft' check (
    status in ('draft','submitted','under_review','returned','approved','rejected','paid','cancelled')
  ),

  period_start date not null,
  period_end date not null,
  days_worked numeric(5,2) not null default 0,

  -- snapshots taken at submission time so later profile/rate edits never change an issued invoice
  daily_rate_incl_gst numeric(10,2) not null,
  depot text,
  description text,

  sub_legal_name text,
  sub_business_name text,
  sub_abn text,
  sub_address text,
  sub_bank_account_name text,
  sub_bank_bsb text,
  sub_bank_account_number text,

  -- computed totals (frozen once submitted; recomputed if admin edits)
  taxable_subtotal_excl_gst numeric(10,2) not null default 0,
  gst_amount numeric(10,2) not null default 0,
  non_gst_total numeric(10,2) not null default 0,
  total_payable numeric(10,2) not null default 0,

  declaration_accepted boolean not null default false,
  declaration_accepted_at timestamptz,

  admin_note text,
  correction_requested boolean not null default false,
  correction_note text,

  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_subcontractor_idx on invoices(subcontractor_id);
create index invoices_status_idx on invoices(status);

-- a subcontractor cannot have two submitted/approved/paid invoices with overlapping periods
-- (drafts are excluded from this check; enforced in application code before submit)

-- ============================================================
-- INVOICE LINE ITEMS (extra items only — normal days live on the invoice row)
-- ============================================================
create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,

  description text not null,
  amount numeric(10,2) not null,              -- amount as entered by the subcontractor
  gst_treatment text not null check (gst_treatment in ('gst_included','no_gst')),

  amount_excl_gst numeric(10,2) not null default 0,
  gst_amount numeric(10,2) not null default 0,

  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index invoice_items_invoice_idx on invoice_items(invoice_id);

-- ============================================================
-- REVISION HISTORY (audit trail — every edit/return/correction keeps the prior version)
-- ============================================================
create table invoice_revisions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  snapshot jsonb not null,                     -- full invoice + items as they were before this change
  changed_by text not null check (changed_by in ('admin','subcontractor')),
  change_note text,
  created_at timestamptz not null default now()
);

create index invoice_revisions_invoice_idx on invoice_revisions(invoice_id);

-- ============================================================
-- Atomic invoice number generator (prevents two invoices ever getting the same number)
-- ============================================================
create or replace function next_invoice_number(p_subcontractor_id uuid)
returns text
language plpgsql
as $$
declare
  v_prefix text;
  v_seq integer;
begin
  update subcontractors
  set next_invoice_seq = next_invoice_seq + 1
  where id = p_subcontractor_id
  returning invoice_prefix, next_invoice_seq - 1 into v_prefix, v_seq;

  if v_prefix is null then
    raise exception 'Subcontractor % not found', p_subcontractor_id;
  end if;

  return v_prefix || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

-- ============================================================
-- Row Level Security: locked down completely.
-- The website's backend talks to this database using the service_role key,
-- which always bypasses RLS. Enabling RLS with zero policies means that even
-- if the public "anon" key were ever exposed, it could not read or write
-- anything in these tables.
-- ============================================================
alter table subcontractors enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table invoice_revisions enable row level security;
