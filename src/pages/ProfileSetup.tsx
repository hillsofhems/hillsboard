import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { Role } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { Spinner } from '@/components/ui/States'

/**
 * Kurzes Profil-Setup beim ersten Login: Name + (optional) eine Rolle wählen.
 * Erscheint, solange profile.name leer ist.
 */
export function ProfileSetup() {
  const { session, profile, refresh, signOut } = useAuth()
  const [name, setName] = useState(profile?.name ?? '')
  const [roleId, setRoleId] = useState('')
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(false)
  const [rolesLoading, setRolesLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('roles')
      .select('*')
      .order('position')
      .then(({ data }) => {
        setRoles((data as Role[]) ?? [])
        setRolesLoading(false)
      })
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.user) return
    setError(null)
    setLoading(true)
    try {
      // Eigenes Profil aktualisieren (RLS: nur eigenes Profil erlaubt).
      const { error: pErr } = await supabase
        .from('profiles')
        .update({ name: name.trim(), email: session.user.email ?? '' })
        .eq('id', session.user.id)
      if (pErr) throw pErr

      // Optional eine Rolle zuweisen.
      if (roleId) {
        const { error: rErr } = await supabase
          .from('user_roles')
          .insert({ user_id: session.user.id, role_id: roleId })
        if (rErr && !/duplicate key/i.test(rErr.message)) throw rErr
      }

      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="font-serif text-2xl font-semibold text-ink">Willkommen 👋</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Lass uns dein Profil kurz einrichten.
          </p>
        </div>

        <form onSubmit={submit} className="card flex flex-col gap-5 p-6">
          <Field label="Dein Name" htmlFor="name">
            <Input
              id="name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Engelin"
            />
          </Field>

          <Field
            label="Deine Rolle (optional)"
            htmlFor="role"
            hint="Du kannst weitere Rollen später im Team-Bereich zuweisen lassen."
          >
            {rolesLoading ? (
              <Spinner className="py-2" />
            ) : (
              <Select id="role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                <option value="">— Keine Rolle wählen —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.funktionsbereich} · {r.rolle}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {error && (
            <p className="rounded-lg bg-terracotta-50 px-3 py-2 text-sm text-terracotta-600">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={signOut}
              className="cursor-pointer text-sm text-ink-muted hover:text-ink hover:underline"
            >
              Abmelden
            </button>
            <Button type="submit" loading={loading}>
              Los geht&apos;s
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
