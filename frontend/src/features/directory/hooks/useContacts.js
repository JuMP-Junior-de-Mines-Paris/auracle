import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useContacts() {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('contacts').select('*').order('nom')
    if (error) setError(error.message)
    else setContacts(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  async function createContact(contactData) {
    const { data, error } = await supabase
      .from('contacts')
      .insert(contactData)
      .select()
      .single()
    if (error) throw error
    setContacts(prev =>
      [...prev, data].sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? ''))
    )
    return data
  }

  return { contacts, loading, error, createContact, refetch: fetchContacts }
}
