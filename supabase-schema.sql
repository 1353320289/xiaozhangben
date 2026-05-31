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
