-- ============================================================================
-- Hills of Hems Hub – 0009  Zweites Board "Daily Business"
-- ----------------------------------------------------------------------------
-- Bisher gab es ein einziges Board. Jetzt unterscheiden wir per board-Schlüssel:
--   * 'season' = Saisonplanung (bestehende Spalten Winter/XMAS 2026 …)
--   * 'daily'  = Daily Business (Webseite, Social Media, B2B, B2C, Märkte)
-- Karten hängen an Spalten -> ihr Board ergibt sich aus der Spalte.
-- ============================================================================

alter table public.board_columns
  add column if not exists board text not null default 'season';

comment on column public.board_columns.board is
  'Board-Zuordnung: season (Saisonplanung) | daily (Daily Business).';

-- Standardspalten fürs Daily-Business-Board (nur falls noch keine vorhanden).
insert into public.board_columns (board, position, label)
select 'daily', v.position, v.label
from (values
  (1, 'Webseite'),
  (2, 'Social Media'),
  (3, 'B2B'),
  (4, 'B2C'),
  (5, 'Märkte')
) as v(position, label)
where not exists (select 1 from public.board_columns where board = 'daily');
