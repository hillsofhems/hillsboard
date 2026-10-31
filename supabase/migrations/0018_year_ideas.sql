-- ============================================================================
-- Hills of Hems Hub – 0018  Ideen 2027 (private Jahres-Ideen je Person)
-- ----------------------------------------------------------------------------
-- Reiter „Ideen 2027" in der Creative Area. Jede Person trägt ihre eigenen
-- Ideen für ein Jahr ein und sortiert sie per Drag & Drop (Reihenfolge =
-- persönliche Priorität). Sichtbar sind die Ideen NUR für den Autor selbst
-- und für Admins (nur lesend). Das wird hier per RLS erzwungen, nicht nur im
-- Frontend.
--
--   * year_idea_areas – Bereiche (z. B. Produkt, Vertrieb …) mit Label-Farbe.
--                       Lesen alle, pflegen nur Admins.
--   * year_ideas      – eine Idee. year = Zieljahr (2027, später 2028 …),
--                       author_id = wer sie eingetragen hat, position = Rang.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: updated_at automatisch pflegen (existiert ggf. schon aus 0017)
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1) year_idea_areas: Bereiche mit Farbe (Schlüssel wie LABEL_COLORS im Frontend)
-- ----------------------------------------------------------------------------
create table if not exists public.year_idea_areas (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  color      text not null default 'sage'
             check (color in ('sage', 'terracotta', 'sand', 'blue', 'rose', 'amber')),
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.year_idea_areas is 'Bereiche für die Jahres-Ideen (Ideen 2027). Pflegen nur Admins.';

-- Startbereiche – nur anlegen, wenn die Tabelle noch leer ist.
insert into public.year_idea_areas (label, color, position)
select v.label, v.color, v.position
from (values
  ('Produkt',      'sage',       0),
  ('Vertrieb',     'blue',       1),
  ('Marketing',    'terracotta', 2),
  ('Organisation', 'sand',       3)
) as v (label, color, position)
where not exists (select 1 from public.year_idea_areas);

-- ----------------------------------------------------------------------------
-- 2) year_ideas: eine Idee je Zeile, privat je Autor
-- ----------------------------------------------------------------------------
create table if not exists public.year_ideas (
  id         uuid primary key default gen_random_uuid(),
  year       integer not null,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  area_id    uuid references public.year_idea_areas (id) on delete set null,
  title      text not null,
  content    text not null default '',
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.year_ideas is 'Private Jahres-Ideen (Ideen 2027). Sichtbar nur für Autor und Admins; position = persönliche Reihenfolge.';
comment on column public.year_ideas.year is 'Zieljahr der Idee, z. B. 2027.';
comment on column public.year_ideas.position is 'Reihenfolge innerhalb der eigenen Liste (0 = oben = wichtigste).';

create index if not exists year_ideas_author_year_idx
  on public.year_ideas (author_id, year, position);

drop trigger if exists year_ideas_updated_at on public.year_ideas;
create trigger year_ideas_updated_at
  before update on public.year_ideas
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.year_idea_areas enable row level security;
alter table public.year_ideas      enable row level security;

-- Bereiche: lesen alle eingeloggten, schreiben nur Admins.
drop policy if exists year_idea_areas_select on public.year_idea_areas;
create policy year_idea_areas_select on public.year_idea_areas
  for select to authenticated using (auth.uid() is not null);
drop policy if exists year_idea_areas_insert_admin on public.year_idea_areas;
create policy year_idea_areas_insert_admin on public.year_idea_areas
  for insert to authenticated with check (public.is_admin(auth.uid()));
drop policy if exists year_idea_areas_update_admin on public.year_idea_areas;
create policy year_idea_areas_update_admin on public.year_idea_areas
  for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists year_idea_areas_delete_admin on public.year_idea_areas;
create policy year_idea_areas_delete_admin on public.year_idea_areas
  for delete to authenticated using (public.is_admin(auth.uid()));

-- Ideen: lesen nur Autor oder Admin. Anlegen/ändern/löschen nur der Autor
-- selbst – Admins sehen alles, verändern aber nichts (nur lesend).
drop policy if exists year_ideas_select_own_or_admin on public.year_ideas;
create policy year_ideas_select_own_or_admin on public.year_ideas
  for select to authenticated
  using (author_id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists year_ideas_insert_self on public.year_ideas;
create policy year_ideas_insert_self on public.year_ideas
  for insert to authenticated with check (author_id = auth.uid());
drop policy if exists year_ideas_update_own on public.year_ideas;
create policy year_ideas_update_own on public.year_ideas
  for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists year_ideas_delete_own on public.year_ideas;
create policy year_ideas_delete_own on public.year_ideas
  for delete to authenticated using (author_id = auth.uid());
