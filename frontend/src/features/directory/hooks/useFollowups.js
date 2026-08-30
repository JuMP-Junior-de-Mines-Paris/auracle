import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { describeError } from '../../../shared/lib/errors'

/**
 * File de relances, transverse aux campagnes.
 *
 * La vue `followups` n'est pas filtrée sur l'utilisateur : le bureau doit
 * voir ce qui traîne chez tout le monde. Le filtre « les miennes » se fait
 * ici, pour que la même requête serve les deux vues.
 */
export function useFollowups({ mine = true } = {}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('followups').select('*').order('next_action_at')

    if (mine) {
      const { data: { user } } = await supabase.auth.getUser()
      q = q.eq('assigned_to', user?.id ?? '00000000-0000-0000-0000-000000000000')
    }

    const { data, error: err } = await q
    setError(err ? describeError(err) : null)
    setRows(err ? [] : (data ?? []))
    setLoading(false)
  }, [mine])

  useEffect(() => { fetchRows() }, [fetchRows])

  // Trois seaux, dans l'ordre où on traite sa journée.
  const buckets = [
    { key: 'en_retard',  label: 'En retard',    urgent: true,  rows: [] },
    { key: 'aujourdhui', label: "Aujourd'hui",  urgent: true,  rows: [] },
    { key: 'a_venir',    label: 'À venir',      urgent: false, rows: [] },
  ]
  for (const r of rows) {
    const b = buckets.find(x => x.key === r.echeance)
    if (b) b.rows.push(r)
  }

  return {
    rows,
    buckets: buckets.filter(b => b.rows.length > 0),
    enRetard: buckets[0].rows.length,
    loading,
    error,
    refetch: fetchRows,
  }
}
