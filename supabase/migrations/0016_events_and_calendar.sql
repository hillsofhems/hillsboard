-- ============================================================================
-- Hills of Hems Hub – 0016  Termine (events) + Kalender-Abo-Token
-- ----------------------------------------------------------------------------
-- Zwei Dinge:
--   1) Neue Tabelle `events` = wichtige Termine (Märkte, Messen, Deadlines …).
--      Wird im Meetings-Tab unter „Termine" gepflegt und – zusammen mit den
--      Meetings – über den .ics-Feed (siehe api/calendar.ts) abonnierbar.
--   2) Pro Profil ein geheimer `calendar_token`. Er steckt in der Abo-URL
--      (webcal://…/api/calendar?token=…) und schützt den Feed vor anonymem
--      Zugriff. Der Feed-Inhalt ist für alle Team-Mitglieder identisch; der
--      Token ist lediglich das gemeinsame Zugangsgeheimnis pro Person.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) events: wichtige Termine (all-day oder mit Uhrzeit)
-- ----------------------------------------------------------------------------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,                         -- optional; NULL => 1 Std. (bzw. ganztägig)
  all_day     boolean not null default false,      -- true => Datum ohne Uhrzeit (z. B. Markt)
  location    text not null default '',            -- Ort (z. B. „Marktplatz Hamburg")
  category    text not null default '',            -- freie Kategorie (z. B. „Markt", „Messe")
  description text not null default '',             -- Freitext (Rich-Text-HTML)
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null
);

comment on table public.events is 'Wichtige Termine (Märkte, Messen, Deadlines). Erscheinen im Meetings-Tab „Termine" und im Kalender-Abo (.ics).';
comment on column public.events.all_day is 'true = ganztägiger Termin (Datum ohne Uhrzeit).';

create index if not exists events_starts_at_idx on public.events (starts_at);

-- ----------------------------------------------------------------------------
-- 2) profiles.calendar_token: geheimer Token für die Kalender-Abo-URL
--    gen_random_uuid() ist volatil -> jedes bestehende Profil bekommt beim
--    Hinzufügen automatisch einen eigenen, eindeutigen Token.
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists calendar_token uuid not null default gen_random_uuid();

comment on column public.profiles.calendar_token is 'Geheimer Token für die persönliche Kalender-Abo-URL (webcal). Regenerierbar durch den Nutzer.';

create unique index if not exists profiles_calendar_token_key on public.profiles (calendar_token);

-- ----------------------------------------------------------------------------
-- RLS: events wie die übrigen Team-Tabellen – Lesen/Schreiben für alle
-- eingeloggten Team-Mitglieder (kein anonymer Zugriff, kein using(true)).
-- ----------------------------------------------------------------------------
alter table public.events enable row level security;

create policy events_select on public.events
  for select to authenticated using (auth.uid() is not null);
create policy events_insert on public.events
  for insert to authenticated with check (auth.uid() is not null);
create policy events_update on public.events
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy events_delete on public.events
  for delete to authenticated using (auth.uid() is not null);
