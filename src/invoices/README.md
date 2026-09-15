# Rechnungsmodul (`/rechnungen`)

Erzeugt für bezahlte Shopify-Bestellungen per Knopfdruck eine Rechnung als PDF –
**nur für die interne Buchhaltung** (Lexware), kein Versand an Kunden.

- Bestellungen kommen ausschließlich über die Supabase Edge Function
  [`shopify-orders`](../../supabase/functions/shopify-orders/index.ts) (Lesezugriff,
  Secrets liegen nur dort).
- Netto/Steuer/Brutto werden aus den Shopify-Steuerzeilen abgeleitet
  ([`mapOrderToInvoice.ts`](mapOrderToInvoice.ts)), nie selbst mit einem Steuersatz gerechnet.
- Jede Rechnung ist ein unveränderlicher Snapshot in `invoices` mit fortlaufender
  Nummer `HOH-2026-00001` (GoBD). Storno = neue Nummer, negative Beträge.
- Layout: [`InvoiceDocument.tsx`](InvoiceDocument.tsx) (@react-pdf/renderer, DIN A4, Lora + Inter).

---

## Einrichtung (einmalig)

### 1. Migration einspielen

`supabase/migrations/0017_invoices.sql` im Supabase **SQL Editor** ausführen (wie die
übrigen Migrationen, siehe Haupt-README). Legt an: `invoice_settings`,
`invoice_customer_overrides`, `invoices`, Sequence, RPCs `create_invoice` /
`set_invoice_pdf_path`, RLS, Storage-Bucket `invoices` (privat) und den Orderchamp-Override.

### 2. App im Shopify Dev Dashboard anlegen

Custom Apps direkt im Shopify-Admin („Apps entwickeln“ mit fertigem `shpat_`-Token) kann
Shopify seit 2025 nicht mehr neu anlegen. Der Weg ist jetzt das **Dev Dashboard**
(<https://dev.shopify.com/dashboard>), die App holt sich ihr Token selbst
(„client credentials grant“, 24 h gültig, wird von der Edge Function automatisch erneuert).
Die Shopify CLI (`npm init @shopify/app`) wird **nicht** gebraucht.

1. Dev Dashboard → **Apps → Create app → Start from Dev Dashboard**, Name z. B. „Hub Rechnungen“.
2. Reiter **Versions**: App-URL auf dem Standard lassen, neueste Webhooks-API-Version,
   dann die Scopes wählen und **Release** klicken:

   | Scope | Wozu |
   |-------|------|
   | `read_orders` | Bestellungen, Positionen, Steuerzeilen, Fulfillments |
   | `read_customers` | Kundenname und Kunden-E-Mail (für die Overrides) |
   | `read_all_orders` | Nur nötig, wenn Bestellungen **älter als 60 Tage** erreichbar sein sollen |

3. **Protected customer data**: In der App unter *API access* / *Protected customer data access*
   „Protected customer data“ sowie die Felder **Name, Address, Email** anfordern, Begründung
   „Rechnungsstellung / Buchhaltung“ eintragen und speichern. Für eine App auf dem eigenen Shop
   ist das sofort freigeschaltet (keine Review). Ohne diesen Schritt liefert die API
   `customer`, `email` und `billingAddress` leer.
4. **Home → Install app** → Shop `hills-of-hems` wählen → **Install**.
5. **Settings**: **Client ID** und **Client secret** kopieren. Das Secret gehört ausschließlich
   in `supabase/functions/.env` (Schritt 3), nie ins Git oder ins Frontend.

Falls noch eine alte, im Admin angelegte Custom App mit `shpat_`-Token existiert, kann sie
weiter genutzt werden: dann nur `SHOPIFY_ADMIN_TOKEN` setzen (Variante B in `.env.example`).

### 3. Secrets setzen und Function deployen

```bash
cd hillsteam
supabase login
supabase link --project-ref DEIN-PROJEKT-REF

cp supabase/functions/.env.example supabase/functions/.env   # Client ID + Secret eintragen
supabase secrets set --env-file supabase/functions/.env

supabase functions deploy shopify-orders
```

Die Domain ist die **myshopify-Domain** (`hills-of-hems.myshopify.com`), nicht
`hillsofhems.com`. `supabase/functions/.env` ist per `.gitignore` ausgeschlossen.
Ohne CLI geht es auch im Supabase-Dashboard: *Edge Functions → Secrets* für die Werte und
*Edge Functions → Deploy a new function → Via Editor* für den Code aus
`supabase/functions/shopify-orders/index.ts`.

Schneller Test nach dem Deploy (im Hub eingeloggt, DevTools-Konsole):

```js
const { data, error } = await window.supabase.functions.invoke('shopify-orders', {
  body: { action: 'list', first: 3, paidOnly: true },
})
console.log(data, error)
```

### 4. Einstellungen ausfüllen

Im Hub **Rechnungen → Einstellungen** (`/rechnungen/einstellungen`, schreibend nur Admins):

- **Name / Firma mit Rechtsform** und **Anschrift** (Pflicht)
- **Steuernummer** oder **USt-IdNr.** (mindestens eins ist Pflicht, § 14 Abs. 4 UStG);
  die USt-IdNr. ist Pflicht für Reverse-Charge-Rechnungen (Orderchamp)
- E-Mail, Telefon, Website, Bankverbindung, Fußzeilentext (optional)
- Nummernpräfix (Standard `HOH-`)
- Logo (PNG/JPG) – ohne Logo wird die Wortmarke „Hills of Hems“ gesetzt

Diese Werte werden **nicht** vorbelegt; das Modul blockiert die Rechnungserstellung, bis
Name, Anschrift und Steuernummer/USt-IdNr. eingetragen sind.

### 5. Orderchamp-Override vervollständigen

Die Migration legt den Eintrag `service+nl@orderchamp.com` → **Orderchamp B.V.**,
Reverse Charge = ja an. Die **USt-IdNr. von Orderchamp B.V.** steht nicht in Shopify und muss
dort eingetragen werden. Solange sie fehlt, blockiert die Vorschau mit einem Hinweis.

Weitere B2B-Kunden mit USt-IdNr. oder Firmenfeld werden genauso als Override je Kunden-E-Mail
angelegt (die E-Mail wird mit Kunden- und Bestell-E-Mail der Shopify-Bestellung verglichen).

### 6. Erste Rechnung erzeugen

`/rechnungen` → Bestellung wählen → **Rechnung erstellen** → Vorschau prüfen (Empfänger,
Positionen, Steuer, Hinweise) → **Rechnung erstellen**. Ablauf:

1. RPC `create_invoice` vergibt die Nummer und speichert den Snapshot (unumkehrbar).
2. PDF wird im Browser gerendert.
3. Upload nach `invoices/YYYY/<Nummer>.pdf`.
4. `pdf_path` wird einmalig gesetzt, PDF öffnet sich (signierte URL, 5 Min. gültig).

Bricht Schritt 2–4 ab, existiert die Rechnung bereits mit ihrer Nummer – das ist korrekt
(lückenlos). In der Liste erscheint dann **„PDF erzeugen“**; das PDF wird aus dem Snapshot
neu gerendert.

---

## Regeln des Mappings (Shopify → Rechnung)

| Thema | Regel |
|-------|-------|
| Empfänger | `billingAddress`, Fallback `shippingAddress`; Override (Firma / Adresse / USt-IdNr.) je Kunden-E-Mail |
| Kanal | Tag `Orderchamp` (oder `sourceName`) → Orderchamp, sonst Onlineshop |
| Positionsbetrag | `originalTotal − Σ discountAllocations`. **Wichtig:** Shopifys `discountedTotalSet` enthält nur Positionsrabatte, Rabattcodes stecken nur in den Allocations |
| Netto/Brutto | `taxesIncluded=true` (Onlineshop): netto = brutto − Steuerzeilen. `taxesIncluded=false` (Orderchamp): brutto = netto + Steuerzeilen |
| Versand | eigene Position aus `shippingLines` + deren Steuerzeilen; 0 € (kostenloser Versand) wird weggelassen |
| Mehrere Steuersätze auf einer Zeile | (z. B. Versand bei gemischtem Warenkorb) wird je Satz aufgeteilt, Anteil aus der Steuer zurückgerechnet |
| Rabatt-Info | `totalDiscounts > 0` → „Enthält Rabatt in Höhe von X € (Code/Titel)“ |
| Reverse Charge | Override `reverse_charge` **oder** (Land ≠ DE, EU, Steuer 0 €, USt-IdNr. vorhanden). Pflichtvermerk § 13b / § 4 Nr. 1b i. V. m. § 6a UStG, beide USt-IdNrn. auf der Rechnung. Ohne USt-IdNr. → Blocker |
| Rundung | Differenz zu `totalPrice` bzw. `totalTax` ≤ 0,02 € wird auf die größte Steuergruppe gelegt, darüber Fehler |
| Lieferdatum | erstes Fulfillment (Europe/Berlin), sonst Rechnungsdatum + Vermerk |
| Rechnungsdatum | Tag der Erstellung (RPC, Europe/Berlin), nicht das Bestelldatum |
| Zahlungsvermerk | „Betrag bereits bezahlt via Shopify Payments / PayPal / …“ aus `paymentGatewayNames`, Orderchamp-Bestellungen: „via Orderchamp“ |

Die Vorschau zeigt **Hinweise** (Warnungen) und **Blocker**. Ein wichtiger Hinweis aus den
echten Daten: einige Produkte (z. B. Geschirrtücher `TT-1xx`) sind im Shop **ohne
Steuer** (0 %) angelegt – Bestellungen damit ergeben Rechnungen mit einer 0-%-Gruppe.
Das Modul warnt, übernimmt die Bestellung aber so, wie Shopify sie abgerechnet hat.
Bitte im Shopify-Produkt „Steuern erheben“ prüfen.

---

## Datenmodell & Sicherheit

- `invoice_settings` (eine Zeile), `invoice_customer_overrides`: lesen alle Hub-User,
  schreiben nur Admins (`is_admin()`).
- `invoices`: lesen alle Hub-User. **Keine** insert/update/delete-Policy – schreiben geht
  nur über `create_invoice()` (SECURITY DEFINER, Advisory-Lock, Nummer erst nach allen
  Prüfungen). `pdf_path` wird über `set_invoice_pdf_path()` einmalig von NULL gesetzt; ein
  Trigger verbietet jede andere Änderung und jedes Löschen.
- Snapshot-Spalten: `recipient`, `lines`, `tax_summary` (`[{rate, net, tax, gross}]`),
  `totals` (`{net, tax, gross, currency, discount}`), `meta` (Kanal, Zahlungsart,
  Rabatt-Info, Refunds, Storno-Bezug, Hinweise). Damit lässt sich später ZUGFeRD/XRechnung
  oder eine Teilgutschrift ergänzen.
- Storage-Bucket `invoices` (privat): PDFs unter `YYYY/<Nummer>.pdf` (nur anlegen + lesen
  über signierte URLs), Logo unter `assets/` (Admins dürfen ersetzen).

## Umsatzsteuer-Übersicht & CSV-Export

Unten auf `/rechnungen`: Zeitraum wählen (**Monat / Quartal / Jahr**, nach Rechnungsdatum).
Die Übersicht zeigt je Steuersatz die Anzahl Rechnungen sowie Netto, Umsatzsteuer und Brutto,
weist innergemeinschaftliche Lieferungen mit Reverse Charge (§ 13b) getrennt aus und
verrechnet Stornorechnungen (negative Beträge). Logik in [`vat.ts`](vat.ts), Tests in
`vat.test.ts`.

**CSV** exportiert dieselben Rechnungen: eine Zeile pro Rechnung, `;`-getrennt, Dezimalkomma,
UTF-8 mit BOM (Excel/Lexware). Spalten: Nummer, Datum, Typ, Bestellnummer, Kanal, Empfänger,
Land, USt-IdNr., je vorkommendem Steuersatz Netto/USt/Brutto, Gesamtsummen, Reverse Charge,
Storno-Bezug, Zahlungsart, Lieferdatum.

## Tests

```bash
npm test                                   # Mapping (15 Fälle) + PDF-Rendering
INVOICE_PDF_OUT=/tmp/hoh-pdf npm test      # schreibt zusätzlich Beispiel-PDFs nach /tmp/hoh-pdf
```

Abgedeckt: Standardfall 19 % ohne Versand, mit Versand, mit Rabattcode, kostenloser Versand,
Reverse Charge Orderchamp (inkl. fehlender USt-IdNr.), Rundung (1 Cent / > 2 Cent),
gemischte Steuersätze, unbezahlt, Lieferdatum/Zeitzone, Stornorechnung.

## Nicht in v1

Kein E-Mail-Versand, kein Webhook, keine automatische Erzeugung, keine Teilgutschriften
(Refund-Daten liegen aber im Snapshot), kein ZUGFeRD/XRechnung. Bestellungen vor Go-live
werden nicht automatisch berechnet – nur bewusst einzeln.

## Dateien

```
src/invoices/
  README.md                    diese Datei
  types.ts                     Shopify-Ausschnitt + Snapshot-Typen
  format.ts                    Cent-Arithmetik, de-DE-Formate, Europe/Berlin
  mapOrderToInvoice.ts         Mapping + Stornoentwurf
  mapOrderToInvoice.test.ts    Unit-Tests (Vitest)
  __fixtures__/orders.ts       anonymisierte Bestell-Fixtures
  api.ts                       Edge Function, Tabellen, RPCs, Storage
  createInvoice.ts             Ablauf RPC → PDF → Upload → pdf_path
  fonts.ts / renderPdf.tsx     Schriften (Lora/Inter) + Browser-Rendering (lazy)
  InvoiceDocument.tsx          PDF-Layout
  InvoiceDocument.test.tsx     PDF-Render-Test (Node)
  csv.ts                       Monatsübersicht
  components/InvoicePreviewModal.tsx
src/pages/InvoicesPage.tsx, src/pages/InvoiceSettingsPage.tsx
supabase/migrations/0017_invoices.sql
supabase/functions/shopify-orders/index.ts, supabase/functions/.env.example
```
