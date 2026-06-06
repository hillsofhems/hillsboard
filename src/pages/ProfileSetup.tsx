import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'

/**
 * Kurzes Profil-Setup beim ersten Login: nur der Name.
 * Die Rolle(n) werden später im Admin-Bereich zugewiesen – hier nicht wählbar.
 * Erscheint, solange profile.name leer ist.
 */
export function ProfileSetup() {
  const { session, profile, refresh, signOut } = useAuth()
  const [name, setName] = useState(profile?.name ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.user) return
    setError(null)
    setLoading(true)
    try {
      // Upsert statt Update: legt die Profilzeile notfalls an, falls der
      // Auth-Trigger sie (noch) nicht erstellt hat. RLS erlaubt nur das
      // eigene Profil (auth.uid() = id).
      const { error: pErr } = await supabase.from('profiles').upsert(
        {
          id: session.user.id,
          name: name.trim(),
          email: session.user.email ?? '',
        },
        { onConflict: 'id' },
      )
      if (pErr) throw pErr

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
          <p className="mt-1 text-sm text-ink-muted">Wie sollen dich die anderen sehen?</p>
        </div>

        <form onSubmit={submit} className="card flex flex-col gap-5 p-6">
          <Field
            label="Dein Name"
            htmlFor="name"
            hint="Deine Rolle wird später im Team-Bereich zugewiesen."
          >
            <Input
              id="name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Tom"
            />
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
            <Button type="submit" loading={loading} disabled={!name.trim()}>
              Los geht&apos;s
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
