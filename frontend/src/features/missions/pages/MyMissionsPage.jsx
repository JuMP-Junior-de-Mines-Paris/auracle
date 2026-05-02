import { useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { useMyMissions } from '../hooks/useMyMissions'
import { StatusBadge } from './MissionsPage'

const today = new Date().toISOString().split('T')[0]

function MissionCard({ mission, milestones, navigate }) {
  const ms = milestones.filter(m => m.mission_id === mission.id)
  const done = ms.filter(m => m.done).length
  const total = ms.length
  const overdue = ms.filter(m => !m.done && m.due_date && m.due_date < today)
  const next = ms.filter(m => !m.done && m.due_date && m.due_date >= today)[0]
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)

  return (
    <div
      className="card"
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, cursor: 'pointer' }}
      onClick={() => navigate(`/missions/${mission.id}`)}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--paper-2)'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{mission.title}</div>
          {mission.client_name && (
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>{mission.client_name}</div>
          )}
        </div>
        <StatusBadge status={mission.status} />
      </div>

      {/* Milestones summary */}
      {total > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {done}/{total} jalons complétés
            </span>
            {overdue.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="zap" size={11} /> {overdue.length} en retard
              </span>
            )}
          </div>
          <div className="bar">
            <i style={{ width: `${pct}%`, background: pct === 100 ? '#15803d' : 'var(--ember)' }} />
          </div>
        </div>
      )}

      {/* Next milestone */}
      {next ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
          <Icon name="calendar" size={13} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{next.title}</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)', flexShrink: 0 }}>
            {new Date(next.due_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </span>
        </div>
      ) : total === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink-4)', fontStyle: 'italic' }}>Aucun jalon défini</div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--ink-4)', fontStyle: 'italic' }}>Tous les jalons complétés</div>
      )}

      {/* Dates */}
      {(mission.start_date || mission.end_date) && (
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--ink-4)', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          {mission.start_date && (
            <span>Début : {new Date(mission.start_date + 'T00:00:00').toLocaleDateString('fr-FR')}</span>
          )}
          {mission.end_date && (
            <span>Fin : {new Date(mission.end_date + 'T00:00:00').toLocaleDateString('fr-FR')}</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function MyMissionsPage() {
  const { missions, milestones, loading } = useMyMissions()
  const navigate = useNavigate()

  const active = missions.filter(m => m.status === 'active')
  const allOverdue = milestones.filter(m => !m.done && m.due_date && m.due_date < today)

  if (loading) return <div className="px-8 py-6" style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>

  return (
    <div className="px-8 py-6 fade-up">
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Mes missions</h1>
        <div style={{ display: 'flex', gap: 20, fontSize: 13, color: 'var(--ink-3)', marginTop: 8 }}>
          <span><strong style={{ color: 'var(--ink)' }}>{missions.length}</strong> mission{missions.length !== 1 ? 's' : ''}</span>
          <span><strong style={{ color: '#1d4ed8' }}>{active.length}</strong> en cours</span>
          {allOverdue.length > 0 && (
            <span><strong style={{ color: '#dc2626' }}>{allOverdue.length}</strong> jalon{allOverdue.length !== 1 ? 's' : ''} en retard</span>
          )}
        </div>
      </div>

      {missions.length === 0 ? (
        <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--paper-2)', border: '1px solid var(--line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Icon name="briefcase" size={20} stroke="var(--ink-3)" />
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)', marginBottom: 6 }}>Aucune mission assignée</div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            Vous apparaîtrez ici dès qu'une mission vous sera assignée comme chef de projet.
          </div>
          <button
            className="btn-ghost"
            style={{ marginTop: 20 }}
            onClick={() => navigate('/missions')}
          >
            Voir toutes les missions
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {missions.map(m => (
            <MissionCard
              key={m.id}
              mission={m}
              milestones={milestones}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
