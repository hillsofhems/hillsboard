-- ============================================================================
-- Hills of Hems Hub – 0010  Finanzen
-- ----------------------------------------------------------------------------
-- Eine Tabelle für GuV UND Bilanz, unterschieden über "section":
--   income    = Einnahme  (GuV)
--   expense   = Ausgabe   (GuV)
--   asset     = Aktiva    (Bilanz)
--   liability = Passiva   (Bilanz)
-- Beträge immer positiv; das Vorzeichen/die Seite ergibt sich aus section.
-- Pro Jahr (year) auswählbar. 2025 wird mit den dokumentierten Zahlen geseedet.
-- ============================================================================

create table if not exists public.finance_entries (
  id          uuid primary key default gen_random_uuid(),
  year        integer not null,
  entry_date  date,
  section     text not null check (section in ('income', 'expense', 'asset', 'liability')),
  category    text not null default 'Sonstiges',
  description text not null default '',
  amount      numeric(12, 2) not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null
);

create index if not exists finance_entries_year_idx on public.finance_entries (year);
comment on table public.finance_entries is 'Finanzbuchungen (GuV + Bilanz) pro Jahr. section steuert Einnahme/Ausgabe/Aktiva/Passiva.';

-- ----------------------------------------------------------------------------
-- RLS: lesen + schreiben für eingeloggte Team-Mitglieder.
-- ----------------------------------------------------------------------------
alter table public.finance_entries enable row level security;

create policy finance_select on public.finance_entries
  for select to authenticated using (auth.uid() is not null);
create policy finance_insert on public.finance_entries
  for insert to authenticated with check (auth.uid() is not null);
create policy finance_update on public.finance_entries
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy finance_delete on public.finance_entries
  for delete to authenticated using (auth.uid() is not null);

-- ----------------------------------------------------------------------------
-- Seed 2025 (aus "Finanzen 2025 Zusammenfassung" / DATEV). Nur falls leer.
-- ----------------------------------------------------------------------------
insert into public.finance_entries (year, entry_date, section, category, description, amount)
select 2025, d, s, c, descr, amt
from (values
  -- Einnahmen nach Kanal (Summe = 23.806,58 €, exakt; Sonstiges als Ausgleich)
  ('2025-12-31'::date, 'income',  'Privatverkauf',         'PayPal-Einzelrechnungen Privatkunden',                      5800.00),
  ('2025-12-31'::date, 'income',  'Märkte & Events',       'SumUp (Steißlingen, Laibach, BV-Events)',                   4200.00),
  ('2025-12-31'::date, 'income',  'Online-Shop',           'Stripe/Shopify (online)',                                   1685.00),
  ('2025-12-31'::date, 'income',  'B2B',                   'Schreinerfarm, LaLü, Weckbach, Brand KG, Fielmann',         4100.00),
  ('2025-12-31'::date, 'income',  'Weihnachtsmärkte',      'WE 1-4, BV Steißlingen (Dezember)',                         6000.00),
  ('2025-12-31'::date, 'income',  'Mannheimer Morgen',     'Zwei Buchungen (1.020 € + 68 €)',                           1088.00),
  ('2025-12-31'::date, 'income',  'Sonstiges',             'Bareinnahmen, Einzelposten',                                 933.58),
  -- Ausgaben: Wareneinsatz (COGS)
  ('2025-12-31'::date, 'expense', 'Wareneinkauf',          'Porzellaneinkauf (Nanjing Kimming, Magic Joy)',             5471.59),
  ('2025-12-31'::date, 'expense', 'EU-Erwerb',             'Textileinkauf (SN Textil, Colmaco, tica, JR Home)',        10211.88),
  ('2025-12-31'::date, 'expense', 'Wareneinkauf',          'WEK 19 % (Flyeralarm, Sommerauer)',                          326.91),
  ('2025-12-31'::date, 'expense', 'Zölle & Fracht',        'Zölle & Einfuhrabgaben (HST)',                              1139.35),
  ('2025-12-31'::date, 'expense', 'Zölle & Fracht',        'Bezugsnebenkosten (Shopify Versand, HST Seefracht)',        1069.76),
  -- Ausgaben: Betriebsausgaben (OpEx)
  ('2025-12-31'::date, 'expense', 'Marketing',             'Werbekosten / Deko / Standdeko',                            4129.10),
  ('2025-12-31'::date, 'expense', 'Logistik & Versand',    'Ausgangsfrachten (DHL, UPS)',                               1052.56),
  ('2025-12-31'::date, 'expense', 'Logistik & Versand',    'Verpackungsmaterial HoH (DimaPax, Böttcher, Medewo)',        323.42),
  ('2025-12-31'::date, 'expense', 'Logistik & Versand',    'Verpackungsmaterial (Amazon Thermoetiketten)',               10.88),
  ('2025-12-31'::date, 'expense', 'Fixkosten & Software',  'Sonstige betriebl. Aufwendungen (Etsy, Google Ads, Shopify)', 2201.25),
  ('2025-12-31'::date, 'expense', 'Fixkosten & Software',  'Sonstiger Betriebsbedarf',                                    50.41),
  ('2025-12-31'::date, 'expense', 'Miete',                 'Miete Lagerraum (10 × 300 €)',                              3000.00),
  -- Bilanz: Aktiva (dokumentiert)
  ('2025-12-31'::date, 'asset',   'Lagerbestand',          'Inventurwert 31.12.2025 (landed cost)',                     6729.80)
) as v(d, s, c, descr, amt)
where not exists (select 1 from public.finance_entries where year = 2025);
