import { Navigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/hooks/useAuth'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-slate-400">
        Chargement…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}
