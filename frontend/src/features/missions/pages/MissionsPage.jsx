import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import Can from '../../../shared/components/Can'
import { useMissions } from '../hooks/useMissions'
import { useMembers } from '../../members/hooks/useMembers'
import MissionForm from '../components/MissionForm'

const STATUS_LABELS = { draft: 'Brouillon', active: 'En cours', completed: 'Terminée', archived: 'Archivée' }
const STATUS_COLORS = {
  draft:     { background: 'var(--paper-2)', color: 'var(--ink-3)' },
  active:    { background: '#dbeafe', color: '#1d4ed8' },
  completed: { background: '#dcfce7', color: '#15803d' },
  archived:  { background: 'var(--paper-2)', color: 'var(--ink-4)' },
}

function StatusBadge({ status }) {
  const style = STATUS_COLORS[status] ?? STATUS_COLORS.draft
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: '.04em', ...style }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export { StatusBadge }

export default function MissionsPage() {
  const { missions, loading, error, createMission } = useMissions()
  const { members, loading: loadingMembers } = useMembers()
  const [showForm, setShowForm] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="px-8 py-6 fade-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 className="page-title">Missions</h1>
        <Can perm="missions.create">
          <button className="btn-ember flex items-center gap-1.5" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={14} /> Nouvelle mission
          </button>
        </Can>
      </div>

      {loading ? (
        <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
      ) : error ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--bad)', fontSize: 14 }}>
          {error}
        </div>
      ) : missions.length === 0 ? (
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center', color: 'var(--ink-3)' }}>
          Aucune mission pour le moment.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Titre', 'Client', 'Chef de Projet', 'Statut', 'Fin'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {missions.map(m => (
                <tr
                  key={m.id}
                  onClick={() => navigate(`/missions/${m.id}`)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--line)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--paper-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500 }}>{m.title}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink-2)' }}>{m.client_name || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink-2)' }}>{m.chef ? `${m.chef.prenom} ${m.chef.nom}` : '—'}</td>
                  <td style={{ padding: '12px 16px' }}><StatusBadge status={m.status} /></td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--ink-2)' }}>{m.end_date ? new Date(m.end_date).toLocaleDateString('fr-FR') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <MissionForm
          members={members}
          loadingMembers={loadingMembers}
          onClose={() => setShowForm(false)}
          onSave={createMission}
        />
      )}
    </div>
  )
}
