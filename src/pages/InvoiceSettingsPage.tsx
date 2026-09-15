import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Building2, Image as ImageIcon, Pencil, Plus, ShieldAlert, Trash2, Users } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import {
  deleteCustomerOverride,
  loadCustomerOverrides,
  loadInvoiceSettings,
  saveInvoiceSettings,
  uploadInvoiceLogo,
  upsertCustomerOverride,
} from '@/invoices/api'
import type { InvoiceCustomerOverride, InvoiceSettings } from '@/invoices/types'

type SettingsForm = Omit<InvoiceSettings, 'id' | 'updated_at'>

const EMPTY_FORM: SettingsForm = {
  issuer_name: '',
  issuer_address: '',
  issuer_tax_number: '',
  issuer_vat_id: '',
  issuer_email: '',
  issuer_phone: '',
  issuer_web: '',
  bank_details: '',
  number_prefix: 'HOH-',
  logo_path: null,
  footer_text: '',
}

const EMPTY_OVERRIDE = {
  match_email: '',
  company_name: '',
  vat_id: '',
  billing_address_override: '',
  reverse_charge: false,
  note: '',
}

/** Rechnungseinstellungen: Ausstellerdaten, Logo, Kunden-Overrides (schreiben nur Admins). */
export function InvoiceSettingsPage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const isAdmin = Boolean(profile?.is_admin)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<SettingsForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)

  const [overrides, setOverrides] = useState<InvoiceCustomerOverride[]>([])
  const [editing, setEditing] = useState<InvoiceCustomerOverride | 'new' | null>(null)
  const [deleting, setDeleting] = useState<InvoiceCustomerOverride | null>(null)
  const [overrideForm, setOverrideForm] = useState(EMPTY_OVERRIDE)
  const [overrideSaving, setOverrideSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, o] = await Promise.all([loadInvoiceSettings(), loadCustomerOverrides()])
      if (s) {
        setForm({
          issuer_name: s.issuer_name ?? '',
          issuer_address: s.issuer_address ?? '',
          issuer_tax_number: s.issuer_tax_number ?? '',
          issuer_vat_id: s.issuer_vat_id ?? '',
          issuer_email: s.issuer_email ?? '',
          issuer_phone: s.issuer_phone ?? '',
          issuer_web: s.issuer_web ?? '',
          bank_details: s.bank_details ?? '',
          number_prefix: s.number_prefix ?? 'HOH-',
          logo_path: s.logo_path ?? null,
          footer_text: s.footer_text ?? '',
        })
      }
      setOverrides(o)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const save = async () => {
    if (!form.issuer_name.trim() || !form.issuer_address.trim()) {
      toast('Name und Anschrift des Ausstellers sind Pflicht.', 'error')
      return
    }
    if (!form.number_prefix.trim()) {
      toast('Bitte ein Nummernpräfix angeben (z. B. HOH-).', 'error')
      return
    }
    setSaving(true)
    try {
      const clean = (v: string | null) => (v ?? '').trim() || null
      await saveInvoiceSettings({
        issuer_name: form.issuer_name.trim(),
        issuer_address: form.issuer_address.trim(),
        issuer_tax_number: clean(form.issuer_tax_number),
        issuer_vat_id: clean(form.issuer_vat_id)?.replace(/\s+/g, '').toUpperCase() ?? null,
        issuer_email: clean(form.issuer_email),
        issuer_phone: clean(form.issuer_phone),
        issuer_web: clean(form.issuer_web),
        bank_details: clean(form.bank_details),
        number_prefix: form.number_prefix.trim(),
        logo_path: form.logo_path,
        footer_text: clean(form.footer_text),
      })
      toast('Einstellungen gespeichert.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const onLogoChange = async (file: File | undefined) => {
    if (!file) return
    setLogoBusy(true)
    try {
      const path = await uploadInvoiceLogo(file)
      await saveInvoiceSettings({ logo_path: path })
      set('logo_path', path)
      toast('Logo hochgeladen.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Logo-Upload fehlgeschlagen.', 'error')
    } finally {
      setLogoBusy(false)
    }
  }

  const removeLogo = async () => {
    setLogoBusy(true)
    try {
      await saveInvoiceSettings({ logo_path: null })
      set('logo_path', null)
      toast('Logo entfernt – die Wortmarke wird verwendet.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Fehler beim Entfernen.', 'error')
    } finally {
      setLogoBusy(false)
    }
  }

  // --- Overrides ------------------------------------------------------------
  const openNewOverride = () => {
    setOverrideForm(EMPTY_OVERRIDE)
    setEditing('new')
  }
  const openEditOverride = (o: InvoiceCustomerOverride) => {
    setOverrideForm({
      match_email: o.match_email ?? '',
      company_name: o.company_name ?? '',
      vat_id: o.vat_id ?? '',
      billing_address_override: o.billing_address_override ?? '',
      reverse_charge: o.reverse_charge,
      note: o.note ?? '',
    })
    setEditing(o)
  }

  const saveOverride = async () => {
    if (!overrideForm.match_email.trim()) {
      toast('Die Kunden-E-Mail ist Pflicht (Zuordnung zur Bestellung).', 'error')
      return
    }
    if (overrideForm.reverse_charge && !overrideForm.vat_id.trim()) {
      toast('Für Reverse Charge ist die USt-IdNr. des Kunden Pflicht.', 'error')
      return
    }
    setOverrideSaving(true)
    try {
      const clean = (v: string) => v.trim() || null
      const saved = await upsertCustomerOverride({
        id: editing && editing !== 'new' ? editing.id : undefined,
        match_email: overrideForm.match_email.trim().toLowerCase(),
        company_name: clean(overrideForm.company_name),
        vat_id: clean(overrideForm.vat_id)?.replace(/\s+/g, '').toUpperCase() ?? null,
        billing_address_override: clean(overrideForm.billing_address_override),
        reverse_charge: overrideForm.reverse_charge,
        note: clean(overrideForm.note),
      })
      setOverrides((prev) => {
        const idx = prev.findIndex((p) => p.id === saved.id)
        if (idx === -1) return [...prev, saved]
        const next = [...prev]
        next[idx] = saved
        return next
      })
      setEditing(null)
      toast('Kunden-Override gespeichert.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.', 'error')
    } finally {
      setOverrideSaving(false)
    }
  }

  const removeOverride = async () => {
    if (!deleting) return
    setOverrideSaving(true)
    try {
      await deleteCustomerOverride(deleting.id)
      setOverrides((prev) => prev.filter((p) => p.id !== deleting.id))
      setDeleting(null)
      toast('Override gelöscht.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.', 'error')
    } finally {
      setOverrideSaving(false)
    }
  }

  const rcMissingVat = overrides.filter((o) => o.reverse_charge && !o.vat_id)

  return (
    <div>
      <PageHeader
        title="Rechnungseinstellungen"
        description="Ausstellerdaten, Logo und Kunden-Overrides (Firma, USt-IdNr., Reverse Charge)."
        actions={
          <Link to="/rechnungen">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" /> Zu den Rechnungen
            </Button>
          </Link>
        }
      />

      {loading ? (
        <Spinner label="Einstellungen werden geladen …" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="space-y-6">
          {!isAdmin && (
            <div className="flex items-start gap-3 rounded-xl border border-line bg-sand-50 px-4 py-3 text-sm text-ink-soft">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
              Nur Admins können diese Einstellungen ändern. Du siehst sie hier zur Information.
            </div>
          )}

          {rcMissingVat.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-medium">USt-IdNr. fehlt:</span>{' '}
              {rcMissingVat.map((o) => o.company_name || o.match_email).join(', ')} – ohne USt-IdNr. können keine
              Reverse-Charge-Rechnungen erstellt werden.
            </div>
          )}

          {/* Aussteller */}
          <section className="card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-sage-600" />
              <h2 className="font-serif text-lg font-semibold text-ink">Aussteller</h2>
            </div>
            <fieldset disabled={!isAdmin} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Name / Firma (mit Rechtsform)"
                hint="Rechtsträger laut Impressum, z. B. „beeconnected GmbH“ – die Marke Hills of Hems steht im Logo und in der Anschrift."
              >
                <Input value={form.issuer_name} onChange={(e) => set('issuer_name', e.target.value)} />
              </Field>
              <Field label="Nummernpräfix" hint="Rechnungsnummer = Präfix + Jahr + fortlaufende Nummer, z. B. HOH-2026-00001.">
                <Input value={form.number_prefix} onChange={(e) => set('number_prefix', e.target.value)} />
              </Field>
              <Field label="Anschrift" hint="Mehrzeilig: Straße Nr. / PLZ Ort." className="md:row-span-2">
                <Textarea
                  value={form.issuer_address}
                  onChange={(e) => set('issuer_address', e.target.value)}
                  className="min-h-[104px]"
                />
              </Field>
              <Field label="Steuernummer" hint="Steuernummer oder USt-IdNr. ist Pflicht (§ 14 UStG).">
                <Input value={form.issuer_tax_number ?? ''} onChange={(e) => set('issuer_tax_number', e.target.value)} />
              </Field>
              <Field label="USt-IdNr." hint="Pflicht für Reverse-Charge-Rechnungen (Orderchamp).">
                <Input
                  value={form.issuer_vat_id ?? ''}
                  onChange={(e) => set('issuer_vat_id', e.target.value)}
                  placeholder="DE…"
                />
              </Field>
              <Field label="E-Mail">
                <Input type="email" value={form.issuer_email ?? ''} onChange={(e) => set('issuer_email', e.target.value)} />
              </Field>
              <Field label="Telefon">
                <Input value={form.issuer_phone ?? ''} onChange={(e) => set('issuer_phone', e.target.value)} />
              </Field>
              <Field label="Website">
                <Input value={form.issuer_web ?? ''} onChange={(e) => set('issuer_web', e.target.value)} placeholder="hillsofhems.com" />
              </Field>
              <Field label="Bankverbindung (optional)" hint="Mehrzeilig: Bank / IBAN / BIC – erscheint in der Fußzeile.">
                <Textarea value={form.bank_details ?? ''} onChange={(e) => set('bank_details', e.target.value)} />
              </Field>
              <Field label="Fußzeilentext (optional)" hint="Z. B. Hinweis, dass die Rechnung maschinell erstellt wurde.">
                <Textarea value={form.footer_text ?? ''} onChange={(e) => set('footer_text', e.target.value)} />
              </Field>
            </fieldset>
            {isAdmin && (
              <div className="mt-4 flex justify-end">
                <Button onClick={save} loading={saving}>
                  Speichern
                </Button>
              </div>
            )}
          </section>

          {/* Logo */}
          <section className="card p-5">
            <div className="mb-3 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-sage-600" />
              <h2 className="font-serif text-lg font-semibold text-ink">Logo</h2>
            </div>
            <p className="mb-3 text-sm text-ink-muted">
              PNG oder JPG, wird oben links auf der Rechnung gesetzt (max. ca. 55 × 16 mm). Ohne Logo steht dort die
              Wortmarke „Hills of Hems“.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-ink-soft">
                {form.logo_path ? (
                  <Badge tone="sage">Logo hinterlegt: {form.logo_path}</Badge>
                ) : (
                  <Badge tone="neutral">Kein Logo – Wortmarke</Badge>
                )}
              </span>
              {isAdmin && (
                <>
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-sand-50">
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      disabled={logoBusy}
                      onChange={(e) => onLogoChange(e.target.files?.[0])}
                    />
                    {logoBusy ? 'Lädt …' : form.logo_path ? 'Logo ersetzen' : 'Logo hochladen'}
                  </label>
                  {form.logo_path && (
                    <Button size="sm" variant="ghost" onClick={removeLogo} loading={logoBusy}>
                      Entfernen
                    </Button>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Kunden-Overrides */}
          <section className="card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-sage-600" />
                <h2 className="font-serif text-lg font-semibold text-ink">Kunden-Overrides</h2>
              </div>
              {isAdmin && (
                <Button size="sm" onClick={openNewOverride}>
                  <Plus className="h-4 w-4" /> Override
                </Button>
              )}
            </div>
            <p className="mb-4 text-sm text-ink-muted">
              Shopify liefert weder Firmenfeld noch USt-IdNr. Hier wird je Kunden-E-Mail hinterlegt, was auf der
              Rechnung stehen soll. Orderchamp B.V. (Reverse Charge) ist vorangelegt – bitte USt-IdNr. ergänzen.
            </p>

            {overrides.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-faint">Noch keine Overrides.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-sand-50 text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="px-4 py-3 font-semibold">Kunden-E-Mail</th>
                      <th className="px-4 py-3 font-semibold">Firma</th>
                      <th className="px-4 py-3 font-semibold">USt-IdNr.</th>
                      <th className="px-4 py-3 font-semibold">Reverse Charge</th>
                      {isAdmin && <th className="px-4 py-3" />}
                    </tr>
                  </thead>
                  <tbody>
                    {overrides.map((o) => (
                      <tr key={o.id} className="group border-b border-line last:border-0 hover:bg-sand-50/60">
                        <td className="px-4 py-2.5 text-ink">{o.match_email}</td>
                        <td className="px-4 py-2.5 text-ink-soft">
                          {o.company_name || '—'}
                          {o.note && <div className="text-xs text-ink-faint">{o.note}</div>}
                        </td>
                        <td className="px-4 py-2.5">
                          {o.vat_id ? (
                            <span className="text-ink">{o.vat_id}</span>
                          ) : (
                            <Badge tone="terracotta">fehlt</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {o.reverse_charge ? <Badge tone="blue">ja</Badge> : <span className="text-ink-faint">nein</span>}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-2.5">
                            <div className="flex justify-end gap-0.5">
                              <button
                                onClick={() => openEditOverride(o)}
                                className="cursor-pointer rounded p-1.5 text-ink-faint hover:bg-sand-100 hover:text-ink"
                                aria-label="Bearbeiten"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleting(o)}
                                className="cursor-pointer rounded p-1.5 text-ink-faint hover:text-terracotta-600"
                                aria-label="Löschen"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Neuer Kunden-Override' : 'Kunden-Override bearbeiten'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Abbrechen
            </Button>
            <Button onClick={saveOverride} loading={overrideSaving}>
              Speichern
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field
            label="Kunden-E-Mail"
            hint="Wird mit der Kunden- bzw. Bestell-E-Mail der Shopify-Bestellung verglichen (Groß-/Kleinschreibung egal)."
          >
            <Input
              type="email"
              value={overrideForm.match_email}
              onChange={(e) => setOverrideForm({ ...overrideForm, match_email: e.target.value })}
              placeholder="service+nl@orderchamp.com"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Firma" hint="Überschreibt das Firmenfeld der Rechnungsadresse.">
              <Input
                value={overrideForm.company_name}
                onChange={(e) => setOverrideForm({ ...overrideForm, company_name: e.target.value })}
              />
            </Field>
            <Field label="USt-IdNr." hint="Pflicht bei Reverse Charge.">
              <Input
                value={overrideForm.vat_id}
                onChange={(e) => setOverrideForm({ ...overrideForm, vat_id: e.target.value })}
                placeholder="NL…"
              />
            </Field>
          </div>
          <Field
            label="Rechnungsadresse (optional)"
            hint="Nur ausfüllen, wenn die Adresse aus Shopify ersetzt werden soll. Mehrzeilig, ohne Firma."
          >
            <Textarea
              value={overrideForm.billing_address_override}
              onChange={(e) => setOverrideForm({ ...overrideForm, billing_address_override: e.target.value })}
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="h-4 w-4 accent-sage-500"
              checked={overrideForm.reverse_charge}
              onChange={(e) => setOverrideForm({ ...overrideForm, reverse_charge: e.target.checked })}
            />
            Reverse Charge (innergemeinschaftliche Lieferung, § 13b UStG)
          </label>
          <Field label="Interne Notiz (optional)">
            <Input value={overrideForm.note} onChange={(e) => setOverrideForm({ ...overrideForm, note: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        message={`Override für „${deleting?.match_email}“ löschen? Bereits erstellte Rechnungen bleiben unverändert.`}
        onConfirm={removeOverride}
        onClose={() => setDeleting(null)}
        loading={overrideSaving}
      />
    </div>
  )
}
