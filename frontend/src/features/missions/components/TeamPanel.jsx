import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'
import { useMembers } from '../../members/hooks/useMembers'

const ROLE_LABELS = { admin: 'Admin', project_manager: 'Chef de Projet', consultant: 'Consultant' }

function MemberAvatar({ member, size = 32 }) {
  const initials = `${member.prenom?.[0] ?? ''}${member.nom?.[0] ?? ''}`.toUpperCase() || '?'
  const hue = (member.id ?? '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <span className="avatar" style={{
      width: size, height: size,
      background: `oklch(0.88 0.06 ${hue})`,
      color: `oklch(0.32 0.10 ${hue})`,
      fontSize: Math.max(10, size * 0.38),
      border: '1px solid var(--line)',
      flexShrink: 0,
    }}>
      {initials}
    </span>
  )
}

export default function TeamPanel({ team, onAdd, onRemove, currentUserId, missionCreatedBy, chefDeProjet }) {
  const { members } = useMembers()
  const [query, setQuery] = useState('')
  const canManage = currentUserId === missionCreatedBy || currentUserId === chefDeProjet
  const teamIds = new Set(team.map(m => m.id))
  const filtered = members.filter(m => {
    if (teamIds.has(m.id)) return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return `${m.prenom} ${m.nom}`.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {team.length === 0 && (
        <div style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Aucun consultant assigné.</div>
      )}
      {team.map(m => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
          <MemberAvatar member={m} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{m.prenom} {m.nom}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{ROLE_LABELS[m.role] ?? m.role}</div>
          </div>
          {canManage && (
            <button onClick={() => onRemove(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 4 }}>
              <Icon name="x" size={13} />
            </button>
          )}
        </div>
      ))}

      {canManage && (
        <div style={{ marginTop: 8 }}>
          <input
            className="field"
            style={{ fontSize: 13, marginBottom: 8 }}
            placeholder="Rechercher un membre…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query.trim() && filtered.map(m => (
            <button
              key={m.id}
              className="btn-ghost"
              style={{ width: '100%', justifyContent: 'flex-start', fontSize: 13, marginBottom: 4 }}
              onClick={() => { onAdd(m.id); setQuery('') }}
            >
              <MemberAvatar member={m} size={24} />
              <span style={{ marginLeft: 8 }}>{m.prenom} {m.nom}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
