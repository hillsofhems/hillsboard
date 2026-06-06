-- ============================================================================
-- Hills of Hems Hub – 0007  Creative Area (Brainstorming)
-- ----------------------------------------------------------------------------
-- "Bubbles" zum Brainstormen:
--   * ideas          – eine Idee. parent_id NULL = Bubble (Top-Level-Thema);
--                      parent_id gesetzt = Idee, die zu einer Bubble gehört.
--                      author_id = wer es geschrieben hat (automatisch, wird
--                      klein angezeigt – man muss den Namen nie eintippen).
--   * idea_reactions – 💡-Reaktionen pro Nutzer (max. 1 pro Idee/Nutzer).
-- ============================================================================

create table if not exists public.ideas (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.ideas (id) on delete cascade,
  content    text not null,
  author_id  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ideas_parent_idx on public.ideas (parent_id);
comment on table public.ideas is 'Brainstorming-Ideen. parent_id NULL = Bubble (Thema), sonst Idee zur Bubble.';

create table if not exists public.idea_reactions (
  idea_id    uuid not null references public.ideas (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);

comment on table public.idea_reactions is '💡-Reaktionen: eine pro Nutzer und Idee.';

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.ideas          enable row level security;
alter table public.idea_reactions enable row level security;

-- ideas: lesen für eingeloggte; schreiben nur als man selbst (author_id = uid);
-- bearbeiten nur eigene; löschen eigene oder als Admin.
create policy ideas_select on public.ideas
  for select to authenticated using (auth.uid() is not null);
create policy ideas_insert_self on public.ideas
  for insert to authenticated with check (author_id = auth.uid());
create policy ideas_update_own on public.ideas
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy ideas_delete_own_or_admin on public.ideas
  for delete to authenticated using (author_id = auth.uid() or public.is_admin(auth.uid()));

-- idea_reactions: lesen für eingeloggte; nur eigene Reaktion setzen/entfernen.
create policy idea_reactions_select on public.idea_reactions
  for select to authenticated using (auth.uid() is not null);
create policy idea_reactions_insert_self on public.idea_reactions
  for insert to authenticated with check (user_id = auth.uid());
create policy idea_reactions_delete_self on public.idea_reactions
  for delete to authenticated using (user_id = auth.uid());
