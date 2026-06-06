import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Scale,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { FinanceEntry, FinanceSection } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner, ErrorState, EmptyState } from '@/components/ui/States'
import { cn, formatEUR, formatShortDate } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

type View = 'guv' | 'bilanz'

const SECTION_LABEL: Record<FinanceSection, string> = {
  income: 'Einnahme',
  expense: 'Ausgabe',
  asset: 'Aktiva',
  liability: 'Passiva',
}

// Kategorie-Vorschläge je Bereich (frei ergänzbar).
const CATEGORY_SUGGESTIONS: Record<FinanceSection, string[]> = {
  income: ['Privatverkauf', 'Märkte & Events', 'Online-Shop', 'B2B', 'Weihnachtsmärkte', 'Sonstiges'],
  expense: [
    'Wareneinkauf',
    'EU-Erwerb',
    'Zölle & Fracht',
    'Marketing',
    'Logistik & Versand',
    'Fixkosten & Software',
    'Miete',
    'Sonstiges',
  ],
  asset: ['Lagerbestand', 'Bank / Kasse', 'Forderungen', 'Sonstiges'],
  liability: ['Eigenkapital', 'Verbindlichkeiten', 'Rückstellungen', 'Sonstiges'],
}

const sum = (rows: FinanceEntry[]) => rows.reduce((s, r) => s + Number(r.amount), 0)

/** Umfassende Finanzseite: Jahr wählen, GuV (Einnahmen/Ausgaben kategorisiert)
 *  und Bilanz (Aktiva/Passiva) verwalten. */
export function FinancePage() {
  const { toast } = useToast()
  const { profile } = useAuth()
  const [entries, setEntries] = useState<FinanceEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState<number>(2026)
  const [view, setView] = useState<View>('guv')
  const [editing, setEditing] = useState<FinanceEntry | { section: FinanceSection } | null>(null)
  const [deleting, setDeleting] = useState<FinanceEntry | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    supabase
      .from('finance_entries')
      .select('*')
      .order('entry_date', { ascending: false, nullsFirst: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setEntries((data as FinanceEntry[]) ?? [])
        setLoading(false)
      })
  }
  useEffect(load, [])

  const years = useMemo(() => {
    const set = new Set<number>([2025, 2026])
    entries.forEach((e) => set.add(e.year))
    return [...set].sort((a, b) => b - a)
  }, [entries])

  const yearEntries = useMemo(() => entries.filter((e) => e.year === year), [entries, year])
  const income = yearEntries.filter((e) => e.section === 'income')
  const expense = yearEntries.filter((e) => e.section === 'expense')
  const assets = yearEntries.filter((e) => e.section === 'asset')
  const liabilities = yearEntries.filter((e) => e.section === 'liability')

  const incomeTotal = sum(income)
  const expenseTotal = sum(expense)
  const result = incomeTotal - expenseTotal
  const assetTotal = sum(assets)
  const liabilityTotal = sum(liabilities)

  const remove = async () => {
    if (!deleting) return
    const { error } = await supabase.from('finance_entries').delete().eq('id', deleting.id)
    if (error) toast(error.message, 'error')
    else {
      toast('Buchung gelöscht.')
      setEntries((prev) => prev.filter((e) => e.id !== deleting.id))
    }
    setDeleting(null)
  }

  return (
    <div>
      <PageHeader
        title="Finanzen"
        description="Einnahmen, Ausgaben und Bilanz – pro Jahr."
      />

      {/* Jahres-Auswahl */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={cn(
              'cursor-pointer rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors',
              y === year
                ? 'border-sage-400 bg-sage-500 text-white'
                : 'border-line-strong bg-surface text-ink-soft hover:bg-sand-50',
            )}
          >
            {y}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Finanzen werden geladen …" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          {/* Kennzahlen-Karten */}
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Einnahmen"
              value={formatEUR(incomeTotal)}
              icon={TrendingUp}
              tone="sage"
            />
            <StatCard
              label="Ausgaben"
              value={formatEUR(expenseTotal)}
              icon={TrendingDown}
              tone="terracotta"
            />
            <StatCard
              label="Ergebnis (EBIT)"
              value={formatEUR(result)}
              icon={Scale}
              tone={result >= 0 ? 'sage' : 'terracotta'}
            />
          </div>

          {/* Ansicht-Umschalter */}
          <div className="mb-5 inline-flex rounded-lg border border-line bg-surface p-1">
            <TabButton active={view === 'guv'} onClick={() => setView('guv')}>
              Einnahmen & Ausgaben
            </TabButton>
            <TabButton active={view === 'bilanz'} onClick={() => setView('bilanz')}>
              Aktiva & Passiva
            </TabButton>
          </div>

          {view === 'guv' ? (
            <GuvView
              income={income}
              expense={expense}
              incomeTotal={incomeTotal}
              expenseTotal={expenseTotal}
              onAdd={(section) => setEditing({ section })}
              onEdit={setEditing}
              onDelete={setDeleting}
            />
          ) : (
            <BilanzView
              assets={assets}
              liabilities={liabilities}
              assetTotal={assetTotal}
              liabilityTotal={liabilityTotal}
              onAdd={(section) => setEditing({ section })}
              onEdit={setEditing}
              onDelete={setDeleting}
            />
          )}
        </>
      )}

      {editing && (
        <EntryModal
          year={year}
          initial={editing}
          authorId={profile?.id ?? null}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setEntries((prev) =>
              isNew ? [saved, ...prev] : prev.map((e) => (e.id === saved.id ? saved : e)),
            )
            setEditing(null)
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        message={`Buchung „${deleting?.description || deleting?.category}" (${formatEUR(
          Number(deleting?.amount ?? 0),
        )}) löschen?`}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// GuV: Einnahmen & Ausgaben (kategorisiert + Buchungsliste)
// ---------------------------------------------------------------------------
function GuvView({
  income,
  expense,
  incomeTotal,
  expenseTotal,
  onAdd,
  onEdit,
  onDelete,
}: {
  income: FinanceEntry[]
  expense: FinanceEntry[]
  incomeTotal: number
  expenseTotal: number
  onAdd: (section: FinanceSection) => void
  onEdit: (e: FinanceEntry) => void
  onDelete: (e: FinanceEntry) => void
}) {
  const all = [...income, ...expense].sort((a, b) =>
    (b.entry_date ?? '').localeCompare(a.entry_date ?? ''),
  )
  return (
    <div className="space-y-6">
      {/* Kategorie-Aufschlüsselung */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryBreakdown title="Einnahmen nach Kategorie" rows={income} tone="sage" total={incomeTotal} />
        <CategoryBreakdown
          title="Ausgaben nach Kategorie"
          rows={expense}
          tone="terracotta"
          total={expenseTotal}
        />
      </div>

      {/* Buchungen */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-ink">Buchungen</h2>
          <Button onClick={() => onAdd('income')}>
            <Plus className="h-4 w-4" /> Buchung
          </Button>
        </div>

        {all.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="Noch keine Buchungen"
            description="Trage die erste Einnahme oder Ausgabe ein – das System ordnet sie nach Kategorie."
            action={<Button onClick={() => onAdd('income')}>Buchung anlegen</Button>}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line bg-sand-50 text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-3 font-semibold">Datum</th>
                  <th className="px-4 py-3 font-semibold">Art</th>
                  <th className="px-4 py-3 font-semibold">Kategorie</th>
                  <th className="px-4 py-3 font-semibold">Beschreibung</th>
                  <th className="px-4 py-3 text-right font-semibold">Betrag</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {all.map((e) => {
                  const isIncome = e.section === 'income'
                  return (
                    <tr key={e.id} className="group border-b border-line last:border-0 hover:bg-sand-50/60">
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                        {e.entry_date ? formatShortDate(e.entry_date) : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                            isIncome ? 'bg-sage-100 text-sage-700' : 'bg-terracotta-100 text-terracotta-600',
                          )}
                        >
                          {isIncome ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {isIncome ? 'Einnahme' : 'Ausgabe'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-ink">{e.category}</td>
                      <td className="max-w-xs px-4 py-2.5 text-ink-muted">{e.description}</td>
                      <td
                        className={cn(
                          'whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums',
                          isIncome ? 'text-sage-700' : 'text-terracotta-600',
                        )}
                      >
                        {isIncome ? '+' : '−'}
                        {formatEUR(Number(e.amount))}
                      </td>
                      <td className="px-4 py-2.5">
                        <RowActions onEdit={() => onEdit(e)} onDelete={() => onDelete(e)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bilanz: Aktiva & Passiva
// ---------------------------------------------------------------------------
function BilanzView({
  assets,
  liabilities,
  assetTotal,
  liabilityTotal,
  onAdd,
  onEdit,
  onDelete,
}: {
  assets: FinanceEntry[]
  liabilities: FinanceEntry[]
  assetTotal: number
  liabilityTotal: number
  onAdd: (section: FinanceSection) => void
  onEdit: (e: FinanceEntry) => void
  onDelete: (e: FinanceEntry) => void
}) {
  const diff = assetTotal - liabilityTotal
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BalanceColumn
          title="Aktiva"
          subtitle="Vermögen"
          rows={assets}
          total={assetTotal}
          tone="sage"
          onAdd={() => onAdd('asset')}
          onEdit={onEdit}
          onDelete={onDelete}
        />
        <BalanceColumn
          title="Passiva"
          subtitle="Kapital & Schulden"
          rows={liabilities}
          total={liabilityTotal}
          tone="terracotta"
          onAdd={() => onAdd('liability')}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>

      {/* Bilanz-Check */}
      <div
        className={cn(
          'flex items-center justify-between rounded-xl border px-4 py-3 text-sm',
          Math.abs(diff) < 0.005
            ? 'border-sage-200 bg-sage-50 text-sage-700'
            : 'border-amber-200 bg-amber-50 text-amber-700',
        )}
      >
        <span className="font-medium">Bilanz-Check</span>
        {Math.abs(diff) < 0.005 ? (
          <span>Aktiva = Passiva ✓</span>
        ) : (
          <span>
            Differenz {formatEUR(diff)} — Aktiva und Passiva sind noch nicht ausgeglichen.
          </span>
        )}
      </div>
    </div>
  )
}

function BalanceColumn({
  title,
  subtitle,
  rows,
  total,
  tone,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string
  subtitle: string
  rows: FinanceEntry[]
  total: number
  tone: 'sage' | 'terracotta'
  onAdd: () => void
  onEdit: (e: FinanceEntry) => void
  onDelete: (e: FinanceEntry) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line bg-sand-50 px-4 py-3">
        <div>
          <h3 className="font-serif text-base font-semibold text-ink">{title}</h3>
          <p className="text-2xs uppercase tracking-wide text-ink-faint">{subtitle}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Position
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-faint">Noch keine Positionen.</p>
      ) : (
        <ul>
          {rows.map((e) => (
            <li
              key={e.id}
              className="group flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0 hover:bg-sand-50/60"
            >
              <span className={cn('h-2 w-2 shrink-0 rounded-full', tone === 'sage' ? 'bg-sage-500' : 'bg-terracotta-500')} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink">{e.category}</div>
                {e.description && <div className="truncate text-xs text-ink-muted">{e.description}</div>}
              </div>
              <span className="whitespace-nowrap font-medium tabular-nums text-ink">
                {formatEUR(Number(e.amount))}
              </span>
              <RowActions onEdit={() => onEdit(e)} onDelete={() => onDelete(e)} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between border-t border-line bg-sand-50/60 px-4 py-3 font-semibold text-ink">
        <span>Summe {title}</span>
        <span className="tabular-nums">{formatEUR(total)}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hilfs-Komponenten
// ---------------------------------------------------------------------------
function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  tone: 'sage' | 'terracotta'
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          tone === 'sage' ? 'bg-sage-100 text-sage-700' : 'bg-terracotta-100 text-terracotta-600',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-ink-muted">{label}</div>
        <div className="truncate text-lg font-semibold tabular-nums text-ink">{value}</div>
      </div>
    </div>
  )
}

function CategoryBreakdown({
  title,
  rows,
  tone,
  total,
}: {
  title: string
  rows: FinanceEntry[]
  tone: 'sage' | 'terracotta'
  total: number
}) {
  // Nach Kategorie gruppieren und summieren – das ist die automatische Ordnung.
  const groups = useMemo(() => {
    const m: Record<string, number> = {}
    rows.forEach((r) => (m[r.category] = (m[r.category] ?? 0) + Number(r.amount)))
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [rows])
  const max = groups.reduce((mx, [, v]) => Math.max(mx, v), 0) || 1

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-serif text-base font-semibold text-ink">{title}</h3>
        <span className="text-sm font-medium tabular-nums text-ink-soft">{formatEUR(total)}</span>
      </div>
      {groups.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-faint">Keine Daten.</p>
      ) : (
        <ul className="space-y-2.5">
          {groups.map(([cat, val]) => (
            <li key={cat}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-ink-soft">{cat}</span>
                <span className="tabular-nums text-ink">{formatEUR(val)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-sand-100">
                <div
                  className={cn('h-full rounded-full', tone === 'sage' ? 'bg-sage-500' : 'bg-terracotta-500')}
                  style={{ width: `${(val / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex shrink-0 gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
      <button
        onClick={onEdit}
        className="cursor-pointer rounded p-1.5 text-ink-faint hover:bg-sand-100 hover:text-ink"
        aria-label="Bearbeiten"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onDelete}
        className="cursor-pointer rounded p-1.5 text-ink-faint hover:text-terracotta-600"
        aria-label="Löschen"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-sage-500 text-white' : 'text-ink-soft hover:bg-sand-100',
      )}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Buchung anlegen / bearbeiten
// ---------------------------------------------------------------------------
function EntryModal({
  year,
  initial,
  authorId,
  onClose,
  onSaved,
}: {
  year: number
  initial: FinanceEntry | { section: FinanceSection }
  authorId: string | null
  onClose: () => void
  onSaved: (entry: FinanceEntry, isNew: boolean) => void
}) {
  const { toast } = useToast()
  const existing = 'id' in initial ? initial : null
  const isBilanz = (initial.section === 'asset' || initial.section === 'liability')

  const [section, setSection] = useState<FinanceSection>(initial.section)
  const [category, setCategory] = useState(existing?.category ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '')
  const [date, setDate] = useState(existing?.entry_date ?? `${year}-12-31`)
  const [saving, setSaving] = useState(false)

  // Erlaubte Bereiche je Modus (GuV vs. Bilanz)
  const sectionOptions: FinanceSection[] = isBilanz ? ['asset', 'liability'] : ['income', 'expense']

  const save = async () => {
    const amt = parseFloat(amount.replace(',', '.'))
    if (!Number.isFinite(amt) || amt <= 0) {
      toast('Bitte einen gültigen Betrag eingeben.', 'error')
      return
    }
    if (!category.trim()) {
      toast('Bitte eine Kategorie wählen.', 'error')
      return
    }
    setSaving(true)
    const payload = {
      year,
      section,
      category: category.trim(),
      description: description.trim(),
      amount: amt,
      entry_date: isBilanz ? (date || null) : date || null,
    }
    if (existing) {
      const { data, error } = await supabase
        .from('finance_entries')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) toast(error.message, 'error')
      else {
        toast('Gespeichert.')
        onSaved(data as FinanceEntry, false)
      }
    } else {
      const { data, error } = await supabase
        .from('finance_entries')
        .insert({ ...payload, created_by: authorId })
        .select()
        .single()
      if (error) toast(error.message, 'error')
      else {
        toast('Buchung angelegt.')
        onSaved(data as FinanceEntry, true)
      }
    }
    setSaving(false)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? 'Buchung bearbeiten' : isBilanz ? 'Neue Bilanz-Position' : 'Neue Buchung'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={save} loading={saving}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Art">
            <Select value={section} onChange={(e) => setSection(e.target.value as FinanceSection)}>
              {sectionOptions.map((s) => (
                <option key={s} value={s}>
                  {SECTION_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Betrag (€)">
            <Input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              autoFocus
            />
          </Field>
        </div>

        <Field label="Kategorie" hint="Aus der Liste wählen oder eigene eintippen – wird automatisch gruppiert.">
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="z. B. Marketing"
            list="finance-categories"
          />
          <datalist id="finance-categories">
            {CATEGORY_SUGGESTIONS[section].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        <Field label="Beschreibung (optional)">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Kurze Notiz, z. B. Lieferant / Anlass"
          />
        </Field>

        <Field label={isBilanz ? 'Stichtag' : 'Datum'}>
          <Input type="date" value={date ?? ''} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
