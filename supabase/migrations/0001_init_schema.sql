-- ============================================================================
-- Hills of Hems Hub – 0001  Schema
-- ----------------------------------------------------------------------------
-- Legt alle Tabellen des Datenmodells an. RLS-Policies folgen in 0002.
-- Konventionen:
--   * UUID-Primärschlüssel (gen_random_uuid()).
--   * profiles.id == auth.users.id  (1:1 zum Supabase-Auth-User).
--   * Verweise auf Personen zeigen auf profiles(id).
--   * "position" (int) für sortierbare Listen (Spalten, Karten, To-dos, Blöcke).
-- ============================================================================

-- pgcrypto liefert gen_random_uuid() (in Supabase i.d.R. bereits aktiv)
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- profiles: 1 Zeile pro eingeloggtem Team-Mitglied
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  email       text not null default '',
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.profiles is 'Team-Mitglieder. id == auth.users.id. is_admin steuert Admin-Rechte.';

-- ----------------------------------------------------------------------------
-- roles: Funktionsbereiche / Rollen (frei editierbar im Admin-Bereich)
-- ----------------------------------------------------------------------------
create table if not exists public.roles (
  id               uuid primary key default gen_random_uuid(),
  funktionsbereich text not null,
  rolle            text not null,
  beschreibung     text not null default '',
  verantwortlicher text not null default '',     -- Freitext (Name), bewusst nicht FK
  weitere_personen text not null default '',     -- Freitext (z. B. "Silke, Tom" / "TEAM")
  position         integer not null default 0,
  created_at       timestamptz not null default now()
);

comment on table public.roles is 'Rollen/Funktionsbereiche der Firma. Verantwortliche als Freitext (auch "TEAM"/"ALLE"/"???").';

-- ----------------------------------------------------------------------------
-- user_roles: m:n Zuweisung von roles an profiles
-- ----------------------------------------------------------------------------
create table if not exists public.user_roles (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  role_id  uuid not null references public.roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

comment on table public.user_roles is 'Zuweisung: welcher Nutzer hat welche Rolle(n). Pflege im Admin-Bereich.';

-- ----------------------------------------------------------------------------
-- board_columns: Spalten des Kanban-Boards
-- ----------------------------------------------------------------------------
create table if not exists public.board_columns (
  id        uuid primary key default gen_random_uuid(),
  label     text not null,
  position  integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.board_columns is 'Kanban-Spalten, frei benennbar und sortierbar (position).';

-- ----------------------------------------------------------------------------
-- board_cards: Karten innerhalb einer Spalte
-- ----------------------------------------------------------------------------
create table if not exists public.board_cards (
  id          uuid primary key default gen_random_uuid(),
  column_id   uuid not null references public.board_columns (id) on delete cascade,
  title       text not null,
  description text not null default '',
  assignee_id uuid references public.profiles (id) on delete set null,
  label_color text,                              -- z. B. 'sage' | 'terracotta' | 'sand' | 'blue' | 'rose'
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists board_cards_column_idx on public.board_cards (column_id);
comment on table public.board_cards is 'Kanban-Karten. Beim Löschen der Spalte werden Karten mit entfernt.';

-- ----------------------------------------------------------------------------
-- card_todos: To-dos, die zu genau einer Karte gehören
-- ----------------------------------------------------------------------------
create table if not exists public.card_todos (
  id          uuid primary key default gen_random_uuid(),
  card_id     uuid not null references public.board_cards (id) on delete cascade,
  text        text not null,
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date    date,
  is_done     boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists card_todos_card_idx on public.card_todos (card_id);
create index if not exists card_todos_assignee_idx on public.card_todos (assignee_id);
comment on table public.card_todos is 'Sub-Aufgaben einer Karte. Erscheinen in der Karte und auf der To-do-Seite.';

-- ----------------------------------------------------------------------------
-- meetings: Termine mit Notizen/Protokoll
-- ----------------------------------------------------------------------------
create table if not exists public.meetings (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  meeting_date timestamptz not null default now(),
  notes        text not null default '',         -- einfacher Rich-Text (HTML)
  created_at   timestamptz not null default now()
);

comment on table public.meetings is 'Meetings/Termine. notes enthält das Protokoll als einfaches Rich-Text-HTML.';

-- ----------------------------------------------------------------------------
-- meeting_participants: m:n Teilnehmer eines Meetings
-- ----------------------------------------------------------------------------
create table if not exists public.meeting_participants (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  primary key (meeting_id, user_id)
);

comment on table public.meeting_participants is 'Teilnehmer pro Meeting (aus dem Team auswählbar).';

-- ----------------------------------------------------------------------------
-- pages: Info-Seiten (Container für Blöcke)
-- ----------------------------------------------------------------------------
create table if not exists public.pages (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default 'Neue Seite',
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.pages is 'Frei anlegbare Info-Seiten (erscheinen in der Sidebar).';

-- ----------------------------------------------------------------------------
-- page_blocks: Text- und Tabellen-Blöcke einer Seite
-- ----------------------------------------------------------------------------
create table if not exists public.page_blocks (
  id        uuid primary key default gen_random_uuid(),
  page_id   uuid not null references public.pages (id) on delete cascade,
  type      text not null check (type in ('text', 'table')),
  content   jsonb not null default '{}'::jsonb,  -- text: {"html": "..."} | table: {"columns": [...], "rows": [[...]]}
  position  integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists page_blocks_page_idx on public.page_blocks (page_id);
comment on table public.page_blocks is 'Blöcke einer Info-Seite. type=text|table, Inhalt in content (jsonb).';

-- ----------------------------------------------------------------------------
-- file_links: manuell gepflegte Links (Google Drive etc.)
-- "source" ist bereits jetzt vorhanden, damit später eine echte
-- Google-Drive-Integration ('gdrive') ergänzt werden kann.
-- ----------------------------------------------------------------------------
create table if not exists public.file_links (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  url         text not null,
  category    text not null default '',
  description text not null default '',
  source      text not null default 'manual' check (source in ('manual', 'gdrive')),
  created_at  timestamptz not null default now()
);

comment on table public.file_links is 'Datei-/Dokumenten-Links. source=manual jetzt; gdrive für spätere Drive-Integration.';
comment on column public.file_links.source is 'Herkunft: manual (manuell) oder gdrive (zukünftige Google-Drive-Integration).';
