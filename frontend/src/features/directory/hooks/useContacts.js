import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { describeError } from '../../../shared/lib/errors'

/**
 * Recherche et pagination de l'annuaire.
 *
 * Passe par la fonction search_contacts() plutôt que de composer un filtre
 * PostgREST : le terme y est un paramètre, jamais concaténé. L'ancienne
 * version l'interpolait dans une chaîne `.or(...)`, si bien que chercher
 * « Dupont, Jean » cassait le filtre (F-07).
 *
 * Côté base, la fonction interroge une seule colonne indexée en trigrammes.
 * Sur les 15 737 fiches réelles : 0,17 ms au lieu de 67 ms pour la version
 * qui faisait un OR sur cinq colonnes.
 */
export function useContacts({
  page = 1, pageSize = 50, query = '', statusFilter = undefined,
  contactedBy = null, onlyUncontacted = false,
} = {}) {
  const [contacts, setContacts] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase.rpc('search_contacts', {
      q: query.trim() || null,
      // undefined = pas de filtre ; null = « sans statut », qui est un filtre.
      status_filter: statusFilter ?? null,
      only_null_status: statusFilter === null,
      contacted_by: contactedBy,
      only_uncontacted: onlyUncontacted,
      lim: pageSize,
      off: (page - 1) * pageSize,
    })

    if (err) {
      setError(describeError(err))
      setContacts([])
      setTotal(0)
    } else {
      // La fonction renvoie { contact, total } par ligne ; le total est
      // identique partout (fenêtre count(*) over ()).
      // Chaque ligne porte la fiche et son historique de démarche : on les
      // fusionne pour que l'affichage n'ait pas à jongler entre les deux.
      const rows = data ?? []
      setError(null)
      setContacts(rows.map(r => ({
        ...r.contact,
        assignee_id: r.assignee_id,
        assignee_nom: r.assignee_nom,
        last_contact_at: r.last_contact_at,
        last_contact_by: r.last_contact_by,
        last_contact_nom: r.last_contact_nom,
        last_channel: r.last_channel,
        nb_interactions: Number(r.nb_interactions ?? 0),
      })))
      setTotal(rows.length ? Number(rows[0].total) : 0)
    }
    setLoading(false)
  }, [page, pageSize, query, statusFilter, contactedBy, onlyUncontacted])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  async function createContact(contactData) {
    const { data, error: err } = await supabase
      .from('contacts').insert(contactData).select().single()
    if (err) throw new Error(describeError(err))
    await fetchContacts()
    return data
  }

  async function updateContact(id, contactData) {
    const { data, error: err } = await supabase
      .from('contacts').update(contactData).eq('id', id).select().single()
    if (err) throw new Error(describeError(err))
    setContacts(prev => prev.map(c => (c.id === id ? data : c)))
    return data
  }

  async function updateTags(contactIds, tagName) {
    const { error: err } = await supabase.rpc('add_tag_to_contacts', {
      contact_ids: contactIds, tag_name: tagName,
    })
    if (err) throw new Error(describeError(err))
    await fetchContacts()
  }

  async function updateStatus(id, status) {
    const { error: err } = await supabase
      .from('contacts').update({ status: status ?? null }).eq('id', id)
    if (err) throw new Error(describeError(err))
    setContacts(prev => prev.map(c => (c.id === id ? { ...c, status: status ?? null } : c)))
  }

  async function removeTag(contactId, tagName) {
    const { error: err } = await supabase.rpc('remove_tag_from_contact', {
      contact_id: contactId, tag_name: tagName,
    })
    if (err) throw new Error(describeError(err))
    setContacts(prev => prev.map(c =>
      c.id === contactId ? { ...c, tags: (c.tags ?? []).filter(t => t !== tagName) } : c
    ))
  }

  return { contacts, total, loading, error, createContact, updateContact, updateStatus, updateTags, removeTag, refetch: fetchContacts }
}
