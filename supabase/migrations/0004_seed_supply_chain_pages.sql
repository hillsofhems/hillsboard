-- ============================================================================
-- Hills of Hems Hub – 0004  Seed: Info-Seiten "Supply Chain"
-- ----------------------------------------------------------------------------
-- Legt zwei Info-Seiten mit Text- und Tabellen-Blöcken an:
--   * "Supply Chain Textil"  (Portugal -> Deutschland)
--   * "Supply Chain Keramik" (China -> Deutschland)
-- Idempotent: jede Seite wird nur angelegt, wenn sie noch nicht existiert
-- (geprüft über den Titel). Erneutes Ausführen erzeugt keine Duplikate.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Seite 1: Supply Chain Textil
-- ----------------------------------------------------------------------------
do $$
declare
  v_page_id uuid;
  v_pos     integer := 0;
begin
  if not exists (select 1 from public.pages where title = 'Supply Chain Textil') then
    insert into public.pages (title, position)
    values ('Supply Chain Textil', (select coalesce(max(position), -1) + 1 from public.pages))
    returning id into v_page_id;

    -- Block: Einleitung / Lieferkette
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'text',
      jsonb_build_object('html',
        '<h2>Textil-Lieferkette (Portugal → Deutschland)</h2>' ||
        '<p>Textilien werden als innergemeinschaftlicher Erwerb (EU-Erwerb) aus Portugal bezogen. ' ||
        'Hauptlieferant ist <strong>Texteis Colmaco Lda.</strong> (Guimarães, Portugal), ergänzt durch ' ||
        '<strong>JR Home</strong> (Daniela Matos, Portugal) sowie kleinere Bezüge von SN Textil und tica.</p>' ||
        '<p><strong>Gesamtvolumen Textil 2025 (EU-Erwerb): €10.211,88</strong></p>'),
      v_pos); v_pos := v_pos + 1;

    -- Block: Colmaco-Bestellung Juli 2025 + Überschrift Waffel-Tücher
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'text',
      jsonb_build_object('html',
        '<h2>Letzte Textil-Bestellung: Colmaco (Juli 2025)</h2>' ||
        '<p><strong>Pro-Forma:</strong> FPF 25/117 · Datum: 07.07.2025</p>' ||
        '<p><strong>Gesamtwert:</strong> €6.260,00 (1.500 Stück) · <strong>Lieferbedingung:</strong> EXW Guimarães</p>' ||
        '<h3>Waffel-Tücher 50×50 cm (Ref. CLC323)</h3>'),
      v_pos); v_pos := v_pos + 1;

    -- Tabelle: Waffel-Tücher 50×50
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'table',
      jsonb_build_object(
        'columns', jsonb_build_array('Farbe','Pantone','Menge','Stückpreis (€)','Gesamt (€)','Anmerkung'),
        'rows', jsonb_build_array(
          jsonb_build_array('Grey','—','200','€4,40','€880',''),
          jsonb_build_array('Sage','—','200','€4,40','€880',''),
          jsonb_build_array('Sand','—','200','€4,40','€880',''),
          jsonb_build_array('Navy','—','200','€4,40','€880',''),
          jsonb_build_array('Red','—','300','€4,40','€1.320','X-Mas Towel'),
          jsonb_build_array('Zwischensumme 50×50','','1.100','','€4.840','')
        )),
      v_pos); v_pos := v_pos + 1;

    -- Block: Überschrift Servietten
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'text',
      jsonb_build_object('html', '<h3>Waffel-Servietten 40×40 cm, 2er-Set (Ref. CLC323)</h3>'),
      v_pos); v_pos := v_pos + 1;

    -- Tabelle: Servietten 40×40
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'table',
      jsonb_build_object(
        'columns', jsonb_build_array('Farbe','Pantone','Menge (Sets)','Stückpreis (€)','Gesamt (€)'),
        'rows', jsonb_build_array(
          jsonb_build_array('Grey','—','100','€3,55','€355'),
          jsonb_build_array('Sage','—','100','€3,55','€355'),
          jsonb_build_array('Sand','—','100','€3,55','€355'),
          jsonb_build_array('Navy','—','100','€3,55','€355'),
          jsonb_build_array('Zwischensumme 40×40','','400','','€1.420')
        )),
      v_pos); v_pos := v_pos + 1;

    -- Block: Gesamtbestellung + Leinen-Optionen + Überschrift Preisvergleich
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'text',
      jsonb_build_object('html',
        '<p><strong>Colmaco Gesamtbestellung: €6.260,00 (1.500 Stück)</strong></p>' ||
        '<h3>Zurückgestellte Optionen (Leinen)</h3>' ||
        '<p>Folgende Leinen-Optionen wurden im Juli 2025 vorerst zurückgestellt („do later"):</p>' ||
        '<ul>' ||
        '<li>REF 1151CLC — Leinentuch @ €4,85/Stk</li>' ||
        '<li>REF 1767CLC — Leinentuch @ €3,96/Stk</li>' ||
        '</ul>' ||
        '<h2>Preisvergleich Textil-Lieferanten</h2>'),
      v_pos); v_pos := v_pos + 1;

    -- Tabelle: Preisvergleich
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'table',
      jsonb_build_object(
        'columns', jsonb_build_array('Produkt','JR Home (Daniela)','Colmaco','Differenz'),
        'rows', jsonb_build_array(
          jsonb_build_array('Waffel 50×50','€3,05','€4,40','+€1,35 (Colmaco teurer)'),
          jsonb_build_array('Serviette 40×40','€4,55','€3,55','−€1,00 (Colmaco günstiger)')
        )),
      v_pos); v_pos := v_pos + 1;

    -- Block: Split-Sourcing-Empfehlung + Überschrift Aufteilung
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'text',
      jsonb_build_object('html',
        '<p><strong>Split-Sourcing-Empfehlung:</strong> Waffel 50×50 bei JR Home bestellen (spart €1,35/Stk), ' ||
        'Servietten 40×40 bei Colmaco belassen (spart €1,00/Stk). Bei gleichen Mengen wie oben ergibt sich ein ' ||
        'Einsparpotenzial von ~€1.485 pro Bestellung.</p>' ||
        '<h2>Aufteilung EU-Erwerb Textil 2025</h2>'),
      v_pos); v_pos := v_pos + 1;

    -- Tabelle: Aufteilung EU-Erwerb
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'table',
      jsonb_build_object(
        'columns', jsonb_build_array('Lieferant','Betrag (€)','Anteil','Dokumente vorhanden'),
        'rows', jsonb_build_array(
          jsonb_build_array('Texteis Colmaco','€6.260,00','61%','✓ Pro-Forma + Bestellübersicht'),
          jsonb_build_array('SN Textil / tica / JR Home','~€3.951,88','39%','✗ Keine separaten Rechnungen in Drive'),
          jsonb_build_array('Gesamt EU-Erwerb','€10.211,88','100%','')
        )),
      v_pos); v_pos := v_pos + 1;

    -- Block: Hinweis + Überschrift Lieferantenvergleich
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'text',
      jsonb_build_object('html',
        '<p><strong>Hinweis:</strong> Für SN Textil und tica wurden keine Rechnungen oder Bestelldokumente im ' ||
        'Google Drive gefunden. Diese sollten noch nachgereicht/hochgeladen werden, um die vollständige ' ||
        'Dokumentation sicherzustellen.</p>' ||
        '<h2>Textil-Lieferantenvergleich (Portugal)</h2>'),
      v_pos); v_pos := v_pos + 1;

    -- Tabelle: Lieferantenvergleich
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'table',
      jsonb_build_object(
        'columns', jsonb_build_array('Kriterium','JR Home (Daniela)','Texteis Colmaco'),
        'rows', jsonb_build_array(
          jsonb_build_array('Towel 50×50 cm','€3,05 ✅','€4,40'),
          jsonb_build_array('Napkin/Serviette 40×40 cm','€4,55','€3,55 ✅'),
          jsonb_build_array('MOQ','1.000 Stk (250/Farbe)','—'),
          jsonb_build_array('Material','100% Baumwolle Waffelpiqué','100% Baumwolle'),
          jsonb_build_array('Zahlung','In Verhandlung','30% Vorkasse, 70% vor Versand'),
          jsonb_build_array('Status','Bevorzugt für neue Bestellung','Pro-Forma vorhanden (FPF 25/117)')
        )),
      v_pos); v_pos := v_pos + 1;

    -- Block: Fazit
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'text',
      jsonb_build_object('html',
        '<p><strong>Fazit:</strong> JR Home ist bei Tüchern 31% günstiger. Colmaco bei Servietten 22% günstiger. ' ||
        'Je nach Produkt-Mix kann Split-Sourcing sinnvoll sein.</p>'),
      v_pos); v_pos := v_pos + 1;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Seite 2: Supply Chain Keramik
-- ----------------------------------------------------------------------------
do $$
declare
  v_page_id uuid;
  v_pos     integer := 0;
begin
  if not exists (select 1 from public.pages where title = 'Supply Chain Keramik') then
    insert into public.pages (title, position)
    values ('Supply Chain Keramik', (select coalesce(max(position), -1) + 1 from public.pages))
    returning id into v_page_id;

    -- Block: Einleitung + Lieferkette + Überschrift Kalkulation
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'text',
      jsonb_build_object('html',
        '<p>Übersicht aller Import-Lieferketten, Kalkulationen und Versanddetails für Hills of Hems.</p>' ||
        '<p>Erstellt aus 11 Quelldokumenten (Google Drive, Stand April 2026).</p>' ||
        '<h2>Keramik-Lieferkette (China → Deutschland)</h2>' ||
        '<p>Die Keramik durchläuft folgende Stationen:</p>' ||
        '<ul>' ||
        '<li><strong>Yixing Fine Pottery Corp.</strong> (Hersteller, Jiangsu, China)</li>' ||
        '<li><strong>Nanjing Kimming International</strong> (Exporteur/Trader, Nanjing, China)</li>' ||
        '<li><strong>Air Sea Worldwide Logistics</strong> (Verschiffung, Hong Kong)</li>' ||
        '<li><strong>HST Sea &amp; Airfreight BV</strong> (Zoll/Logistik, Enschede, Niederlande)</li>' ||
        '<li><strong>beeconnected GmbH / Hills of Hems</strong> (Hemsbach, Deutschland)</li>' ||
        '</ul>' ||
        '<p>Verpackung (Giftboxen) wird separat über <strong>Magic Joy International</strong> (Hong Kong) bezogen.</p>' ||
        '<h2>Keramik-Kalkulation (November 2025)</h2>'),
      v_pos); v_pos := v_pos + 1;

    -- Tabelle: Kalkulation
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'table',
      jsonb_build_object(
        'columns', jsonb_build_array('Produkt','EK/Stk (USD)','Stk/Set','Fracht','Zoll','Gesamt EK (€)','VK Brutto (€)','Marge Retail','VK B2B (€)','Marge B2B'),
        'rows', jsonb_build_array(
          jsonb_build_array('Becher (MUG)','$2,30','1','€0,60','€1,50','€4,90','€15,00','61%','€8,00','39%'),
          jsonb_build_array('Kl. Mug (2er-Set)','$1,21','2','€0,60','€1,00','€4,60','€20,00','73%','€10,00','54%'),
          jsonb_build_array('Teller (4er-Set)','$1,90','4','€0,60','€1,00','€9,70','€25,00','54%','€15,00','35%'),
          jsonb_build_array('Petit Four (4er-Set)','$1,20','4','€0,60','€1,00','€6,90','€20,00','59%','€10,00','50%')
        )),
      v_pos); v_pos := v_pos + 1;

    -- Block: Letzte Lieferung + Sendungsdaten + Überschrift Bestellte Produkte
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'text',
      jsonb_build_object('html',
        '<h2>Letzte Keramik-Lieferung (September 2025)</h2>' ||
        '<h3>Sendungsdaten</h3>' ||
        '<ul>' ||
        '<li>Rechnungsnr.: 2025NWA001 (Nanjing Kimming) / S/C 2025NJK001</li>' ||
        '<li>Datum: 17.09.2025 · Verladen: 24.09.2025</li>' ||
        '<li>Schiff: EVER APEX V.1367012W</li>' ||
        '<li>Container: COYU2262372 (20DC)</li>' ||
        '<li>Route: Shanghai → Rotterdam</li>' ||
        '<li>84 Kartons · 909,30 kg · 3,0 CBM</li>' ||
        '</ul>' ||
        '<h3>Bestellte Produkte</h3>'),
      v_pos); v_pos := v_pos + 1;

    -- Tabelle: Bestellte Produkte
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'table',
      jsonb_build_object(
        'columns', jsonb_build_array('Produkt','Menge (Stk)','Kartons','Stückpreis (USD)','Gesamt (USD)'),
        'rows', jsonb_build_array(
          jsonb_build_array('Becher Hills of Hems #1','504','21','$2,30','$1.159,20'),
          jsonb_build_array('Becher Hills of Hems #2','504','21','$2,30','$1.159,20'),
          jsonb_build_array('Minimug ohne Henkel','504','14','$1,21','$609,84'),
          jsonb_build_array('Cake Plate 18','504','14','$1,87','$942,48'),
          jsonb_build_array('Petit Four Plate (4 Designs)','504','14','$1,18','$594,72'),
          jsonb_build_array('Courier (prepaid)','—','—','—','$215,00'),
          jsonb_build_array('LCL &amp; Film','—','—','—','$750,00'),
          jsonb_build_array('Gesamt','2.520','84','','$5.430,44')
        )),
      v_pos); v_pos := v_pos + 1;

    -- Block: Giftbox + Gesamtwert + Anti-Dumping + Quelldokumente
    insert into public.page_blocks (page_id, type, content, position) values (v_page_id, 'text',
      jsonb_build_object('html',
        '<p><strong>Giftbox-Verpackung (Magic Joy):</strong> 1.512 Brown Boxes mit Banderole = US$909,90 (~$0,60/Stk)</p>' ||
        '<p><strong>Gesamtwert Keramik + Verpackung: US$6.340,34</strong></p>' ||
        '<h2>Anti-Dumping-Zoll</h2>' ||
        '<ul>' ||
        '<li><strong>HS-Code:</strong> 6912 0023 10 (Steingut/Earthenware)</li>' ||
        '<li><strong>Anti-Dumping-Satz:</strong> 36,1%</li>' ||
        '<li><strong>Befreiung:</strong> Herstellererklärung von Yixing Fine Pottery Corp. mit TARIC Zusatzcode <strong>B613</strong></li>' ||
        '<li><strong>Abwicklung:</strong> HST Sea &amp; Airfreight BV (Enschede, NL)</li>' ||
        '</ul>' ||
        '<p>Die Ursprungsrechnung (Declaration) von Yixing Fine Pottery wurde angefordert und liegt vor. ' ||
        'Damit kann eine Reduzierung/Befreiung des Anti-Dumping-Zolls beantragt werden.</p>' ||
        '<h2>Quelldokumente (Google Drive)</h2>' ||
        '<p>Alle Dokumente liegen im Hills of Hems Ordner auf Google Drive:</p>' ||
        '<ul>' ||
        '<li>hills Textil Daniela.pdf — E-Mail-Korrespondenz JR Home</li>' ||
        '<li>Lieferant in China Ursprungsrechnung.pdf — Anti-Dumping E-Mail-Kette</li>' ||
        '<li>FAT PROF-BEECONNECTED-GERMANY.pdf — Pro-Forma Colmaco (FPF 25/117)</li>' ||
        '<li>BEECONNECTED CO HILLSOFHEMS - 09-09-2025.xls — Bestellübersicht</li>' ||
        '<li>25JNP101 GIFTBOX.xlsx — Giftbox-Rechnung Magic Joy</li>' ||
        '<li>INV 25NJK001.pdf — Commercial Invoice Nanjing Kimming</li>' ||
        '<li>PL 25NJK001.pdf — Packing List</li>' ||
        '<li>ASSHA508984 TLX.pdf — Bill of Lading</li>' ||
        '<li>DECLARATION.pdf — Herstellererklärung Yixing</li>' ||
        '<li>Invoice_VS2600382.pdf — HST Logistik-Rechnung</li>' ||
        '<li>Porzellan Kalkulation Nov. 2025.xlsx — Margen-Kalkulation</li>' ||
        '<li>Cópia de colmaco Order - Summery 7.7.2025.xlsx — Colmaco Bestellübersicht mit Farben/Mengen</li>' ||
        '</ul>'),
      v_pos); v_pos := v_pos + 1;
  end if;
end $$;
