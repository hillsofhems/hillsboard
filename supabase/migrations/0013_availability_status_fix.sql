-- ============================================================================
-- Hills of Hems Hub – 0013  Verfügbarkeit: Status 'maybe' -> 'unavailable'
-- ----------------------------------------------------------------------------
-- Nur nötig, wenn 0012 in einer früheren Variante (mit 'maybe') schon
-- eingespielt wurde. Stellt die Stufen auf:
--   available  = da (grün)
--   unavailable = kann nicht (rot)
-- Idempotent: kann gefahrlos (auch mehrfach) ausgeführt werden.
-- ============================================================================

-- Bestehende 'maybe'-Einträge auf 'unavailable' überführen.
update public.availability set status = 'unavailable' where status = 'maybe';

-- Check-Constraint neu setzen (alter Name kann variieren -> dynamisch entfernen).
do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.availability'::regclass and contype = 'c'
  loop
    execute format('alter table public.availability drop constraint %I', c);
  end loop;
end $$;

alter table public.availability
  add constraint availability_status_check check (status in ('available', 'unavailable'));
