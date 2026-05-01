import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './features/auth/hooks/useAuth'
import ProtectedRoute from './shared/components/ProtectedRoute'
import Layout from './shared/components/Layout'
import LoginPage from './features/auth/pages/LoginPage'
import DirectoryPage from './features/directory/pages/DirectoryPage'
import ListsPage from './features/directory/pages/ListsPage'

function ComingSoon({ title }) {
  return (
    <div className="px-8 py-6 fade-up">
      <h1 className="page-title" style={{ marginBottom: 12 }}>{title}</h1>
      <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--paper-2)', border: '1px solid var(--line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>Bientôt disponible</div>
        <div style={{ fontSize: 14, color: 'var(--ink-3)', maxWidth: 300, margin: '0 auto' }}>
          Cette fonctionnalité sera disponible dans une prochaine version de JuMP Oracle.
        </div>
      </div>
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
          <Route path="/annuaire/listes/:id" element={<Protected><ListsPage /></Protected>} />
          <Route path="/missions" element={<Protected><ComingSoon title="Missions" /></Protected>} />
          <Route path="/dashboard" element={<Protected><ComingSoon title="Tableau de bord" /></Protected>} />
          <Route path="/settings" element={<Protected><ComingSoon title="Paramètres" /></Protected>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
