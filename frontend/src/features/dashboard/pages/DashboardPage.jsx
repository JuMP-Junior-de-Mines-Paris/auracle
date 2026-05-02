import { useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { useDashboard } from '../hooks/useDashboard'
import { StatusBadge } from '../../missions/pages/MissionsPage'

function KpiCard({ label, value, color }) {
  return (
    <div className="card" style={{ padding: '20px 24px', textAlign: 'center', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function MissionCard({ mission, onClick }) {
  return (
    <div
      className="card"
      onClick={onClick}
      style={{ padding: 16, cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--paper-2)'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{mission.title}</div>
        <StatusBadge status={mission.status} />
      </div>
      {mission.client_name && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{mission.client_name}</div>}
    </div>
  )
}

function CompactMissionsTable({ missions, onNavigate }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--line)' }}>
          {['Titre', 'Client', 'Statut'].map(h => (
            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {missions.map(m => (
          <tr
            key={m.id}
            onClick={() => onNavigate(m.id)}
            style={{ cursor: 'pointer', borderBottom: '1px solid var(--line)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--paper-2)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}
          >
            <td style={{ padding: '10px 12px', fontWeight: 500 }}>{m.title}</td>
            <td style={{ padding: '10px 12px', color: 'var(--ink-2)' }}>{m.client_name || '—'}</td>
            <td style={{ padding: '10px 12px' }}><StatusBadge status={m.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function DashboardPage() {
  const { kpis, myMissions, allMissions, upcomingMilestones, loading } = useDashboard()
  const navigate = useNavigate()

  if (loading) return <div className="px-8 py-6" style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>

  return (
    <div className="px-8 py-6 fade-up">
      <h1 className="page-title" style={{ marginBottom: 24 }}>Tableau de bord</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        <KpiCard label="Missions actives" value={kpis.activeMissions} color="#1d4ed8" />
        <KpiCard label="Jalons en retard" value={kpis.lateMilestones} color={kpis.lateMilestones > 0 ? '#dc2626' : '#15803d'} />
        <KpiCard label="Consultants actifs" value={kpis.activeConsultants} color="#7c3aed" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 24, alignItems: 'start' }}>

        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="briefcase" size={15} /> Mes missions
          </h2>
          {myMissions.length === 0 ? (
            <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Vous n'êtes assigné à aucune mission.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myMissions.map(m => (
                <MissionCard key={m.id} mission={m} onClick={() => navigate(`/missions/${m.id}`)} />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="list" size={15} /> Toutes les missions
            </h2>
            {allMissions.length === 0 ? (
              <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Aucune mission enregistrée.</div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <CompactMissionsTable missions={allMissions} onNavigate={id => navigate(`/missions/${id}`)} />
              </div>
            )}
          </div>

          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="calendar" size={15} /> Prochains jalons
            </h2>
            {upcomingMilestones.length === 0 ? (
              <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Aucun jalon à venir.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {upcomingMilestones.map(ms => (
                  <div key={ms.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{ms.title}</div>
                      {ms.mission && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{ms.mission.title}</div>}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)', flexShrink: 0 }}>
                      {new Date(ms.due_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
