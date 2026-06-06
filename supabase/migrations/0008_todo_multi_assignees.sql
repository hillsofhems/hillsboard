-- ============================================================================
-- Hills of Hems Hub – 0008  To-dos: mehrere Personen oder ganzes Team
-- ----------------------------------------------------------------------------
-- Bisher hatte ein To-do genau einen Verantwortlichen (assignee_id). Jetzt:
--   * card_todo_assignees – m:n, mehrere Personen pro To-do
--   * card_todos.is_team  – true = ganze Mannschaft ("Team")
-- Bestehende Einzel-Zuweisungen werden in die neue Tabelle übernommen.
-- assignee_id bleibt als Legacy-Spalte bestehen (wird vom UI nicht mehr genutzt).
-- ============================================================================

alter table public.card_todos
  add column if not exists is_team boolean not null default false;

comment on column public.card_todos.is_team is 'true = dem ganzen Team zugewiesen.';

create table if not exists public.card_todo_assignees (
  todo_id uuid not null references public.card_todos (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (todo_id, user_id)
);

create index if not exists card_todo_assignees_user_idx on public.card_todo_assignees (user_id);
comment on table public.card_todo_assignees is 'Mehrfach-Zuweisung von To-dos an Personen.';

-- Bestehende Einzel-Zuweisungen migrieren
insert into public.card_todo_assignees (todo_id, user_id)
select id, assignee_id
from public.card_todos
where assignee_id is not null
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- RLS: wie die übrigen Team-Tabellen – lesen/schreiben für eingeloggte Nutzer.
-- ----------------------------------------------------------------------------
alter table public.card_todo_assignees enable row level security;

create policy card_todo_assignees_select on public.card_todo_assignees
  for select to authenticated using (auth.uid() is not null);
create policy card_todo_assignees_insert on public.card_todo_assignees
  for insert to authenticated with check (auth.uid() is not null);
create policy card_todo_assignees_delete on public.card_todo_assignees
  for delete to authenticated using (auth.uid() is not null);
