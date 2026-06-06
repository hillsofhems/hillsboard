-- ============================================================================
-- Hills of Hems Hub – 0006  To-dos auch ohne Karte (Daily Business)
-- ----------------------------------------------------------------------------
-- Bisher gehörte jedes To-do zwingend zu einer Karte. Jetzt darf card_id NULL
-- sein: solche To-dos werden direkt auf der To-do-Seite angelegt und laufen
-- unter "Daily Business" (kein Projekt verknüpft). Mit Karte = Projekt-To-do.
-- Die FK-Beziehung (on delete cascade) bleibt erhalten und greift nur, wenn
-- eine Karte gesetzt ist.
-- ============================================================================

alter table public.card_todos
  alter column card_id drop not null;

comment on column public.card_todos.card_id is
  'Zugehörige Karte/Projekt. NULL = "Daily Business" (direkt auf der To-do-Seite angelegt).';
