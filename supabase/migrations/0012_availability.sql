-- ============================================================================
-- Hills of Hems Hub – 0012  Team-Verfügbarkeit (Meeting-Kalender)
-- ----------------------------------------------------------------------------
-- Jede Person markiert pro Tag, ob sie "da" ist oder "nicht kann".
--   status = 'available' (da, grün) | 'unavailable' (kann nicht, rot)
-- Eine Zeile pro Person und Tag (PK). Kein Eintrag = nicht angegeben.
-- ============================================================================

create table if not exists public.availability (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        date not null,
  status     text not null check (status in ('available', 'unavailable')),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists availability_day_idx on public.availability (day);
comment on table public.availability is 'Tagesverfügbarkeit pro Person: available = da, unavailable = kann nicht.';

-- ----------------------------------------------------------------------------
-- RLS: lesen für eingeloggte; jede:r pflegt NUR die eigene Verfügbarkeit.
-- ----------------------------------------------------------------------------
alter table public.availability enable row level security;

create policy availability_select on public.availability
  for select to authenticated using (auth.uid() is not null);
create policy availability_insert_self on public.availability
  for insert to authenticated with check (user_id = auth.uid());
create policy availability_update_self on public.availability
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy availability_delete_self on public.availability
  for delete to authenticated using (user_id = auth.uid());
