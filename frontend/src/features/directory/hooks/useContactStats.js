import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'

/**
 * Compteurs par statut de l'annuaire.
 *
 * Une seule RPC au lieu des cinq requêtes `count` d'origine, qui
 * parcouraient la table entière chacune (F-21). La forme renvoyée est
 * { <code_statut>: n, __null__: n, __total__: n }.
 */
export function useContactStats() {
  const [stats, setStats] = useState({ __total__: 0 })

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.rpc('contact_status_counts')
    // Sans la RPC (migration 011 non appliquée), on garde des compteurs à
    // zéro plutôt que de faire planter l'annuaire.
    setStats(error ? { __total__: 0 } : (data ?? { __total__: 0 }))
  }, [])

  useEffect(() => { refetch() }, [refetch])

  return { stats, refetch }
}
