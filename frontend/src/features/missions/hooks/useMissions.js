import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useMissions() {
  const [missions, setMissions] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchMissions = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('missions')
      .select('*, chef:profiles!chef_de_projet(prenom, nom)')
      .order('created_at', { ascending: false })
    if (!error) setMissions(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchMissions() }, [fetchMissions])

  async function createMission(fields) {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('missions')
      .insert({ ...fields, created_by: user.id })
      .select('*, chef:profiles!chef_de_projet(prenom, nom)')
      .single()
    if (error) throw error
    setMissions(prev => [data, ...prev])
    return data
  }

  async function updateMission(id, fields) {
    const { data, error } = await supabase
      .from('missions')
      .update(fields)
      .eq('id', id)
      .select('*, chef:profiles!chef_de_projet(prenom, nom)')
      .single()
    if (error) throw error
    setMissions(prev => prev.map(m => m.id === id ? data : m))
    return data
  }

  return { missions, loading, createMission, updateMission, refetch: fetchMissions }
}
