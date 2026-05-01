import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './features/auth/hooks/useAuth'
import ProtectedRoute from './shared/components/ProtectedRoute'
import Layout from './shared/components/Layout'
import LoginPage from './features/auth/pages/LoginPage'
import DirectoryPage from './features/directory/pages/DirectoryPage'
import ListsPage from './features/directory/pages/ListsPage'
import ListDetailPage from './features/directory/pages/ListDetailPage'

function ComingSoon({ title }) {
  return (
    <div className="flex items-center justify-center h-full text-slate-400 text-lg">
      {title} — Bientôt disponible
    </div>
  )
}

function Protected({ children }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/annuaire" replace />} />
          <Route path="/annuaire" element={<Protected><DirectoryPage /></Protected>} />
          <Route path="/annuaire/listes" element={<Protected><ListsPage /></Protected>} />
          <Route path="/annuaire/listes/:id" element={<Protected><ListDetailPage /></Protected>} />
          <Route path="/missions" element={<Protected><ComingSoon title="Missions" /></Protected>} />
          <Route path="/dashboard" element={<Protected><ComingSoon title="Dashboard" /></Protected>} />
          <Route path="/settings" element={<Protected><ComingSoon title="Paramètres" /></Protected>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
