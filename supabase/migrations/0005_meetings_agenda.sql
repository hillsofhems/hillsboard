-- ============================================================================
-- Hills of Hems Hub – 0005  Meetings: Agenda-Feld
-- ----------------------------------------------------------------------------
-- Trennt Planung und Nachbereitung eines Meetings:
--   * agenda  – vorab: Tagesordnung / Themen (einfaches Rich-Text-HTML)
--   * notes   – im Nachhinein: Protokoll / Minutes (bereits vorhanden)
-- Bestehende Meetings behalten ihr notes; agenda startet leer.
-- ============================================================================

alter table public.meetings
  add column if not exists agenda text not null default '';

comment on column public.meetings.agenda is 'Tagesordnung/Agenda (vorab). Protokoll steht in notes.';
