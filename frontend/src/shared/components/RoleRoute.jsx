import { Icon } from '../lib/icons'
import { usePermissions } from '../../features/auth/hooks/usePermissions'

/**
 * Route réservée aux détenteurs d'une permission.
 *
 * Volontairement un écran d'explication et non une redirection : renvoyer
 * silencieusement vers l'accueil laisse croire à un bug. On dit ce qui
 * manque et à qui s'adresser.
 */
export default function RoleRoute({ perm, children }) {
  const { can, loading } = usePermissions()

  if (loading) {
    return (
      <div className="px-8 py-6" style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
    )
  }

  if (can(perm)) return children

  return (
    <div className="px-8 py-6 fade-up">
      <div className="card" style={{ padding: '60px 40px', textAlign: 'center', maxWidth: 460, margin: '40px auto' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--paper-2)', border: '1px solid var(--line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, color: 'var(--ink-3)' }}>
          <Icon name="lock" size={22} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>Accès réservé</div>
        <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>
          Cette page demande une permission que votre rôle n'a pas.
          Demandez-la à un membre du bureau.
        </div>
      </div>
    </div>
  )
}
