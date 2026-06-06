-- ============================================================================
-- Hills of Hems Hub – 0011  Nachricht ans Team
-- ----------------------------------------------------------------------------
-- Eine "schöne Nachricht ans Team": die zuletzt geschriebene erscheint auf
-- jeder Startseite – bis jemand eine neue schreibt. Wir speichern die Historie
-- (jede Nachricht = eine Zeile); angezeigt wird die neueste.
-- ============================================================================

create table if not exists public.team_messages (
  id         uuid primary key default gen_random_uuid(),
  content    text not null,
  author_id  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists team_messages_created_idx on public.team_messages (created_at desc);
comment on table public.team_messages is 'Nachrichten ans Team. Neueste wird auf der Startseite gezeigt.';

-- ----------------------------------------------------------------------------
-- RLS: lesen für eingeloggte; schreiben nur als man selbst; löschen eigene/Admin.
-- ----------------------------------------------------------------------------
alter table public.team_messages enable row level security;

create policy team_messages_select on public.team_messages
  for select to authenticated using (auth.uid() is not null);
create policy team_messages_insert_self on public.team_messages
  for insert to authenticated with check (author_id = auth.uid());
create policy team_messages_delete_own_or_admin on public.team_messages
  for delete to authenticated using (author_id = auth.uid() or public.is_admin(auth.uid()));
