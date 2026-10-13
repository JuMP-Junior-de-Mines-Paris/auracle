import { useEffect, useState } from 'react'
import { supabase } from '../../../shared/lib/supabase'

/**
 * Variables globales de JuMP (président, TVA, validité…), lues sur le serveur
 * pour n'être définies qu'à un seul endroit (backend/app/services/ce_globals.py).
 * Null tant qu'elles ne sont pas arrivées ; en cas d'échec le formulaire reste
 * utilisable, le serveur appliquant lui-même ces valeurs.
 */
export function useCeGlobals() {
  const [globales, setGlobales] = useState(null)

  useEffect(() => {
    let actif = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data?.session?.access_token
        if (!token) return
        const res = await fetch('/api/ce/globals', { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok && actif) setGlobales(await res.json())
      } catch { /* pas bloquant */ }
    })()
    return () => { actif = false }
  }, [])

  return globales
}
