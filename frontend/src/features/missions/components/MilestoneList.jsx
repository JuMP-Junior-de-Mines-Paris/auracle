import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'

export default function MilestoneList({ milestones, onToggle, onDelete, onCreate }) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const today = new Date().toISOString().split('T')[0]

  async function handleAdd(e) {
    e.preventDefault()
    if (!title.trim()) return
    await onCreate(title.trim(), dueDate || null)
    setTitle('')
    setDueDate('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {milestones.length === 0 && (
        <div style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Aucun jalon pour le moment.</div>
      )}
      {milestones.map(ms => {
        const overdue = !ms.done && ms.due_date && ms.due_date < today
        return (
          <div key={ms.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
            <input
              type="checkbox"
              checked={ms.done}
              onChange={e => onToggle(ms.id, e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
            />
            <span style={{ flex: 1, fontSize: 14, color: ms.done ? 'var(--ink-4)' : 'var(--ink)', textDecoration: ms.done ? 'line-through' : 'none' }}>
              {ms.title}
            </span>
            {ms.due_date && (
              <span style={{ fontSize: 12, color: overdue ? '#dc2626' : 'var(--ink-3)', fontWeight: overdue ? 600 : 400 }}>
                {new Date(ms.due_date + 'T00:00:00').toLocaleDateString('fr-FR')}
                {overdue && ' ⚠'}
              </span>
            )}
            <button
              onClick={() => onDelete(ms.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 4, flexShrink: 0 }}
            >
              <Icon name="trash" size={13} />
            </button>
          </div>
        )
      })}

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input
          className="field"
          style={{ flex: 1, fontSize: 13 }}
          placeholder="Nouveau jalon…"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <input
          className="field"
          type="date"
          style={{ width: 150, fontSize: 13 }}
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
        />
        <button type="submit" className="btn-ghost flex items-center gap-1.5" disabled={!title.trim()}>
          <Icon name="plus" size={13} /> Ajouter
        </button>
      </form>
    </div>
  )
}
