import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './features/auth/hooks/useAuth'
import ProtectedRoute from './shared/components/ProtectedRoute'
import ErrorBoundary from './shared/components/ErrorBoundary'
import Layout from './shared/components/Layout'
import LoginPage from './features/auth/pages/LoginPage'
import DirectoryPage from './features/directory/pages/DirectoryPage'
import ListsPage from './features/directory/pages/ListsPage'
import MembersPage from './features/members/pages/MembersPage'
import MissionsPage from './features/missions/pages/MissionsPage'
import MissionDetailPage from './features/missions/pages/MissionDetailPage'
import DashboardPage from './features/dashboard/pages/DashboardPage'
import FollowupsPage from './features/directory/pages/FollowupsPage'
import ProgressionPage from './features/directory/pages/ProgressionPage'
import SegmentsPage from './features/directory/pages/SegmentsPage'
import TasksPage from './features/tasks/pages/TasksPage'
import AdminPage from './features/admin/pages/AdminPage'
import RoleRoute from './shared/components/RoleRoute'
import CampaignPage from './features/directory/pages/CampaignPage'
import SettingsPage from './features/settings/pages/SettingsPage'
import NotebooksPage from './features/notebooks/pages/NotebooksPage'
import NotebookPage from './features/notebooks/pages/NotebookPage'
import CePage from './features/ce/pages/CePage'
import { ToastProvider } from './shared/components/ToastProvider'

function Protected({ children }) {
  return (
    <ProtectedRoute>
      <Layout>
        <ErrorBoundary>{children}</ErrorBoundary>
      </Layout>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/annuaire" element={<Protected><DirectoryPage /></Protected>} />
          <Route path="/annuaire/listes" element={<Protected><ListsPage /></Protected>} />
          <Route path="/annuaire/listes/:id" element={<Protected><CampaignPage /></Protected>} />
          <Route path="/annuaire/segments" element={<Protected><SegmentsPage /></Protected>} />
          <Route path="/annuaire/relances" element={<Protected><FollowupsPage /></Protected>} />
          <Route path="/annuaire/progression" element={<Protected><ProgressionPage /></Protected>} />
          <Route path="/taches" element={<Protected><TasksPage /></Protected>} />
          <Route path="/conventions" element={<Protected><CePage /></Protected>} />
          <Route path="/carnets" element={<Protected><NotebooksPage /></Protected>} />
          <Route path="/carnets/:id" element={<Protected><NotebookPage /></Protected>} />
          <Route path="/membres" element={<Protected><MembersPage /></Protected>} />
          <Route path="/admin" element={<Protected><RoleRoute perm={['members.set_role', 'permissions.manage', 'audit.read']}><AdminPage /></RoleRoute></Protected>} />
          <Route path="/missions" element={<Protected><MissionsPage /></Protected>} />
          <Route path="/missions/:id" element={<Protected><MissionDetailPage /></Protected>} />
          <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
          <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
        </Routes>
      </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
