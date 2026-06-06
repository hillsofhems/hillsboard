import { useState } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'

type Mode = 'login' | 'register'

/** Login / Registrierung über Supabase Auth (E-Mail + Passwort). */
export function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // Erfolgreich -> AuthContext reagiert auf den State-Change.
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // Wenn E-Mail-Bestätigung aktiv ist, gibt es noch keine Session.
        if (!data.session) {
          setInfo('Fast geschafft! Bitte bestätige deine E-Mail und melde dich dann an.')
          setMode('login')
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten.'
      setError(translateAuthError(message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      {/* dezente, warme Hintergrund-Textur */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sand-50/60 to-transparent" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sage-500 text-white shadow-card">
            <Logo />
          </div>
          <h1 className="font-serif text-2xl font-semibold text-ink">Hills of Hems</h1>
          <p className="mt-1 text-sm text-ink-muted">Interne Team-Zentrale</p>
        </div>

        <div className="card p-6">
          {!isSupabaseConfigured && (
            <div className="mb-4 rounded-lg border border-terracotta-200 bg-terracotta-50 px-3 py-2 text-xs text-terracotta-600">
              Supabase ist nicht konfiguriert. Bitte <code>.env</code> aus{' '}
              <code>.env.example</code> anlegen (siehe README).
            </div>
          )}

          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="E-Mail" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@hillsofhems.de"
              />
            </Field>

            <Field label="Passwort" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>

            {error && (
              <p className="rounded-lg bg-terracotta-50 px-3 py-2 text-sm text-terracotta-600">
                {error}
              </p>
            )}
            {info && (
              <p className="rounded-lg bg-sage-50 px-3 py-2 text-sm text-sage-700">{info}</p>
            )}

            <Button type="submit" loading={loading} className="w-full">
              {mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
            </Button>
          </form>

          <div className="mt-5 text-center text-sm text-ink-muted">
            {mode === 'login' ? (
              <>
                Noch kein Konto?{' '}
                <button
                  className="cursor-pointer font-medium text-sage-600 hover:underline"
                  onClick={() => {
                    setMode('register')
                    setError(null)
                    setInfo(null)
                  }}
                >
                  Registrieren
                </button>
              </>
            ) : (
              <>
                Schon ein Konto?{' '}
                <button
                  className="cursor-pointer font-medium text-sage-600 hover:underline"
                  onClick={() => {
                    setMode('login')
                    setError(null)
                    setInfo(null)
                  }}
                >
                  Anmelden
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M10 8v16M22 8v16M10 16h12" strokeLinecap="round" />
    </svg>
  )
}

// Häufige Supabase-Auth-Fehler auf Deutsch übersetzen.
function translateAuthError(message: string): string {
  if (/Invalid login credentials/i.test(message)) return 'E-Mail oder Passwort ist falsch.'
  if (/already registered/i.test(message)) return 'Diese E-Mail ist bereits registriert.'
  if (/Password should be at least/i.test(message))
    return 'Das Passwort muss mindestens 6 Zeichen lang sein.'
  if (/Email not confirmed/i.test(message))
    return 'Bitte bestätige zuerst deine E-Mail-Adresse.'
  return message
}
