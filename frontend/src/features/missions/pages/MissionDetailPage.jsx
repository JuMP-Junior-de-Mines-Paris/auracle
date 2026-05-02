import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Icon } from '../../../shared/lib/icons'
import { useAuth } from '../../auth/hooks/useAuth'
import { useMissionDetail } from '../hooks/useMissionDetail'
import { StatusBadge } from './MissionsPage'
import MissionForm from '../components/MissionForm'
import MilestoneList from '../components/MilestoneList'
import MeetingLog from '../components/MeetingLog'
import TeamPanel from '../components/TeamPanel'

const TABS = [
  { id: 'overview', label: 'Aperçu' },
  { id: 'team', label: 'Équipe' },
  { id: 'milestones', label: 'Jalons' },
  { id: 'meetings', label: 'Réunions' },
]

function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--ink-4)' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{value || '—'}</div>
    </div>
  )
}

export default function MissionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { mission, team, milestones, meetings, loading, updateMission, addTeamMember, removeTeamMember, createMilestone, toggleMilestone, deleteMilestone, createMeeting, deleteMeeting } = useMissionDetail(id)
  const [activeTab, setActiveTab] = useState('overview')
  const [showEdit, setShowEdit] = useState(false)

  if (loading) return <div className="px-8 py-6" style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
  if (!mission) return <div className="px-8 py-6" style={{ color: 'var(--ink-3)', fontSize: 14 }}>Mission introuvable.</div>

  const canEdit = user && (user.id === mission.created_by || user.id === mission.chef_de_projet)

  return (
    <div className="px-8 py-6 fade-up">
      <div style={{ marginBottom: 24 }}>
        <button className="btn-ghost flex items-center gap-1.5" style={{ marginBottom: 12, fontSize: 13 }} onClick={() => navigate('/missions')}>
          <Icon name="arrowL" size={13} /> Missions
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>{mission.title}</h1>
            {mission.client_name && <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>{mission.client_name}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <StatusBadge status={mission.status} />
            {canEdit && (
              <button className="btn-ghost flex items-center gap-1.5" onClick={() => setShowEdit(true)}>
                <Icon name="edit" size={13} /> Modifier
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: 24 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--ink)' : 'var(--ink-3)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--ink)' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 640 }}>
          <Field label="Description" value={mission.description} />
          <Field label="Statut" value={({ draft: 'Brouillon', active: 'En cours', completed: 'Terminée', archived: 'Archivée' })[mission.status]} />
          <Field label="Client" value={mission.client_name} />
          <Field label="Contact client" value={mission.client_contact_name} />
          <Field label="Email client" value={mission.client_contact_email} />
          <Field label="Budget" value={mission.budget ? `${Number(mission.budget).toLocaleString('fr-FR')} €` : null} />
          <Field label="Début" value={mission.start_date ? new Date(mission.start_date + 'T00:00:00').toLocaleDateString('fr-FR') : null} />
          <Field label="Fin" value={mission.end_date ? new Date(mission.end_date + 'T00:00:00').toLocaleDateString('fr-FR') : null} />
          <Field label="Chef de Projet" value={mission.chef ? `${mission.chef.prenom} ${mission.chef.nom}` : null} />
        </div>
      )}

      {activeTab === 'team' && (
        <TeamPanel
          team={team}
          onAdd={addTeamMember}
          onRemove={removeTeamMember}
          canManage={canEdit}
        />
      )}

      {activeTab === 'milestones' && (
        <MilestoneList
          milestones={milestones}
          onToggle={toggleMilestone}
          onDelete={deleteMilestone}
          onCreate={createMilestone}
        />
      )}

      {activeTab === 'meetings' && (
        <MeetingLog
          meetings={meetings}
          onDelete={deleteMeeting}
          onCreate={createMeeting}
        />
      )}

      {showEdit && (
        <MissionForm
          mission={mission}
          onClose={() => setShowEdit(false)}
          onSave={updateMission}
        />
      )}
    </div>
  )
}
