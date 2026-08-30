import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { describeError } from '../../../shared/lib/errors'

/**
 * Historique des démarches d'un contact.
 *
 * La table est en ajout seul : on n'écrase jamais un statut, on enregistre
 * ce qui a été fait. Le statut du contact est recalculé par trigger, ce qui
 * évite qu'il affirme une démarche dont rien ne garde la trace.
 */
export function useInteractions(contactId) {
  const [interactions, setInteractions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    if (!contactId) { setInteractions([]); setLoading(false); return }
    setLoading(true)
    const { data, error: err } = await supabase
      .from('contact_interactions')
      .select('*, author:profiles!created_by(prenom, nom), list:prospecting_lists(name)')
      .eq('contact_id', contactId)
      .order('occurred_at', { ascending: false })

    setError(err ? describeError(err) : null)
    setInteractions(err ? [] : (data ?? []))
    setLoading(false)
  }, [contactId])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function log(fields) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: err } = await supabase
      .from('contact_interactions')
      .insert({
        contact_id: contactId,
        list_id: fields.listId ?? null,
        channel: fields.channel,
        direction: fields.direction ?? 'sortant',
        occurred_at: fields.occurredAt ?? new Date().toISOString(),
        outcome: fields.outcome ?? null,
        summary: fields.summary?.trim() || null,
        next_action_at: fields.nextActionAt || null,
        next_action: fields.nextAction?.trim() || null,
        created_by: user.id,
      })
      .select('*, author:profiles!created_by(prenom, nom), list:prospecting_lists(name)')
      .single()

    if (err) throw new Error(describeError(err))
    setInteractions(prev => [data, ...prev])
    return data
  }

  async function remove(id) {
    const { error: err } = await supabase.from('contact_interactions').delete().eq('id', id)
    if (err) throw new Error(describeError(err))
    setInteractions(prev => prev.filter(i => i.id !== id))
  }

  return { interactions, loading, error, log, remove, refetch: fetchAll }
}

/**
 * Responsable courant d'un contact — la garantie anti-collision.
 *
 * L'unicité partielle en base fait le vrai travail ; claim_contact() la
 * traduit en message nommant le titulaire, plutôt qu'en violation d'index.
 */
export function useAssignment(contactId) {
  const [assignment, setAssignment] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchOne = useCallback(async () => {
    if (!contactId) { setAssignment(null); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('contact_assignments')
      .select('*, assignee:profiles!assigned_to(prenom, nom, email)')
      .eq('contact_id', contactId)
      .is('released_at', null)
      .maybeSingle()
    setAssignment(data ?? null)
    setLoading(false)
  }, [contactId])

  useEffect(() => { fetchOne() }, [fetchOne])

  async function claim({ force = false } = {}) {
    const { error } = await supabase.rpc('claim_contact', { p_contact_id: contactId, p_force: force })
    if (error) throw new Error(describeError(error))
    await fetchOne()
  }

  async function release() {
    const { error } = await supabase.rpc('release_contact', { p_contact_id: contactId })
    if (error) throw new Error(describeError(error))
    await fetchOne()
  }

  return { assignment, loading, claim, release, refetch: fetchOne }
}
