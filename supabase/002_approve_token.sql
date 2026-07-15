-- Run this in Supabase SQL Editor (adds the one-click email approval feature).
-- Safe to run even if already applied — IF NOT EXISTS makes it idempotent.

alter table invoices add column if not exists approve_token text unique;
