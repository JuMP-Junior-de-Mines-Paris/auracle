import { useMembers } from '../hooks/useMembers'

const ROLE_LABELS = {
  admin:           'Admin',
  project_manager: 'Chef de projet',
  consultant:      'Consultant',
}

const ROLE_STYLES = {
  admin:           { background: '#dbeafe', color: '#1d4ed8' },
  project_manager: { background: '#dcfce7', color: '#15803d' },
  consultant:      { background: '#f3f4f6', color: '#374151' },
}

function MemberAvatar({ member }) {
  const initials = `${member.prenom?.[0] ?? ''}${member.nom?.[0] ?? ''}`.toUpperCase() || '?'
  const color = member.role === 'admin' ? '#015d9c' : 'var(--ink-3)'
  return (
    <span className="avatar" style={{ width: 32, height: 32, background: color + '1a', color, fontSize: 13, border: `1px solid ${color}33`, flexShrink: 0 }}>
      {initials}
    </span>
  )
}

export default function MembersPage() {
  const { members, loading, error } = useMembers()

  return (
    <div className="px-8 py-6 fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Membres</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
            {members.length} membre{members.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--bad)', fontSize: 14 }}>{error}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 48 }}></th>
                <th>Nom</th>
                <th>Email</th>
                <th>Rôle</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const roleStyle = ROLE_STYLES[m.role] ?? ROLE_STYLES.consultant
                return (
                  <tr key={m.id}>
                    <td><MemberAvatar member={m} /></td>
                    <td style={{ fontWeight: 500, fontSize: 13.5 }}>
                      {m.prenom} {m.nom?.toUpperCase()}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {m.email
                        ? <a href={`mailto:${m.email}`} style={{ color: 'var(--ember)' }}>{m.email}</a>
                        : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                    </td>
                    <td>
                      <span style={{ ...roleStyle, borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 500 }}>
                        {ROLE_LABELS[m.role] ?? m.role}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)' }}>
                    Aucun membre trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
