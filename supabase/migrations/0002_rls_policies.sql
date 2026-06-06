-- ============================================================================
-- Hills of Hems Hub – 0002  Row Level Security (RLS) + Trigger/Helper
-- ----------------------------------------------------------------------------
-- SICHERHEITSMODELL
--   Der anon-Key liegt öffentlich im Frontend – die gesamte Sicherheit hängt
--   an diesen Policies. Grundregeln:
--     * RLS ist auf ALLEN Tabellen aktiviert.
--     * Rolle `anon` (nicht eingeloggt) darf NICHTS schreiben.
--       Alle Schreib-Policies sind `to authenticated` -> auth.uid() ist gesetzt.
--     * Kein `using(true)` / `with check(true)` für Schreibzugriff.
--     * roles / user_roles: Schreiben nur für Admins (is_admin()).
--     * profiles: nur eigenes Profil schreibbar; is_admin nicht selbst änderbar.
--   Der service_role-Key wird NIRGENDS im Frontend verwendet.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: is_admin(uid)
--   SECURITY DEFINER, damit die Funktion profiles lesen kann, ohne in den
--   RLS-Policies eine Rekursion auszulösen. Liest das is_admin-Flag.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = uid),
    false
  );
$$;

comment on function public.is_admin(uuid) is 'True, wenn der Nutzer Admin ist. SECURITY DEFINER, um RLS-Rekursion zu vermeiden.';

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Trigger: legt bei jeder Auth-Registrierung automatisch ein Profil an.
--   Name bleibt zunächst leer -> wird im Profil-Setup beim ersten Login gesetzt.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, coalesce(new.email, ''), '')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Trigger: schützt das is_admin-Flag.
--   * Server-seitig (SQL-Editor / service_role, auth.uid() IS NULL): erlaubt
--     – nötig, um den ersten Admin manuell zu setzen.
--   * Eingeloggter Nutzer: darf is_admin NUR an FREMDEN Profilen ändern und
--     NUR, wenn er selbst Admin ist. Nie am eigenen Profil.
-- ----------------------------------------------------------------------------
create or replace function public.guard_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin then
    -- Server-seitige Änderung (kein eingeloggter Nutzer) ist erlaubt.
    if auth.uid() is null then
      return new;
    end if;
    -- Nur Admins dürfen das Flag überhaupt ändern.
    if not public.is_admin(auth.uid()) then
      raise exception 'Nur Admins dürfen das is_admin-Flag ändern.';
    end if;
    -- Niemand darf das eigene is_admin-Flag ändern (keine Selbst-Eskalation).
    if auth.uid() = new.id then
      raise exception 'is_admin darf nicht am eigenen Profil geändert werden.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_is_admin_trg on public.profiles;
create trigger guard_is_admin_trg
  before update on public.profiles
  for each row execute function public.guard_is_admin();

-- ============================================================================
-- RLS aktivieren – auf ALLEN Tabellen
-- ============================================================================
alter table public.profiles            enable row level security;
alter table public.roles               enable row level security;
alter table public.user_roles          enable row level security;
alter table public.board_columns       enable row level security;
alter table public.board_cards         enable row level security;
alter table public.card_todos          enable row level security;
alter table public.meetings            enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.pages               enable row level security;
alter table public.page_blocks         enable row level security;
alter table public.file_links          enable row level security;

-- ============================================================================
-- profiles
-- ============================================================================
-- SELECT: jedes eingeloggte Team-Mitglied darf alle Profile sehen
--   (für Auswahllisten "Verantwortlicher", Teilnehmer, Avatare).
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (auth.uid() is not null);

-- INSERT: ein Nutzer darf nur sein EIGENES Profil anlegen (Fallback zum Trigger).
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

-- UPDATE (eigenes Profil): Name/E-Mail pflegen. is_admin-Schutz via Trigger.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- UPDATE (Admins): dürfen fremde Profile ändern (z. B. is_admin setzen).
--   Eigenes is_admin bleibt durch den Trigger gesperrt.
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Kein DELETE-Policy: Profile werden über das Löschen des Auth-Users (cascade)
-- entfernt, nicht über das Frontend.

-- ============================================================================
-- roles  (Lesen: alle eingeloggt | Schreiben: nur Admins)
-- ============================================================================
create policy roles_select_authenticated on public.roles
  for select to authenticated
  using (auth.uid() is not null);

create policy roles_insert_admin on public.roles
  for insert to authenticated
  with check (public.is_admin(auth.uid()));

create policy roles_update_admin on public.roles
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy roles_delete_admin on public.roles
  for delete to authenticated
  using (public.is_admin(auth.uid()));

-- ============================================================================
-- user_roles  (Lesen: alle eingeloggt | Schreiben: nur Admins)
-- ============================================================================
create policy user_roles_select_authenticated on public.user_roles
  for select to authenticated
  using (auth.uid() is not null);

create policy user_roles_insert_admin on public.user_roles
  for insert to authenticated
  with check (public.is_admin(auth.uid()));

create policy user_roles_delete_admin on public.user_roles
  for delete to authenticated
  using (public.is_admin(auth.uid()));

-- ============================================================================
-- Team-Tabellen: Lesen + Schreiben für alle eingeloggten Team-Mitglieder.
-- Bewusst KEIN `using(true)` – immer auth.uid() is not null bzw. to authenticated.
-- ============================================================================

-- ---- board_columns --------------------------------------------------------
create policy board_columns_select on public.board_columns
  for select to authenticated using (auth.uid() is not null);
create policy board_columns_insert on public.board_columns
  for insert to authenticated with check (auth.uid() is not null);
create policy board_columns_update on public.board_columns
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy board_columns_delete on public.board_columns
  for delete to authenticated using (auth.uid() is not null);

-- ---- board_cards ----------------------------------------------------------
create policy board_cards_select on public.board_cards
  for select to authenticated using (auth.uid() is not null);
create policy board_cards_insert on public.board_cards
  for insert to authenticated with check (auth.uid() is not null);
create policy board_cards_update on public.board_cards
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy board_cards_delete on public.board_cards
  for delete to authenticated using (auth.uid() is not null);

-- ---- card_todos -----------------------------------------------------------
create policy card_todos_select on public.card_todos
  for select to authenticated using (auth.uid() is not null);
create policy card_todos_insert on public.card_todos
  for insert to authenticated with check (auth.uid() is not null);
create policy card_todos_update on public.card_todos
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy card_todos_delete on public.card_todos
  for delete to authenticated using (auth.uid() is not null);

-- ---- meetings -------------------------------------------------------------
create policy meetings_select on public.meetings
  for select to authenticated using (auth.uid() is not null);
create policy meetings_insert on public.meetings
  for insert to authenticated with check (auth.uid() is not null);
create policy meetings_update on public.meetings
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy meetings_delete on public.meetings
  for delete to authenticated using (auth.uid() is not null);

-- ---- meeting_participants -------------------------------------------------
create policy meeting_participants_select on public.meeting_participants
  for select to authenticated using (auth.uid() is not null);
create policy meeting_participants_insert on public.meeting_participants
  for insert to authenticated with check (auth.uid() is not null);
create policy meeting_participants_delete on public.meeting_participants
  for delete to authenticated using (auth.uid() is not null);

-- ---- pages ----------------------------------------------------------------
create policy pages_select on public.pages
  for select to authenticated using (auth.uid() is not null);
create policy pages_insert on public.pages
  for insert to authenticated with check (auth.uid() is not null);
create policy pages_update on public.pages
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy pages_delete on public.pages
  for delete to authenticated using (auth.uid() is not null);

-- ---- page_blocks ----------------------------------------------------------
create policy page_blocks_select on public.page_blocks
  for select to authenticated using (auth.uid() is not null);
create policy page_blocks_insert on public.page_blocks
  for insert to authenticated with check (auth.uid() is not null);
create policy page_blocks_update on public.page_blocks
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy page_blocks_delete on public.page_blocks
  for delete to authenticated using (auth.uid() is not null);

-- ---- file_links -----------------------------------------------------------
create policy file_links_select on public.file_links
  for select to authenticated using (auth.uid() is not null);
create policy file_links_insert on public.file_links
  for insert to authenticated with check (auth.uid() is not null);
create policy file_links_update on public.file_links
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy file_links_delete on public.file_links
  for delete to authenticated using (auth.uid() is not null);
