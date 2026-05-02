import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useProspectingLists() {
  const [lists, setLists] = useState([])
  const [sharedLists, setSharedLists] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchLists = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const [ownRes, shareRes] = await Promise.all([
      supabase
        .from('prospecting_lists')
        .select('*, prospecting_list_contacts(count)')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('list_shares')
        .select('list_id, prospecting_lists(*, prospecting_list_contacts(count)), sharer:profiles!shared_by(prenom, nom)')
        .eq('shared_with', user.id),
    ])

    setLists(ownRes.data ?? [])
    setSharedLists(
      (shareRes.data ?? []).map(row => ({
        ...row.prospecting_lists,
        sharedBy: row.sharer,
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => { fetchLists() }, [fetchLists])

  async function createList(name) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('prospecting_lists')
      .insert({ name, created_by: user.id })
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

  async function addContactsToList(listId, contactIds) {
    const rows = contactIds.map(contactId => ({ list_id: listId, contact_id: contactId }))
    const { error } = await supabase
      .from('prospecting_list_contacts')
      .upsert(rows, { onConflict: 'list_id,contact_id', ignoreDuplicates: true })
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

  async function shareList(listId, userIds) {
    const { data: { user } } = await supabase.auth.getUser()
    const rows = userIds.map(uid => ({ list_id: listId, shared_with: uid, shared_by: user.id }))
    const { error } = await supabase.from('list_shares').insert(rows)
    if (error) throw error
    await fetchLists()
  }

  async function revokeShare(listId, userId) {
    const { error } = await supabase
      .from('list_shares')
      .delete()
      .match({ list_id: listId, shared_with: userId })
    if (error) throw error
    await fetchLists()
  }

  async function fetchListShares(listId) {
    const { data, error } = await supabase
      .from('list_shares')
      .select('shared_with, member:profiles!shared_with(prenom, nom, email)')
      .eq('list_id', listId)
    if (error) throw error
    return (data ?? []).map(row => ({ id: row.shared_with, ...row.member }))
  }

  return {
    lists, sharedLists, loading,
    createList, addContactToList, addContactsToList,
    removeContactFromList, fetchListContacts,
    shareList, revokeShare, fetchListShares,
    refetch: fetchLists,
  }
}
