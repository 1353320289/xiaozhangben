create table if not exists public.ledger_records (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  goods text not null,
  price numeric not null default 0,
  dozen_qty numeric not null default 0,
  loose_qty numeric not null default 0,
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.ledger_records enable row level security;

drop policy if exists "Users can read own ledger records" on public.ledger_records;
create policy "Users can read own ledger records"
on public.ledger_records for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own ledger records" on public.ledger_records;
create policy "Users can insert own ledger records"
on public.ledger_records for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own ledger records" on public.ledger_records;
create policy "Users can update own ledger records"
on public.ledger_records for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own ledger records" on public.ledger_records;
create policy "Users can delete own ledger records"
on public.ledger_records for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists ledger_records_user_date_idx
on public.ledger_records (user_id, date);

create table if not exists public.report_ranges (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  start_date text,
  end_date text,
  all_records boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.report_ranges enable row level security;

drop policy if exists "Users can read own report ranges" on public.report_ranges;
create policy "Users can read own report ranges"
on public.report_ranges for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own report ranges" on public.report_ranges;
create policy "Users can insert own report ranges"
on public.report_ranges for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own report ranges" on public.report_ranges;
create policy "Users can delete own report ranges"
on public.report_ranges for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists report_ranges_user_month_created_idx
on public.report_ranges (user_id, month, created_at desc);
