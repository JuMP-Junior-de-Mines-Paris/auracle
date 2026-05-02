import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

export function useContactStats() {
  const [stats, setStats] = useState({ total: 0, aContacter: 0, contacte: 0, repondu: 0, travaille: 0 })

  const refetch = useCallback(async () => {
    const [t, a, c, r, tr] = await Promise.all([
      supabase.from('contacts').select('*', { count: 'exact', head: true }),
      supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('status', 'à contacter'),
      supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('status', 'contacté'),
      supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('status', 'répondu'),
      supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('status', 'travaillé'),
    ])
    setStats({
      total:      t.count  ?? 0,
      aContacter: a.count  ?? 0,
      contacte:   c.count  ?? 0,
      repondu:    r.count  ?? 0,
      travaille:  tr.count ?? 0,
    })
  }, [])

  useEffect(() => { refetch() }, [refetch])

  return { stats, refetch }
}
