import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Spinner } from './components/ui/States'
import { Login } from './pages/Login'
import { ProfileSetup } from './pages/ProfileSetup'
import { AppLayout } from './components/layout/AppLayout'
import { BoardPage } from './pages/BoardPage'
import { TodosPage } from './pages/TodosPage'
import { MeetingsPage } from './pages/MeetingsPage'
import { TeamPage } from './pages/TeamPage'
import { FilesPage } from './pages/FilesPage'
import { InfoPage } from './pages/InfoPage'
import { NewPageRedirect } from './pages/NewPageRedirect'
import { AdminPage } from './pages/AdminPage'

/**
 * Routing + Auth-Gates:
 *  - lädt -> Spinner
 *  - keine Session -> Login
 *  - Session ohne Profilname -> Profil-Setup
 *  - sonst -> App mit Layout
 */
export default function App() {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <Spinner label="Lädt …" />
      </div>
    )
  }

  if (!session) return <Login />

  // Profil noch nicht eingerichtet (Name leer) -> Setup erzwingen.
  if (profile && !profile.name?.trim()) return <ProfileSetup />

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/board" replace />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/todos" element={<TodosPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/pages/new" element={<NewPageRedirect />} />
        <Route path="/pages/:id" element={<InfoPage />} />
        <Route
          path="/admin"
          element={profile?.is_admin ? <AdminPage /> : <Navigate to="/board" replace />}
        />
        <Route path="*" element={<Navigate to="/board" replace />} />
      </Route>
    </Routes>
  )
}
