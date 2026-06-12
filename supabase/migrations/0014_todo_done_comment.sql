-- ============================================================================
-- Hills of Hems Hub – 0014  To-dos: Abschluss-Kommentar
-- ----------------------------------------------------------------------------
-- Beim Abhaken eines To-dos kann (optional) eine Notiz hinterlassen werden.
-- Zusätzlich wird festgehalten, WER wann abgehakt hat – für eine saubere
-- Übersicht über erledigte Aufgaben mit allen Infos.
--   * done_comment – freie Notiz zum Abschluss (optional)
--   * done_at      – Zeitpunkt des Abhakens
--   * done_by      – wer abgehakt hat
-- ============================================================================

alter table public.card_todos
  add column if not exists done_comment text,
  add column if not exists done_at      timestamptz,
  add column if not exists done_by       uuid references public.profiles (id) on delete set null;

comment on column public.card_todos.done_comment is 'Optionale Notiz beim Abhaken des To-dos.';
comment on column public.card_todos.done_at is 'Zeitpunkt des Abhakens (NULL = offen).';
comment on column public.card_todos.done_by is 'Wer das To-do abgehakt hat.';
