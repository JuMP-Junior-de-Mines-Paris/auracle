import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { describeError } from '../../../shared/lib/errors'

// `value` est la colonne missions.category (migration 023).
export const CATEGORIES = [
  { value: 'convention_etude', label: 'Convention d’étude' },
  { value: 'mission', label: 'Mission' },
]

export const categoryLabel = value => CATEGORIES.find(c => c.value === value)?.label ?? value

/** Les missions archivées : conventions enregistrées depuis le générateur, et missions rangées à la main. */
export function useArchives() {
  const [archives, setArchives] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchArchives = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('missions')
      .select('*, chef:profiles!chef_de_projet(prenom, nom)')
      .eq('status', 'archived')
      .order('created_at', { ascending: false })
    setError(err ? describeError(err) : null)
    setArchives(err ? [] : (data ?? []))
    setLoading(false)
  }, [])

  useEffect(() => { fetchArchives() }, [fetchArchives])

  return { archives, loading, error, refetch: fetchArchives }
}
