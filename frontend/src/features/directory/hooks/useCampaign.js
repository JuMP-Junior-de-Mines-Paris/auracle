import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { describeError } from '../../../shared/lib/errors'

/**
 * Une liste de prospection vue comme une campagne.
 *
 * L'état affiché vient de la jonction, pas du contact : depuis la migration
 * 013 chaque appartenance porte son propre statut, son responsable et sa
 * relance. Le même ancien élève peut donc être « converti » dans une
 * campagne et « à contacter » dans une autre (F-27).
 */
export function useCampaign(listId) {
  const [list, setList] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    if (!listId) { setLoading(false); return }
    setLoading(true)

    const [listRes, rowsRes] = await Promise.all([
      supabase.from('prospecting_lists').select('*').eq('id', listId).maybeSingle(),
      supabase
        .from('prospecting_list_contacts')
        .select('*, contact:contacts(*), assignee:profiles!assigned_to(prenom, nom)')
        .eq('list_id', listId),
    ])

    const err = listRes.error || rowsRes.error
    setError(err ? describeError(err) : null)
    setList(listRes.data ?? null)
    // Une jonction peut pointer un contact supprimé : on écarte plutôt que
    // d'afficher une carte vide.
    setRows(err ? [] : (rowsRes.data ?? []).filter(r => r.contact))
    setLoading(false)
  }, [listId])

  useEffect(() => { fetchAll() }, [fetchAll])

  /**
   * Déplacer une carte enregistre une interaction plutôt que d'écrire le
   * statut : c'est le trigger apply_interaction qui le reporte. Sans ça on
   * retomberait dans le défaut d'origine — un statut qui affirme une
   * démarche dont rien ne garde la trace (F-25).
   */
  async function moveTo(contactId, statut, { summary = null, channel = 'linkedin' } = {}) {
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('contact_interactions').insert({
      contact_id: contactId,
      list_id: listId,
      channel,
      direction: 'sortant',
      outcome: statut,
      summary,
      created_by: user.id,
    })
    if (err) throw new Error(describeError(err))

    setRows(prev => prev.map(r => (r.contact_id === contactId ? { ...r, status: statut } : r)))
  }

  async function remove(contactId) {
    const { error: err } = await supabase
      .from('prospecting_list_contacts')
      .delete()
      .match({ list_id: listId, contact_id: contactId })
    if (err) throw new Error(describeError(err))
    setRows(prev => prev.filter(r => r.contact_id !== contactId))
  }

  async function assign(contactId, profileId) {
    const { error: err } = await supabase
      .from('prospecting_list_contacts')
      .update({ assigned_to: profileId || null })
      .match({ list_id: listId, contact_id: contactId })
    if (err) throw new Error(describeError(err))
    await fetchAll()
  }

  return { list, rows, loading, error, moveTo, remove, assign, refetch: fetchAll }
}
