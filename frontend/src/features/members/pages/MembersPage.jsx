import { useMembers } from '../hooks/useMembers'
import { roleMeta, groupMembers } from '../../../shared/lib/roles'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { useAction } from '../../../shared/components/ToastProvider'
import { usePermissionMatrix, useMemberAdmin } from '../../admin/hooks/useAdmin'

function MemberAvatar({ member }) {
  const initials = `${member.prenom?.[0] ?? ''}${member.nom?.[0] ?? ''}`.toUpperCase() || '?'
  const color = roleMeta(member.role).fg
  return (
    <span className="avatar" style={{ width: 32, height: 32, background: color + '1a', color, fontSize: 13, border: `1px solid ${color}33`, flexShrink: 0 }}>
      {initials}
    </span>
  )
}

export default function MembersPage() {
  // Une seule page pour les vingt-et-un membres : elle se contente d'être
  // un annuaire interne, et devient modifiable pour qui en a le droit.
  const { members, loading, error, refetch } = useMembers()
  const { roles } = usePermissionMatrix()
  const { setRole } = useMemberAdmin()
  const { can } = usePermissions()
  const run = useAction()
  const modifiable = can('members.set_role')

  return (
    <div className="px-8 py-6 fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Membres</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
            {members.length} membre{members.length !== 1 ? 's' : ''}
            {modifiable && ' · vous pouvez changer les rôles'}
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
              {groupMembers(members).flatMap(group => [
                <tr key={`g-${group.groupe}`}>
                  <td
                    colSpan={4}
                    className="font-mono"
                    style={{
                      background: 'var(--paper-2)', color: 'var(--ink-3)',
                      fontSize: 10.5, letterSpacing: '.09em', textTransform: 'uppercase',
                      padding: '7px 14px',
                    }}
                  >
                    {group.label} · {group.members.length}
                  </td>
                </tr>,
                ...group.members.map(m => {
                const role = roleMeta(m.role)
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
                      {modifiable ? (
                        <select
                          className="field"
                          style={{ fontSize: 12.5, padding: '4px 7px', background: role.bg, color: role.fg }}
                          value={m.role ?? ''}
                          onChange={e => run(
                            async () => { await setRole(m.id, e.target.value); await refetch() },
                            { succes: `${m.prenom ?? 'Ce membre'} est désormais ${roleMeta(e.target.value).label.toLowerCase()}` }
                          )}
                        >
                          {roles.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                        </select>
                      ) : (
                        <span
                          title={role.label}
                          style={{ background: role.bg, color: role.fg, borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}
                        >
                          {role.short}
                        </span>
                      )}
                    </td>
                  </tr>
                )
                }),
              ])}
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
