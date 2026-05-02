import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useContacts({ page = 1, pageSize = 50, query = '' } = {}) {
  const [contacts, setContacts] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let q = supabase.from('contacts').select('*', { count: 'exact' }).order('nom')

    if (query.trim()) {
      const s = query.trim()
      q = q.or(
        `nom.ilike.%${s}%,prenom.ilike.%${s}%,entreprise_actuelle.ilike.%${s}%,ville.ilike.%${s}%`
      )
    }

    q = q.range(from, to)

    const { data, count, error: err } = await q
    if (err) setError(err.message)
    else {
      setContacts(data ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [page, pageSize, query])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  async function createContact(contactData) {
    const { data, error: err } = await supabase
      .from('contacts')
      .insert(contactData)
      .select()
      .single()
    if (err) throw err
    return data
  }

  async function updateTags(contactIds, tagName) {
    const { error: err } = await supabase.rpc('add_tag_to_contacts', {
      contact_ids: contactIds,
      tag_name: tagName,
    })
    if (err) throw err
    await fetchContacts()
  }

  async function updateStatus(id, status) {
    const { error: err } = await supabase
      .from('contacts')
      .update({ status: status ?? null })
      .eq('id', id)
    if (err) throw err
    setContacts(prev => prev.map(c => c.id === id ? { ...c, status: status ?? null } : c))
  }

  async function removeTag(contactId, tagName) {
    const { error: err } = await supabase.rpc('remove_tag_from_contact', {
      contact_id: contactId,
      tag_name: tagName,
    })
    if (err) throw err
    setContacts(prev =>
      prev.map(c =>
        c.id === contactId
          ? { ...c, tags: (c.tags ?? []).filter(t => t !== tagName) }
          : c
      )
    )
  }

  return { contacts, total, loading, error, createContact, updateStatus, updateTags, removeTag, refetch: fetchContacts }
}
