import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useProspectingLists() {
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchLists = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('prospecting_lists')
      .select('*, prospecting_list_contacts(count)')
      .order('created_at', { ascending: false })
    setLists(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchLists() }, [fetchLists])

  async function createList(name) {
    const { data, error } = await supabase
      .from('prospecting_lists')
      .insert({ name })
      .select()
      .single()
    if (error) throw error
    setLists(prev => [{ ...data, prospecting_list_contacts: [{ count: 0 }] }, ...prev])
    return data
  }

  async function addContactToList(listId, contactId) {
    const { error } = await supabase
      .from('prospecting_list_contacts')
      .insert({ list_id: listId, contact_id: contactId })
    if (error) throw error
    await fetchLists()
  }

  async function removeContactFromList(listId, contactId) {
    const { error } = await supabase
      .from('prospecting_list_contacts')
      .delete()
      .match({ list_id: listId, contact_id: contactId })
    if (error) throw error
  }

  async function fetchListContacts(listId) {
    const { data, error } = await supabase
      .from('prospecting_list_contacts')
      .select('contacts(*)')
      .eq('list_id', listId)
    if (error) throw error
    return (data ?? []).map(row => row.contacts)
  }

  async function addContactsToList(listId, contactIds) {
    const rows = contactIds.map(contactId => ({ list_id: listId, contact_id: contactId }))
    const { error } = await supabase
      .from('prospecting_list_contacts')
      .upsert(rows, { onConflict: 'list_id,contact_id', ignoreDuplicates: true })
    if (error) throw error
    await fetchLists()
  }

  async function shareList(listId, userIds) {
    const { data: { user } } = await supabase.auth.getUser()
    const rows = userIds.map(uid => ({ list_id: listId, shared_with: uid, shared_by: user.id }))
    const { error } = await supabase.from('list_shares').insert(rows)
    if (error) throw error
  }

  return {
    lists,
    loading,
    createList,
    addContactToList,
    addContactsToList,
    removeContactFromList,
    fetchListContacts,
    shareList,
    refetch: fetchLists,
  }
}
