import { useState, useEffect } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useContactNotes(contactId) {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!contactId) return
    setLoading(true)
    supabase
      .from('contact_notes')
      .select('*, author:profiles!created_by(prenom, nom, email)')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setNotes(data ?? [])
        setLoading(false)
      })
  }, [contactId])

  async function addNote(content) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('contact_notes')
      .insert({ contact_id: contactId, content, created_by: user.id })
      .select('*, author:profiles!created_by(prenom, nom, email)')
      .single()
    if (error) throw error
    setNotes(prev => [data, ...prev])
    return data
  }

  async function deleteNote(id) {
    const { error } = await supabase.from('contact_notes').delete().eq('id', id)
    if (error) throw error
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  return { notes, loading, addNote, deleteNote }
}
