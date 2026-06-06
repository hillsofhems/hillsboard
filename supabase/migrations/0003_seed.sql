-- ============================================================================
-- Hills of Hems Hub – 0003  Seed-Daten
-- ----------------------------------------------------------------------------
-- Befüllt:
--   * roles            – alle Funktionsbereiche/Rollen der Firma
--   * board_columns    – 5 Standard-Kanban-Spalten
--   * pages/page_blocks– Beispiel-Seite "Willkommen" (Text + Tabelle)
--   * file_links       – je 1 Beispiel pro Kategorie (Finanzen, Produktion, …)
-- Jeder Block ist idempotent (läuft nur, wenn die Tabelle noch leer ist),
-- damit ein erneutes Einspielen keine Duplikate erzeugt.
-- ============================================================================

-- ---- Rollen ----------------------------------------------------------------
insert into public.roles (position, funktionsbereich, rolle, beschreibung, verantwortlicher, weitere_personen)
select * from (values
  (1,  'E-Commerce',          'Shop-Management & Wartung',        'Shopify pflegen: Produkte, Preise, Inventar, Theme, Apps, Checkout',            'Tom',     ''),
  (2,  'E-Commerce',          'Produktfotografie & Bildbearbeitung','Produktfotos, Lifestyle-Shots, Formatierung für Kanäle',                     'Tom',     'Silke'),
  (3,  'E-Commerce',          'SEO & Content',                    'Produktbeschreibungen, Meta-Texte, Blog, Kategorie-Texte, Keywords',           'Tom',     ''),
  (4,  'Online Marketing',    'Pinterest',                        'Pins, Boards, Keywords, Pinterest Ads',                                        'Tom',     ''),
  (5,  'Online Marketing',    'Instagram',                        'Content-Plan, Reels, Stories, Community Management',                            'Tom',     'Engelin'),
  (6,  'Online Marketing',    'Meta Ads',                         'Kampagnen, Creatives, Targeting, Budget, A/B-Tests',                            'Tom',     ''),
  (7,  'Online Marketing',    'Newsletter / E-Mail',              'Welcome-Sequenz, Newsletter, Automationen',                                     'Tom',     ''),
  (8,  'Online Marketing',    'Performance & Reporting',          'Analytics, Dashboards, monatliches Reporting',                                  'Tom',     ''),
  (9,  'Design',              'Produkt- & Muster-Design',         'Illustrationen, Muster, Motive für Keramik & Textilien',                        'Engelin', ''),
  (10, 'Design',              'Packaging-Design',                 'Verpackung, Etiketten, Beilagekarten, Banderolen',                              'Engelin', ''),
  (11, 'Design',              'Marken-Identität',                 'Logo, Farben, Typo, Bildstil, Brand Guidelines',                                'Engelin', ''),
  (12, 'Produktentwicklung',  'Kollektion-Planung',               'Saisonale Kollektionen, Farbportfolio, Sortiment',                              'Engelin', 'TEAM'),
  (13, 'Produktentwicklung',  'Prototypen Keramik',               'Muster anfordern, Qualität prüfen, Freigabe',                                   'Engelin', 'TEAM'),
  (14, 'Produktentwicklung',  'Prototypen Textilien',             'Muster anfordern, Qualität prüfen, Freigabe',                                   'Engelin', 'TEAM'),
  (15, 'Beschaffung',         'Lieferanten Keramik',              'Manufaktur, Bestellungen, Lieferzeiten, QA, Nachbestellung',                    '???',     ''),
  (16, 'Beschaffung',         'Lieferanten Textilien',            'Stoff, Druckerei, Waffelpiqué, Leinen, Bestellungen + QA',                      'Bee',     ''),
  (17, 'Beschaffung',         'Verpackungsmaterial',              'Kartons, Seidenpapier, Füllmaterial, Etiketten',                                'Silke',   ''),
  (18, 'Produktion',          'Lagerhaltung & Inventar',          'Bestände, Mindestbestände, Nachbestellung, Shopify-Sync',                       'Silke',   ''),
  (19, 'Produktion',          'Qualitätskontrolle',               'Eingangsware prüfen, Reklamationen',                                            'Silke',   ''),
  (20, 'Logistik',            'Bestellabwicklung & Verpacken',    'Shopify-Bestellungen, bruchsicher verpacken, Versandlabel',                     'Silke',   'Tom'),
  (21, 'Logistik',            'Versanddienstleister',             'DHL/DPD/GLS, Preise, Sendungsverfolgung, Retouren-Logistik',                    'Tom',     ''),
  (22, 'Logistik',            'Retouren & Bruch',                 'Retouren prüfen, erstatten, Bruchquote dokumentieren',                          'Silke',   ''),
  (23, 'B2B',                 'Gastronomie-Vertrieb',             'Restaurants, Cafés, Hotels akquirieren, Muster, Beziehungspflege',              'Bee',     ''),
  (24, 'B2B',                 'Retail / Concept Stores',          'Concept Stores, Boutiquen, B2B-Preisliste, Lookbook',                           'Bee',     ''),
  (25, 'B2B',                 'Markt-Präsenz & Events',           'Märkte organisieren, Standmiete, Personal, Kasse',                              'Bee',     ''),
  (26, 'B2B',                 'Corporate Gifting',                'Firmengeschenk-Programm, Angebote, Logo-Optionen',                              '-',       ''),
  (27, 'Finanzen',            'Buchhaltung',                      'Rechnungen, UStVA, Steuerberater, Belege, DATEV',                               'Silke',   ''),
  (28, 'Finanzen',            'Kalkulation & Preise',             'Produktkosten, Margen, Preise, Bundles, B2B-Staffeln',                          'Bee',     'Tom'),
  (29, 'Finanzen',            'Cash-Flow & Budget',               'Liquidität, Marketing-Budget, Investitionen, Monatsabschluss',                  'Bee',     'Tom'),
  (30, 'Management',          'Strategie & Markenführung',        'Positionierung, Sortiment, Preispolitik, Wachstum',                             'Tom',     'ALLE'),
  (31, 'Management',          'Team-Koordination',                'Wöchentliche Abstimmung, Konflikte lösen, Freigaben',                           'Tom',     ''),
  (32, 'Management',          'Rechtliches & Compliance',         'Impressum, AGB, DSGVO, Verpackungsgesetz, Widerruf',                            'Tom',     ''),
  (33, 'Kundenservice',       'E-Mail-Support',                   'Anfragen beantworten, Beschwerden, freundlich + schnell',                       'Silke',   'Bee, Tom'),
  (34, 'Kundenservice',       'Bewertungs-Management',            'Reviews monitoren (Judge.me, Google), antworten, UGC',                          'Tom',     ''),
  (35, 'Kundenservice',       'After-Sales & Kundenbindung',      'Follow-up, Dankeskärtchen, Stammkunden-Programm',                               'Silke',   '')
) as v(position, funktionsbereich, rolle, beschreibung, verantwortlicher, weitere_personen)
where not exists (select 1 from public.roles);

-- ---- Kanban-Standardspalten ------------------------------------------------
insert into public.board_columns (position, label)
select * from (values
  (1, 'Winter / XMAS 2026'),
  (2, 'Frühling 2027'),
  (3, 'Sommer 2027'),
  (4, 'Herbst 2027'),
  (5, 'Laufend')
) as v(position, label)
where not exists (select 1 from public.board_columns);

-- ---- Beispiel-Seite "Willkommen" (Text- + Tabellen-Block) ------------------
do $$
declare
  v_page_id uuid;
begin
  if not exists (select 1 from public.pages) then
    insert into public.pages (title, position)
    values ('Willkommen', 0)
    returning id into v_page_id;

    -- Text-Block (einfaches Rich-Text-HTML)
    insert into public.page_blocks (page_id, type, content, position)
    values (
      v_page_id,
      'text',
      jsonb_build_object(
        'html',
        '<h2>Willkommen im Hills of Hems Hub</h2>' ||
        '<p>Das ist unsere interne Team-Zentrale. Hier planen wir Kollektionen, ' ||
        'halten Meetings fest, verwalten To-dos und sammeln wichtige Links.</p>' ||
        '<h3>Erste Schritte</h3>' ||
        '<ul>' ||
        '<li><strong>Team &amp; Rollen</strong> – wer macht was.</li>' ||
        '<li><strong>Board</strong> – Saison- und Projektplanung als Kanban.</li>' ||
        '<li><strong>To-dos</strong> – Aufgaben pro Karte und persönlich.</li>' ||
        '<li><strong>Meetings</strong> – Termine mit Protokoll.</li>' ||
        '<li><strong>Dateien</strong> – wichtige Dokumente &amp; Links.</li>' ||
        '</ul>'
      ),
      0
    );

    -- Tabellen-Block (Beispiel: schnelle Team-Übersicht)
    insert into public.page_blocks (page_id, type, content, position)
    values (
      v_page_id,
      'table',
      jsonb_build_object(
        'columns', jsonb_build_array('Bereich', 'Ansprechpartner'),
        'rows', jsonb_build_array(
          jsonb_build_array('E-Commerce & Marketing', 'Tom'),
          jsonb_build_array('Design & Produktentwicklung', 'Engelin'),
          jsonb_build_array('Produktion & Logistik', 'Silke'),
          jsonb_build_array('B2B & Finanzen', 'Bee')
        )
      ),
      1
    );
  end if;
end $$;

-- ---- Datei-Links: Beispiele je Kategorie -----------------------------------
-- Demonstrieren die Standard-Kategorien. Können jederzeit gelöscht werden.
insert into public.file_links (name, url, category, description, source)
select * from (values
  ('Beispiel: Monatsabschluss',  'https://drive.google.com/', 'Finanzen',   'Hier den echten Link zum Finanz-Ordner eintragen.', 'manual'),
  ('Beispiel: Produktionsplan',  'https://drive.google.com/', 'Produktion', 'Platzhalter – durch echten Link ersetzen.',         'manual'),
  ('Beispiel: Content-Kalender', 'https://drive.google.com/', 'Marketing',  'Platzhalter – durch echten Link ersetzen.',         'manual'),
  ('Beispiel: Brand Guidelines', 'https://drive.google.com/', 'Design',     'Platzhalter – durch echten Link ersetzen.',         'manual')
) as v(name, url, category, description, source)
where not exists (select 1 from public.file_links);
