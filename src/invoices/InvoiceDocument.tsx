// ============================================================================
// InvoiceDocument – Layout der Rechnung / Stornorechnung (DIN A4, @react-pdf)
// ----------------------------------------------------------------------------
// Bewusst schlicht: viel Weißraum, warme Hub-Palette, Lora für Marke/Titel,
// Inter für alles andere. Anschrift links im Fensterbereich (DIN 5008),
// Metablock rechts, dann Positionstabelle, Steuerzusammenfassung, Vermerke,
// Fußzeile mit Pflichtangaben (§ 14 Abs. 4 UStG).
//
// Diese Komponente enthält KEINE Berechnung – alle Beträge kommen aus dem
// eingefrorenen Snapshot (InvoiceRow). Schriften: siehe fonts.ts.
// ============================================================================
import { Document, Image, Page, Path, StyleSheet, Svg, Text, View } from '@react-pdf/renderer'
import type { InvoiceRow, InvoiceSettings } from './types'
import { FONT_SANS, FONT_SERIF } from './fonts'
import { fmtDate, fmtMoney, fmtPercent, splitLines } from './format'
import { LOGO_ASPECT, LOGO_PATHS, LOGO_VIEWBOX } from './logo'

const mm = (n: number) => n * 2.8346

const C = {
  ink: '#2B2722',
  soft: '#4A4339',
  muted: '#7A7062',
  faint: '#A89E8E',
  line: '#E8E0D3',
  lineStrong: '#DACFBC',
  sage: '#6E8253',
  sand: '#F7F3EC',
  terracotta: '#B86440',
}

const styles = StyleSheet.create({
  page: {
    paddingTop: mm(16),
    paddingBottom: mm(34),
    paddingHorizontal: mm(20),
    fontFamily: FONT_SANS,
    fontSize: 9,
    lineHeight: 1.45,
    color: C.ink,
    backgroundColor: '#FFFFFF',
  },
  // Kopf: Logo/Wortmarke links, Aussteller rechts
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { maxHeight: mm(16), maxWidth: mm(55), objectFit: 'contain' },
  logoVector: { width: mm(54), height: mm(54 / LOGO_ASPECT), marginTop: mm(1) },
  // Hinweis: react-pdf löst `lineHeight` an der Stelle auf, an der es gesetzt
  // ist, und vererbt den absoluten Wert – große Schriften brauchen eigene Werte.
  wordmark: { fontFamily: FONT_SERIF, fontSize: 18, lineHeight: 1.2, fontWeight: 600, color: C.ink, letterSpacing: 0.2 },
  wordmarkSub: { fontSize: 7, lineHeight: 1.3, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 2 },
  issuerBlock: { alignItems: 'flex-end' },
  issuerName: { fontSize: 8.5, fontWeight: 600, color: C.ink },
  issuerLine: { fontSize: 8, color: C.muted },

  // Anschrift & Meta (Fensterbereich beginnt ca. 45 mm von oben)
  addressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: mm(14) },
  senderLine: { fontSize: 6.5, color: C.faint, marginBottom: 6, paddingBottom: 2, borderBottomWidth: 0.5, borderBottomColor: C.line },
  recipientBox: { width: mm(85) },
  recipientCompany: { fontSize: 10, lineHeight: 1.4, fontWeight: 600 },
  recipientLine: { fontSize: 10, lineHeight: 1.4 },
  recipientVat: { fontSize: 8, color: C.muted, marginTop: 4 },
  metaBox: { width: mm(62), marginTop: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2.5 },
  metaLabel: { fontSize: 8, color: C.muted },
  metaValue: { fontSize: 8.5, fontWeight: 500, textAlign: 'right' },

  // Titel
  title: { fontFamily: FONT_SERIF, fontSize: 20, lineHeight: 1.2, fontWeight: 600, marginTop: mm(16), color: C.ink },
  subtitle: { fontSize: 9, color: C.muted, marginTop: 3 },
  cancelNote: { fontSize: 9, color: C.terracotta, marginTop: 3 },

  // Tabelle
  table: { marginTop: mm(8) },
  thead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.lineStrong,
    paddingBottom: 4,
    marginBottom: 2,
  },
  th: { fontSize: 6.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  tr: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: C.line },
  td: { fontSize: 8.5 },
  tdMuted: { fontSize: 7.5, color: C.muted },
  right: { textAlign: 'right' },
  colPos: { width: 22 },
  colDesc: { flex: 1, paddingRight: 8 },
  colQty: { width: 36, textAlign: 'right' },
  colUnit: { width: 62, textAlign: 'right' },
  colNet: { width: 62, textAlign: 'right' },
  colRate: { width: 36, textAlign: 'right' },
  colTax: { width: 56, textAlign: 'right' },
  colGross: { width: 64, textAlign: 'right' },

  // Summen
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  totals: { width: mm(78) },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5 },
  totalLabel: { fontSize: 8.5, color: C.soft },
  totalValue: { fontSize: 8.5 },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: C.ink,
  },
  grandLabel: { fontSize: 10, lineHeight: 1.4, fontWeight: 600 },
  grandValue: { fontSize: 10, lineHeight: 1.4, fontWeight: 600 },

  // Vermerke
  notes: { marginTop: mm(8), gap: 4 },
  note: { fontSize: 8.5, color: C.soft },
  noteStrong: { fontSize: 8.5, color: C.ink, fontWeight: 500 },
  rcBox: {
    marginTop: 6,
    padding: 8,
    backgroundColor: C.sand,
    borderLeftWidth: 2,
    borderLeftColor: C.sage,
  },
  rcText: { fontSize: 8, color: C.soft },

  // Fußzeile (auf jeder Seite)
  footer: {
    position: 'absolute',
    left: mm(20),
    right: mm(20),
    bottom: mm(12),
    borderTopWidth: 0.5,
    borderTopColor: C.lineStrong,
    paddingTop: 6,
  },
  footerCols: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  footerCol: { flex: 1 },
  footerText: { fontSize: 6.8, color: C.muted, lineHeight: 1.4 },
  footerStrong: { fontSize: 6.8, color: C.soft, fontWeight: 600 },
  footerNote: { fontSize: 6.8, color: C.faint, marginTop: 4 },
  pageNumber: { position: 'absolute', right: 0, top: -12, fontSize: 6.5, color: C.faint },
})

export interface InvoiceDocumentProps {
  invoice: InvoiceRow
  settings: InvoiceSettings
  /** PNG/JPEG als Data-URL; ohne Logo wird die Wortmarke gesetzt. */
  logoDataUrl?: string | null
}

const REVERSE_CHARGE_NOTE =
  'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge, § 13b UStG) – ' +
  'innergemeinschaftliche Lieferung, steuerfrei nach § 4 Nr. 1b i. V. m. § 6a UStG.'

function nonEmpty(v: string | null | undefined): string | null {
  const s = (v ?? '').trim()
  return s ? s : null
}

export function InvoiceDocument({ invoice, settings, logoDataUrl }: InvoiceDocumentProps) {
  const isCancellation = invoice.type === 'cancellation'
  const cur = invoice.totals.currency || 'EUR'
  const issuerLines = splitLines(settings.issuer_address)
  const senderLine = [settings.issuer_name, ...issuerLines].filter(Boolean).join(' · ')
  const bankLines = splitLines(settings.bank_details)
  const r = invoice.recipient
  const meta = invoice.meta

  const deliveryIsIssue = meta.delivery_date_source === 'issue_date' || !invoice.delivery_date
  const paymentNote = isCancellation
    ? 'Der Betrag der stornierten Rechnung wird erstattet bzw. verrechnet.'
    : meta.payment_method
      ? `Betrag bereits bezahlt via ${meta.payment_method}.`
      : 'Betrag bereits bezahlt.'

  const cancelsDate = meta.cancels_issue_date ? fmtDate(meta.cancels_issue_date) : ''

  return (
    <Document
      title={`${isCancellation ? 'Stornorechnung' : 'Rechnung'} ${invoice.number}`}
      author={settings.issuer_name}
      subject={`Bestellung ${invoice.shopify_order_name}`}
      language="de"
    >
      <Page size="A4" style={styles.page}>
        {/* Kopf */}
        <View style={styles.header}>
          <View>
            {logoDataUrl ? (
              // Hochgeladenes Raster-Logo (Einstellungen) hat Vorrang …
              <Image src={logoDataUrl} style={styles.logo} />
            ) : LOGO_PATHS.length > 0 ? (
              // … sonst die eingebaute Vektor-Wortmarke (gestochen scharf)
              <Svg viewBox={LOGO_VIEWBOX} style={styles.logoVector}>
                {LOGO_PATHS.map((d, i) => (
                  <Path key={i} d={d} fill={C.ink} />
                ))}
              </Svg>
            ) : (
              <View>
                <Text style={styles.wordmark}>Hills of Hems</Text>
                {nonEmpty(settings.issuer_web) && (
                  <Text style={styles.wordmarkSub}>{settings.issuer_web}</Text>
                )}
              </View>
            )}
          </View>
          <View style={styles.issuerBlock}>
            <Text style={styles.issuerName}>{settings.issuer_name}</Text>
            {issuerLines.map((l, i) => (
              <Text key={i} style={styles.issuerLine}>
                {l}
              </Text>
            ))}
            {nonEmpty(settings.issuer_email) && <Text style={styles.issuerLine}>{settings.issuer_email}</Text>}
            {nonEmpty(settings.issuer_phone) && <Text style={styles.issuerLine}>{settings.issuer_phone}</Text>}
          </View>
        </View>

        {/* Anschrift + Meta */}
        <View style={styles.addressRow}>
          <View style={styles.recipientBox}>
            <Text style={styles.senderLine}>{senderLine}</Text>
            {r.company ? <Text style={styles.recipientCompany}>{r.company}</Text> : null}
            {r.name ? <Text style={styles.recipientLine}>{r.name}</Text> : null}
            {r.address_lines.map((l, i) => (
              <Text key={i} style={styles.recipientLine}>
                {l}
              </Text>
            ))}
            {r.vat_id && <Text style={styles.recipientVat}>USt-IdNr. {r.vat_id}</Text>}
          </View>

          <View style={styles.metaBox}>
            <MetaRow label={isCancellation ? 'Stornorechnungs-Nr.' : 'Rechnungsnummer'} value={invoice.number} />
            <MetaRow label="Rechnungsdatum" value={fmtDate(invoice.issue_date)} />
            <MetaRow
              label="Lieferdatum"
              value={deliveryIsIssue ? fmtDate(invoice.issue_date) : fmtDate(invoice.delivery_date)}
            />
            <MetaRow label="Bestellnummer" value={invoice.shopify_order_name} />
            <MetaRow label="Bestelldatum" value={fmtDate(meta.order_date)} />
            {meta.channel === 'orderchamp' && <MetaRow label="Kanal" value="Orderchamp" />}
            {r.vat_id && <MetaRow label="USt-IdNr. Empfänger" value={r.vat_id} />}
            {nonEmpty(settings.issuer_vat_id) && (
              <MetaRow label="USt-IdNr. Aussteller" value={settings.issuer_vat_id!} />
            )}
          </View>
        </View>

        {/* Titel */}
        <Text style={styles.title}>{isCancellation ? 'Stornorechnung' : 'Rechnung'}</Text>
        {isCancellation && meta.cancels_number ? (
          <Text style={styles.cancelNote}>
            Storno zu Rechnung {meta.cancels_number}
            {cancelsDate ? ` vom ${cancelsDate}` : ''}
          </Text>
        ) : (
          <Text style={styles.subtitle}>
            zu Bestellung {invoice.shopify_order_name} vom {fmtDate(meta.order_date)}
            {meta.channel === 'orderchamp' ? ' (Orderchamp)' : ''}
          </Text>
        )}

        {/* Positionen */}
        <View style={styles.table}>
          <View style={styles.thead} fixed>
            <Text style={[styles.th, styles.colPos]}>Pos.</Text>
            <Text style={[styles.th, styles.colDesc]}>Bezeichnung</Text>
            <Text style={[styles.th, styles.colQty]}>Menge</Text>
            <Text style={[styles.th, styles.colUnit]}>Einzel netto</Text>
            <Text style={[styles.th, styles.colNet]}>Netto</Text>
            <Text style={[styles.th, styles.colRate]}>USt.</Text>
            <Text style={[styles.th, styles.colTax]}>Steuer</Text>
            <Text style={[styles.th, styles.colGross]}>Brutto</Text>
          </View>
          {invoice.lines.map((line, i) => {
            const detail = [line.variant, line.sku ? `Art.-Nr. ${line.sku}` : null].filter(Boolean).join(' · ')
            return (
              <View key={i} style={styles.tr} wrap={false}>
                <Text style={[styles.td, styles.colPos]}>{i + 1}</Text>
                <View style={styles.colDesc}>
                  <Text style={styles.td}>{line.title}</Text>
                  {detail ? <Text style={styles.tdMuted}>{detail}</Text> : null}
                </View>
                <Text style={[styles.td, styles.colQty]}>{line.quantity}</Text>
                <Text style={[styles.td, styles.colUnit]}>{fmtMoney(line.unit_net, cur)}</Text>
                <Text style={[styles.td, styles.colNet]}>{fmtMoney(line.net, cur)}</Text>
                <Text style={[styles.td, styles.colRate]}>{fmtPercent(line.tax_rate)}</Text>
                <Text style={[styles.td, styles.colTax]}>{fmtMoney(line.tax, cur)}</Text>
                <Text style={[styles.td, styles.colGross]}>{fmtMoney(line.gross, cur)}</Text>
              </View>
            )
          })}
        </View>

        {/* Summen */}
        <View style={styles.totalsWrap} wrap={false}>
          <View style={styles.totals}>
            {invoice.tax_summary.map((g) => (
              <View key={g.rate}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    {invoice.tax_summary.length > 1 ? `Nettobetrag (${fmtPercent(g.rate)})` : 'Nettobetrag'}
                  </Text>
                  <Text style={styles.totalValue}>{fmtMoney(g.net, cur)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    {invoice.reverse_charge
                      ? `Umsatzsteuer ${fmtPercent(g.rate)} (Reverse Charge)`
                      : g.rate > 0
                        ? `zzgl. ${fmtPercent(g.rate)} Umsatzsteuer`
                        : 'Umsatzsteuer 0 %'}
                  </Text>
                  <Text style={styles.totalValue}>{fmtMoney(g.tax, cur)}</Text>
                </View>
              </View>
            ))}
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>{isCancellation ? 'Gutschriftbetrag' : 'Gesamtbetrag'}</Text>
              <Text style={styles.grandValue}>{fmtMoney(invoice.totals.gross, cur)}</Text>
            </View>
          </View>
        </View>

        {/* Vermerke */}
        <View style={styles.notes}>
          <Text style={styles.noteStrong}>{paymentNote}</Text>
          {meta.discount_note && <Text style={styles.note}>{meta.discount_note}</Text>}
          {deliveryIsIssue && <Text style={styles.note}>Lieferdatum entspricht Rechnungsdatum.</Text>}
          {invoice.reverse_charge && (
            <View style={styles.rcBox}>
              <Text style={styles.rcText}>{REVERSE_CHARGE_NOTE}</Text>
              <Text style={styles.rcText}>
                USt-IdNr. Aussteller: {settings.issuer_vat_id} · USt-IdNr. Empfänger: {r.vat_id}
              </Text>
            </View>
          )}
        </View>

        {/* Fußzeile */}
        <View style={styles.footer} fixed>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`}
          />
          <View style={styles.footerCols}>
            <View style={styles.footerCol}>
              <Text style={styles.footerStrong}>{settings.issuer_name}</Text>
              {issuerLines.map((l, i) => (
                <Text key={i} style={styles.footerText}>
                  {l}
                </Text>
              ))}
              {nonEmpty(settings.issuer_web) && <Text style={styles.footerText}>{settings.issuer_web}</Text>}
            </View>
            <View style={styles.footerCol}>
              {nonEmpty(settings.issuer_tax_number) && (
                <Text style={styles.footerText}>Steuernummer {settings.issuer_tax_number}</Text>
              )}
              {nonEmpty(settings.issuer_vat_id) && (
                <Text style={styles.footerText}>USt-IdNr. {settings.issuer_vat_id}</Text>
              )}
              {nonEmpty(settings.issuer_email) && <Text style={styles.footerText}>{settings.issuer_email}</Text>}
              {nonEmpty(settings.issuer_phone) && <Text style={styles.footerText}>{settings.issuer_phone}</Text>}
            </View>
            <View style={styles.footerCol}>
              {bankLines.length > 0 && <Text style={styles.footerStrong}>Bankverbindung</Text>}
              {bankLines.map((l, i) => (
                <Text key={i} style={styles.footerText}>
                  {l}
                </Text>
              ))}
            </View>
          </View>
          {nonEmpty(settings.footer_text) && <Text style={styles.footerNote}>{settings.footer_text}</Text>}
        </View>
      </Page>
    </Document>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}
