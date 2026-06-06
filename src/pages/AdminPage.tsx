import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ShieldCheck, Shield } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Profile, Role, UserRole } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { PageHeader } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'

type Tab = 'roles' | 'assign'

/** Admin-Bereich (nur is_admin): Rollen-CRUD + Rollen-/Admin-Zuweisung. */
export function AdminPage() {
  const [tab, setTab] = useState<Tab>('roles')

  return (
    <div>
      <PageHeader
        title="Admin-Bereich"
        description="Rollen pflegen und Team-Mitgliedern Rollen sowie Admin-Rechte zuweisen."
      />

      <div className="mb-6 inline-flex rounded-lg border border-line bg-surface p-1">
        <TabButton active={tab === 'roles'} onClick={() => setTab('roles')}>
          Rollen
        </TabButton>
        <TabButton active={tab === 'assign'} onClick={() => setTab('assign')}>
          Zuweisungen
        </TabButton>
      </div>

      {tab === 'roles' ? <RolesAdmin /> : <AssignAdmin />}
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
      className={
        'cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors ' +
        (active ? 'bg-sage-500 text-white' : 'text-ink-soft hover:bg-sand-100')
      }
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Rollen-CRUD
// ---------------------------------------------------------------------------
const EMPTY_ROLE = {
  funktionsbereich: '',
  rolle: '',
  beschreibung: '',
  verantwortlicher: '',
  weitere_personen: '',
}

function RolesAdmin() {
  const { toast } = useToast()
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Role | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Role | null>(null)
  const [form, setForm] = useState(EMPTY_ROLE)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    supabase
      .from('roles')
      .select('*')
      .order('position')
      .then(({ data }) => {
        setRoles((data as Role[]) ?? [])
        setLoading(false)
      })
  }
  useEffect(load, [])

  const openNew = () => {
    setForm(EMPTY_ROLE)
    setEditing('new')
  }
  const openEdit = (r: Role) => {
    setForm({
      funktionsbereich: r.funktionsbereich,
      rolle: r.rolle,
      beschreibung: r.beschreibung,
      verantwortlicher: r.verantwortlicher,
      weitere_personen: r.weitere_personen,
    })
    setEditing(r)
  }

  const save = async () => {
    if (!form.funktionsbereich.trim() || !form.rolle.trim()) {
      toast('Funktionsbereich und Rolle sind Pflicht.', 'error')
      return
    }
    setSaving(true)
    try {
      if (editing === 'new') {
        const maxPos = roles.reduce((m, r) => Math.max(m, r.position), 0)
        const { error } = await supabase.from('roles').insert({ ...form, position: maxPos + 1 })
        if (error) throw error
        toast('Rolle erstellt.')
      } else if (editing) {
        const { error } = await supabase.from('roles').update(form).eq('id', editing.id)
        if (error) throw error
        toast('Rolle gespeichert.')
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
    try {
      const { error } = await supabase.from('roles').delete().eq('id', deleting.id)
      if (error) throw error
      toast('Rolle gelöscht.')
      setDeleting(null)
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Rollen werden geladen …" />

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Neue Rolle
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-line bg-sand-50 text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3 font-semibold">Funktionsbereich</th>
              <th className="px-4 py-3 font-semibold">Rolle</th>
              <th className="px-4 py-3 font-semibold">Verantwortlich</th>
              <th className="px-4 py-3 font-semibold text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-sand-50/60">
                <td className="px-4 py-3 align-top">
                  <Badge tone="sand">{r.funktionsbereich}</Badge>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-ink">{r.rolle}</div>
                  <div className="text-xs text-ink-faint line-clamp-1">{r.beschreibung}</div>
                </td>
                <td className="px-4 py-3 align-top text-ink-muted">{r.verantwortlicher || '—'}</td>
                <td className="px-4 py-3 align-top">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)} aria-label="Bearbeiten">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleting(r)}
                      aria-label="Löschen"
                    >
                      <Trash2 className="h-4 w-4 text-terracotta-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Neue Rolle' : 'Rolle bearbeiten'}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Funktionsbereich">
              <Input
                value={form.funktionsbereich}
                onChange={(e) => setForm({ ...form, funktionsbereich: e.target.value })}
                placeholder="z. B. Design"
              />
            </Field>
            <Field label="Rolle">
              <Input
                value={form.rolle}
                onChange={(e) => setForm({ ...form, rolle: e.target.value })}
                placeholder="z. B. Packaging-Design"
              />
            </Field>
          </div>
          <Field label="Beschreibung">
            <Textarea
              value={form.beschreibung}
              onChange={(e) => setForm({ ...form, beschreibung: e.target.value })}
              placeholder="Was umfasst diese Rolle?"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Verantwortlich">
              <Input
                value={form.verantwortlicher}
                onChange={(e) => setForm({ ...form, verantwortlicher: e.target.value })}
                placeholder="z. B. Engelin"
              />
            </Field>
            <Field label="Weitere Personen" hint="Frei, z. B. „Silke, Tom“ oder „TEAM“">
              <Input
                value={form.weitere_personen}
                onChange={(e) => setForm({ ...form, weitere_personen: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        message={`Rolle „${deleting?.rolle}“ wirklich löschen? Zuweisungen an Team-Mitglieder werden ebenfalls entfernt.`}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
        loading={saving}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Zuweisungen: Rollen + Admin pro Nutzer
// ---------------------------------------------------------------------------
function AssignAdmin() {
  const { toast } = useToast()
  const { profile: me, refresh } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [userRoles, setUserRoles] = useState<UserRole[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const [p, r, ur] = await Promise.all([
      supabase.from('profiles').select('*').order('name'),
      supabase.from('roles').select('*').order('position'),
      supabase.from('user_roles').select('*'),
    ])
    setProfiles((p.data as Profile[]) ?? [])
    setRoles((r.data as Role[]) ?? [])
    setUserRoles((ur.data as UserRole[]) ?? [])
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  const rolesOf = (userId: string) =>
    userRoles
      .filter((ur) => ur.user_id === userId)
      .map((ur) => roles.find((r) => r.id === ur.role_id))
      .filter((r): r is Role => Boolean(r))

  const addRole = async (userId: string, roleId: string) => {
    if (!roleId) return
    setBusy(userId)
    const { error } = await supabase.from('user_roles').insert({ user_id: userId, role_id: roleId })
    if (error && !/duplicate/i.test(error.message)) toast(error.message, 'error')
    else setUserRoles((prev) => [...prev, { user_id: userId, role_id: roleId, created_at: '' }])
    setBusy(null)
  }

  const removeRole = async (userId: string, roleId: string) => {
    setBusy(userId)
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role_id', roleId)
    if (error) toast(error.message, 'error')
    else setUserRoles((prev) => prev.filter((ur) => !(ur.user_id === userId && ur.role_id === roleId)))
    setBusy(null)
  }

  const toggleAdmin = async (target: Profile) => {
    setBusy(target.id)
    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: !target.is_admin })
      .eq('id', target.id)
    if (error) {
      toast(error.message, 'error')
    } else {
      toast(target.is_admin ? 'Admin-Recht entzogen.' : 'Admin-Recht erteilt.')
      setProfiles((prev) =>
        prev.map((p) => (p.id === target.id ? { ...p, is_admin: !p.is_admin } : p)),
      )
      if (target.id === me?.id) refresh()
    }
    setBusy(null)
  }

  if (loading) return <Spinner label="Team wird geladen …" />

  return (
    <div className="space-y-4">
      {profiles.map((p) => {
        const assigned = rolesOf(p.id)
        const available = roles.filter((r) => !assigned.some((a) => a.id === r.id))
        const isSelf = p.id === me?.id
        return (
          <div key={p.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={p.name || p.email} size="md" />
                <div>
                  <div className="flex items-center gap-2 font-medium text-ink">
                    {p.name || '—'}
                    {p.is_admin && (
                      <Badge tone="terracotta" className="gap-1">
                        <ShieldCheck className="h-3 w-3" /> Admin
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-ink-muted">{p.email}</div>
                </div>
              </div>
              {/* Admin-Toggle. Eigenes Flag ist gesperrt (Trigger + UI). */}
              <Button
                size="sm"
                variant={p.is_admin ? 'subtle' : 'secondary'}
                loading={busy === p.id}
                disabled={isSelf}
                title={isSelf ? 'Eigene Admin-Rechte können nicht geändert werden.' : undefined}
                onClick={() => toggleAdmin(p)}
              >
                {p.is_admin ? <Shield className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                {p.is_admin ? 'Admin entziehen' : 'Zum Admin machen'}
              </Button>
            </div>

            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {assigned.length === 0 && (
                  <span className="text-xs italic text-ink-faint">Keine Rollen zugewiesen</span>
                )}
                {assigned.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1 rounded-full bg-sage-100 px-2.5 py-0.5 text-xs font-medium text-sage-700"
                  >
                    {r.rolle}
                    <button
                      onClick={() => removeRole(p.id, r.id)}
                      className="cursor-pointer rounded-full text-sage-600 hover:text-terracotta-600"
                      aria-label={`Rolle ${r.rolle} entfernen`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <Select
                value=""
                onChange={(e) => addRole(p.id, e.target.value)}
                className="max-w-xs"
                aria-label="Rolle zuweisen"
              >
                <option value="">+ Rolle zuweisen …</option>
                {available.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.funktionsbereich} · {r.rolle}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )
      })}
    </div>
  )
}
