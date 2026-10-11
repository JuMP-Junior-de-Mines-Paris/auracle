import { useState } from 'react'
import { Icon } from '../../../shared/lib/icons'
import { useMembers } from '../../members/hooks/useMembers'
import { useTasks, groupByDue, taskStatus, taskPriority, TASK_STATUSES, PRIORITIES } from '../hooks/useTasks'

function TaskRow({ task, members, onUpdate, onRemove }) {
  const st = taskStatus(task.status)
  const pr = taskPriority(task.priority)
  const done = task.status === 'termine'

  return (
    <div className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <input
        type="checkbox"
        checked={done}
        onChange={e => onUpdate(task.id, { status: e.target.checked ? 'termine' : 'a_faire' })}
        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--ember)', flexShrink: 0 }}
      />

      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 14, color: done ? 'var(--ink-4)' : 'var(--ink)', textDecoration: done ? 'line-through' : 'none' }}>
          {task.title}
        </div>
        {(task.mission || task.description) && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
            {task.mission?.title}
            {task.mission && task.description ? ' · ' : ''}
            {task.description}
          </div>
        )}
      </div>

      {task.priority !== 'normale' && (
        <span style={{ fontSize: 11, color: pr.fg, fontWeight: 500 }}>{pr.label}</span>
      )}

      <select
        className="field"
        style={{ fontSize: 12, padding: '3px 6px', width: 110 }}
        value={task.assigned_to ?? ''}
        onChange={e => onUpdate(task.id, { assigned_to: e.target.value || null })}
      >
        <option value="">Non assignée</option>
        {members.map(m => (
          <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>
        ))}
      </select>

      <select
        className="field"
        style={{ fontSize: 12, padding: '3px 6px', width: 100, background: st.bg, color: st.fg }}
        value={task.status}
        onChange={e => onUpdate(task.id, { status: e.target.value })}
      >
        {TASK_STATUSES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
      </select>

      {task.due_date && (
        <span style={{ fontSize: 12, color: task.due_date < new Date().toISOString().split('T')[0] && !done ? 'var(--bad)' : 'var(--ink-3)', whiteSpace: 'nowrap' }}>
          {new Date(task.due_date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </span>
      )}

      <button
        onClick={() => onRemove(task.id)}
        title="Supprimer"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', padding: 4, flexShrink: 0 }}
      >
        <Icon name="trash" size={13} />
      </button>
    </div>
  )
}

function NewTaskForm({ members, onCreate, missionId }) {
  const [fields, setFields] = useState({ title: '', assignedTo: '', dueDate: '', priority: 'normale' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setFields(p => ({ ...p, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    if (!fields.title.trim() || saving) return
    setSaving(true)
    try {
      await onCreate({ ...fields, missionId })
      setFields({ title: '', assignedTo: '', dueDate: '', priority: 'normale' })
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} className="card p-3" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        className="field"
        style={{ flex: 1, minWidth: 220, fontSize: 13 }}
        placeholder="Nouvelle tâche…"
        value={fields.title}
        onChange={e => set('title', e.target.value)}
      />
      <select className="field" style={{ fontSize: 13, width: 150 }} value={fields.assignedTo} onChange={e => set('assignedTo', e.target.value)}>
        <option value="">Non assignée</option>
        {members.map(m => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
      </select>
      <select className="field" style={{ fontSize: 13, width: 110 }} value={fields.priority} onChange={e => set('priority', e.target.value)}>
        {PRIORITIES.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
      </select>
      <input className="field" type="date" style={{ fontSize: 13, width: 150 }} value={fields.dueDate} onChange={e => set('dueDate', e.target.value)} />
      <button type="submit" className="btn-ember flex items-center gap-1.5" disabled={!fields.title.trim() || saving}>
        <Icon name="plus" size={13} /> Ajouter
      </button>
    </form>
  )
}

/** Réutilisée telle quelle dans l'onglet Tâches d'une mission. */
export function TaskList({ missionId, mine = false }) {
  const { tasks, loading, error, create, update, remove } = useTasks(missionId ? { missionId } : { mine })
  const { members } = useMembers()
  const [showDone, setShowDone] = useState(false)

  const groups = groupByDue(tasks)
  const done = tasks.filter(t => t.status === 'termine' || t.status === 'annule')

  if (loading) return <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>Chargement…</div>
  if (error) return <div style={{ color: 'var(--bad)', fontSize: 14 }}>{error}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <NewTaskForm members={members} onCreate={create} missionId={missionId} />

      {groups.length === 0 && done.length === 0 && (
        <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
          Aucune tâche. Ajoutez-en une ci-dessus.
        </div>
      )}

      {groups.map(g => (
        <div key={g.key}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: g.urgent ? 'var(--bad)' : 'var(--ink-4)', marginBottom: 8, fontWeight: 500 }}>
            {g.label} · {g.tasks.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {g.tasks.map(t => (
              <TaskRow key={t.id} task={t} members={members} onUpdate={update} onRemove={remove} />
            ))}
          </div>
        </div>
      ))}

      {done.length > 0 && (
        <div>
          <button className="btn-ghost flex items-center gap-1.5" style={{ fontSize: 13 }} onClick={() => setShowDone(v => !v)}>
            <Icon name={showDone ? 'chevronD' : 'chevronR'} size={13} />
            {done.length} tâche{done.length > 1 ? 's' : ''} terminée{done.length > 1 ? 's' : ''}
          </button>
          {showDone && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {done.map(t => (
                <TaskRow key={t.id} task={t} members={members} onUpdate={update} onRemove={remove} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TasksPage() {
  const [scope, setScope] = useState('mine')

  return (
    <div className="px-8 py-6 fade-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 12, flexWrap: 'wrap' }}>
        <h1 className="page-title">Tâches</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={scope === 'mine' ? 'btn-ember' : 'btn-ghost'} style={{ fontSize: 13 }} onClick={() => setScope('mine')}>Mes tâches</button>
          <button className={scope === 'all' ? 'btn-ember' : 'btn-ghost'} style={{ fontSize: 13 }} onClick={() => setScope('all')}>Toutes</button>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 22 }}>
        Rangées par échéance&nbsp;: ce qui est en retard d'abord.
      </p>

      {/* La clé force le remontage : les deux vues ont des données distinctes. */}
      <TaskList key={scope} mine={scope === 'mine'} />
    </div>
  )
}
