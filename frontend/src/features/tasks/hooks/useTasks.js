import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { describeError } from '../../../shared/lib/errors'

export const TASK_STATUSES = [
  { code: 'a_faire',  label: 'À faire',   bg: '#f3f4f6', fg: '#4b5563' },
  { code: 'en_cours', label: 'En cours',  bg: '#dbeafe', fg: '#1d4ed8' },
  { code: 'en_revue', label: 'En revue',  bg: '#fef3c7', fg: '#b45309' },
  { code: 'termine',  label: 'Terminée',  bg: '#dcfce7', fg: '#15803d' },
  { code: 'annule',   label: 'Annulée',   bg: '#f9fafb', fg: '#9ca3af' },
]

export const PRIORITIES = [
  { code: 'basse',   label: 'Basse',   fg: '#9ca3af' },
  { code: 'normale', label: 'Normale', fg: '#6b7280' },
  { code: 'haute',   label: 'Haute',   fg: '#c2410c' },
  { code: 'urgente', label: 'Urgente', fg: '#b91c1c' },
]

export const taskStatus = c => TASK_STATUSES.find(s => s.code === c) ?? TASK_STATUSES[0]
export const taskPriority = c => PRIORITIES.find(p => p.code === c) ?? PRIORITIES[1]

const SELECT = '*, assignee:profiles!assigned_to(prenom, nom), mission:missions(title)'

/**
 * Tâches, filtrées par mission ou par responsable.
 *
 * `scope` vaut { missionId } pour l'onglet d'une mission, { mine: true }
 * pour « Mes tâches », ou {} pour tout voir.
 */
export function useTasks(scope = {}) {
  const { missionId, mine } = scope
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('tasks').select(SELECT)

    if (missionId) q = q.eq('mission_id', missionId)
    if (mine) {
      const { data: { user } } = await supabase.auth.getUser()
      q = q.eq('assigned_to', user?.id ?? '00000000-0000-0000-0000-000000000000')
    }

    const { data, error: err } = await q
      .order('position')
      .order('created_at', { ascending: false })

    setError(err ? describeError(err) : null)
    setTasks(err ? [] : (data ?? []))
    setLoading(false)
  }, [missionId, mine])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  async function create(fields) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: err } = await supabase
      .from('tasks')
      .insert({
        title: fields.title.trim(),
        description: fields.description?.trim() || null,
        mission_id: fields.missionId ?? missionId ?? null,
        assigned_to: fields.assignedTo || null,
        status: fields.status ?? 'a_faire',
        priority: fields.priority ?? 'normale',
        due_date: fields.dueDate || null,
        created_by: user.id,
      })
      .select(SELECT)
      .single()
    if (err) throw new Error(describeError(err))
    setTasks(prev => [data, ...prev])
    return data
  }

  async function update(id, fields) {
    const { data, error: err } = await supabase
      .from('tasks').update(fields).eq('id', id).select(SELECT).single()
    if (err) throw new Error(describeError(err))
    setTasks(prev => prev.map(t => (t.id === id ? data : t)))
    return data
  }

  async function remove(id) {
    const { error: err } = await supabase.from('tasks').delete().eq('id', id)
    if (err) throw new Error(describeError(err))
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  return { tasks, loading, error, create, update, remove, refetch: fetchTasks }
}

/** Regroupe par échéance — l'ordre dans lequel on traite sa journée. */
export function groupByDue(tasks) {
  const today = new Date().toISOString().split('T')[0]
  const inAWeek = new Date(Date.now() + 7 * 864e5).toISOString().split('T')[0]

  const buckets = [
    { key: 'en_retard',     label: 'En retard',      urgent: true,  tasks: [] },
    { key: 'aujourdhui',    label: "Aujourd'hui",    urgent: true,  tasks: [] },
    { key: 'cette_semaine', label: 'Cette semaine',  urgent: false, tasks: [] },
    { key: 'plus_tard',     label: 'Plus tard',      urgent: false, tasks: [] },
    { key: 'sans_echeance', label: 'Sans échéance',  urgent: false, tasks: [] },
  ]
  const at = k => buckets.find(b => b.key === k).tasks

  for (const t of tasks) {
    if (t.status === 'termine' || t.status === 'annule') continue
    if (!t.due_date) at('sans_echeance').push(t)
    else if (t.due_date < today) at('en_retard').push(t)
    else if (t.due_date === today) at('aujourdhui').push(t)
    else if (t.due_date <= inAWeek) at('cette_semaine').push(t)
    else at('plus_tard').push(t)
  }

  return buckets.filter(b => b.tasks.length > 0)
}
