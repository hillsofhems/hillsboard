import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, Role } from '@/lib/types'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  /** Die dem eingeloggten Nutzer zugewiesenen Rollen (für Topbar-Anzeige). */
  myRoles: Role[]
  loading: boolean
  /** Profil + Rollen neu laden (z. B. nach Profil-Setup). */
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [myRoles, setMyRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)

  // Profil + zugewiesene Rollen für eine User-ID laden.
  const loadProfile = useCallback(async (userId: string) => {
    const [{ data: profileData }, { data: roleRows }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('user_roles').select('roles(*)').eq('user_id', userId),
    ])
    setProfile((profileData as Profile) ?? null)
    // Supabase liefert die eingebettete Relation als `roles`. Ohne generierte
    // Typen ist der Rückgabewert untypisiert -> bewusst über any normalisieren.
    const roles = ((roleRows as unknown as Array<{ roles: Role | null }>) ?? [])
      .map((r) => r.roles)
      .filter((r): r is Role => Boolean(r))
    setMyRoles(roles)
  }, [])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session?.user) {
      await loadProfile(data.session.user.id)
    }
  }, [loadProfile])

  useEffect(() => {
    let active = true

    // Session-Status kommt komplett über onAuthStateChange — das Event
    // INITIAL_SESSION deckt den App-Start ab, SIGNED_IN/SIGNED_OUT/TOKEN_REFRESHED
    // den Rest. Kein separates getSession() nötig.
    //
    // WICHTIG: Im Callback dürfen keine Supabase-Aufrufe awaited werden.
    // supabase-js hält währenddessen einen Lock (navigator.locks), und jede
    // Query wartet intern auf denselben Lock -> Deadlock, das Portal hängt
    // beim ersten Laden endlos im Spinner. Deshalb Profil-Laden per
    // setTimeout aus dem Callback herauslösen.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return
      setSession(newSession)
      if (newSession?.user) {
        const userId = newSession.user.id
        setTimeout(() => {
          if (!active) return
          loadProfile(userId).finally(() => {
            if (active) setLoading(false)
          })
        }, 0)
      } else {
        setProfile(null)
        setMyRoles([])
        setLoading(false)
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setMyRoles([])
  }, [])

  return (
    <AuthContext.Provider value={{ session, profile, myRoles, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden')
  return ctx
}
