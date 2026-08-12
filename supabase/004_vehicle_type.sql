-- Adds a van/bike distinction to vehicles, so each gets the right checklist.
alter table vehicles add column if not exists type text not null default 'van' check (type in ('van', 'bike'));
