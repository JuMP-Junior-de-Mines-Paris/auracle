import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../shared/lib/supabase'
import { describeError } from '../../../shared/lib/errors'

/**
 * Progression de la prospection : chiffres de tête, entonnoir, rythme
 * hebdomadaire et détail par membre.
 *
 * Tout est agrégé en base. Rapatrier 15 737 fiches pour compter dessus
 * côté navigateur coûterait des secondes et se dégraderait avec l'annuaire.
 */
export function useProspectionStats({ semaines = 12 } = {}) {
  const [overview, setOverview] = useState(null)
  const [funnel, setFunnel] = useState([])
  const [activity, setActivity] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [o, f, a, m] = await Promise.all([
      supabase.rpc('prospection_overview'),
      supabase.rpc('prospection_funnel'),
      supabase.rpc('prospection_activity', { semaines }),
      supabase.rpc('prospection_by_member'),
    ])

    const err = o.error || f.error || a.error || m.error
    setError(err ? describeError(err) : null)
    setOverview(o.data ?? null)
    setFunnel(f.data ?? [])
    setActivity((a.data ?? []).map(s => ({ ...s, demarches: Number(s.demarches) })))
    setMembers((m.data ?? []).map(x => ({
      ...x,
      demarches: Number(x.demarches),
      contacts_touches: Number(x.contacts_touches),
      en_cours: Number(x.en_cours),
      en_discussion: Number(x.en_discussion),
      rdv: Number(x.rdv),
      convertis: Number(x.convertis),
      perdus: Number(x.perdus),
      relances_en_retard: Number(x.relances_en_retard),
    })))
    setLoading(false)
  }, [semaines])

  useEffect(() => { fetchAll() }, [fetchAll])

  return { overview, funnel, activity, members, loading, error, refetch: fetchAll }
}

/**
 * Taux de conversion d'un membre.
 *
 * Rapporté aux contacts qu'il porte, pas à ses démarches : relancer trois
 * fois la même personne ne doit pas faire chuter son taux.
 */
export function tauxConversion(m) {
  if (!m.contacts_touches) return null
  return m.convertis / m.contacts_touches
}

/** Membres ayant au moins agi, dans l'ordre demandé. */
export function trier(members, cle) {
  const valeur = m => (cle === 'nom' ? 0 : m[cle] ?? 0)
  return [...members].sort((a, b) => {
    if (cle === 'nom') return (a.membre_nom ?? '').localeCompare(b.membre_nom ?? '', 'fr')
    const d = valeur(b) - valeur(a)
    return d !== 0 ? d : (a.membre_nom ?? '').localeCompare(b.membre_nom ?? '', 'fr')
  })
}
