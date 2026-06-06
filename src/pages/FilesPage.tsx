import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, ExternalLink, Pencil, Trash2, FolderOpen, Link2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { FileLink } from '@/lib/types'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Badge } from '@/components/ui/Badge'
import { Spinner, EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'

const DEFAULT_CATEGORIES = ['Finanzen', 'Produktion', 'Marketing', 'Design']

const EMPTY_LINK = { name: '', url: '', category: '', description: '' }

/**
 * Datei-Links: manuell gepflegte Links (Google Drive etc.), durchsuch- und
 * filterbar. Das Feld `source` ist im Schema vorbereitet ('manual'|'gdrive'),
 * damit später eine echte Google-Drive-Integration ergänzt werden kann.
 */
export function FilesPage() {
  const { toast } = useToast()
  const [links, setLinks] = useState<FileLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState<FileLink | 'new' | null>(null)
  const [form, setForm] = useState(EMPTY_LINK)
  const [deleting, setDeleting] = useState<FileLink | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    setError(null)
    supabase
      .from('file_links')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setLinks((data as FileLink[]) ?? [])
        setLoading(false)
      })
  }
  useEffect(load, [])

  // Kategorien aus Defaults + vorhandenen Daten zusammenführen.
  const categories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES)
    links.forEach((l) => l.category && set.add(l.category))
    return Array.from(set)
  }, [links])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return links.filter((l) => {
      if (category && l.category !== category) return false
      if (!q) return true
      return (
        l.name.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q)
      )
    })
  }, [links, query, category])

  const openNew = () => {
    setForm(EMPTY_LINK)
    setEditing('new')
  }
  const openEdit = (l: FileLink) => {
    setForm({ name: l.name, url: l.url, category: l.category, description: l.description })
    setEditing(l)
  }

  const save = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      toast('Name und URL sind Pflicht.', 'error')
      return
    }
    // URL grob normalisieren (Schema voranstellen).
    let url = form.url.trim()
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`

    setSaving(true)
    try {
      const payload = { ...form, url, name: form.name.trim(), source: 'manual' as const }
      if (editing === 'new') {
        const { error } = await supabase.from('file_links').insert(payload)
        if (error) throw error
        toast('Link gespeichert.')
      } else if (editing) {
        const { error } = await supabase.from('file_links').update(payload).eq('id', editing.id)
        if (error) throw error
        toast('Link aktualisiert.')
      }
      setEditing(null)
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!deleting) return
    setSaving(true)
    const { error } = await supabase.from('file_links').delete().eq('id', deleting.id)
    if (error) toast(error.message, 'error')
    else {
      toast('Link gelöscht.')
      setLinks((prev) => prev.filter((l) => l.id !== deleting.id))
    }
    setDeleting(null)
    setSaving(false)
  }

  return (
    <div>
      <PageHeader
        title="Dateien & Dokumente"
        description="Wichtige Links – durchsuchbar und nach Kategorie filterbar."
        actions={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> Link
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Link suchen …"
            className="pl-9"
            aria-label="Links durchsuchen"
          />
        </div>
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="sm:w-56"
          aria-label="Nach Kategorie filtern"
        >
          <option value="">Alle Kategorien</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <Spinner label="Links werden geladen …" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={links.length === 0 ? 'Noch keine Links' : 'Keine Treffer'}
          description={
            links.length === 0
              ? 'Trage den ersten Link zu einem Dokument oder Ordner ein.'
              : 'Passe Suche oder Filter an.'
          }
          action={
            links.length === 0 ? <Button onClick={openNew}>Link hinzufügen</Button> : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((l) => (
            <div key={l.id} className="card group flex flex-col p-4 transition-shadow hover:shadow-pop">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sage-100 text-sage-600">
                  <Link2 className="h-4 w-4" />
                </div>
                <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(l)}
                    className="cursor-pointer rounded p-1.5 text-ink-faint hover:bg-sand-100 hover:text-ink"
                    aria-label="Bearbeiten"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleting(l)}
                    className="cursor-pointer rounded p-1.5 text-ink-faint hover:text-terracotta-600"
                    aria-label="Löschen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-ink hover:text-sage-600"
              >
                <span className="truncate">{l.name}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
              </a>

              {l.description && (
                <p className="mt-1 line-clamp-2 flex-1 text-sm text-ink-muted">{l.description}</p>
              )}

              {l.category && (
                <div className="mt-3">
                  <Badge tone="sand">{l.category}</Badge>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Neuer Link' : 'Link bearbeiten'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Abbrechen
            </Button>
            <Button onClick={save} loading={saving}>
              Speichern
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="z. B. Finanz-Ordner 2026"
              autoFocus
            />
          </Field>
          <Field label="URL">
            <Input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://drive.google.com/…"
            />
          </Field>
          <Field label="Kategorie" hint="Aus der Liste wählen oder eigene eintippen.">
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="z. B. Finanzen"
              list="file-categories"
            />
            <datalist id="file-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Beschreibung (optional)">
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Kurze Notiz …"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        message={`Link „${deleting?.name}“ wirklich löschen?`}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
        loading={saving}
      />
    </div>
  )
}
